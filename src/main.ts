import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  moment,
  TFile,
} from "obsidian";
import { WorkLogSettings, WorkLogSettingTab, DEFAULT_SETTINGS } from "./settings";
import { FileManager } from "./fileManager";
import { CalendarView, CALENDAR_VIEW_TYPE } from "./calendarView";
import { SearchView, SEARCH_VIEW_TYPE, getMonthStats } from "./statistics";

export default class WorkLogPlugin extends Plugin {
  settings: WorkLogSettings;
  fileManager: FileManager;

  async onload() {
    await this.loadSettings();

    this.fileManager = new FileManager(this.app, this.settings);

    // ─── 注册视图 ────────────────────────────────────────────────
    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));
    this.registerView(SEARCH_VIEW_TYPE, (leaf) => new SearchView(leaf, this));

    // ─── 设置 Tab ───────────────────────────────────────────────
    this.addSettingTab(new WorkLogSettingTab(this.app, this));

    // ─── Ribbon 图标 ─────────────────────────────────────────────
    const ribbonIcon = this.addRibbonIcon("calendar-days", "工作日志：打开今日工作日志", async () => {
      await this.openTodayLog();
    });

    // 右键快捷菜单
    ribbonIcon.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.showRibbonContextMenu(e);
    });

    // ─── 命令 ────────────────────────────────────────────────────
    this.addCommand({
      id: "open-today",
      name: "打开今日工作日志",
      callback: async () => {
        await this.openTodayLog();
      },
    });

    this.addCommand({
      id: "open-calendar",
      name: "打开日历视图",
      callback: async () => {
        await this.activateCalendarView();
      },
    });

    this.addCommand({
      id: "jump-to-date",
      name: "跳转到指定日期",
      callback: () => {
        new DatePickerModal(this.app, async (date) => {
          await this.fileManager.openAndNavigateToDate(date);
        }).open();
      },
    });

    this.addCommand({
      id: "insert-timestamp",
      name: "插入当前时间到工作日志",
      callback: async () => {
        await this.fileManager.insertTimestampEntry();
      },
    });

    this.addCommand({
      id: "repair-structure",
      name: "修复当前年度文件结构",
      callback: async () => {
        const year = moment().year();
        await this.fileManager.repairYearStructure(year);
      },
    });

    this.addCommand({
      id: "repair-structure-year",
      name: "修复指定年份文件结构",
      callback: () => {
        new YearPickerModal(this.app, async (year) => {
          await this.fileManager.repairYearStructure(year);
        }).open();
      },
    });

    this.addCommand({
      id: "regenerate-year-danger",
      name: "重新生成当前年度文件（危险：将清空所有内容）",
      callback: () => {
        const year = moment().year();
        new ConfirmModal(
          this.app,
          `⚠️ 危险操作`,
          `即将重新生成 ${year} 年工作日志文件，这将清除所有现有工作内容，此操作无法撤销！\n\n确认继续吗？`,
          async () => {
            const filePath = this.fileManager.getFilePath(year);
            const file = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
            const content = await this.fileManager.generateFullYearContent(year);
            if (file) {
              await this.app.vault.modify(file, content);
            } else {
              await this.fileManager.getOrCreateFile(year);
            }
            this.fileManager.invalidateCache(year);
            new Notice(`${year} 年工作日志已重新生成`);
          }
        ).open();
      },
    });

    this.addCommand({
      id: "show-month-stats",
      name: "显示月度统计",
      callback: async () => {
        const now = moment();
        const stats = await getMonthStats(this, now.year(), now.month() + 1);
        new Notice(
          `📊 ${stats.year}年${stats.month}月工作统计\n` +
          `  记录天数：${stats.recordedDays} 天\n` +
          `  总条目数：${stats.totalEntries} 条\n` +
          `  总字数：${stats.totalChars} 字`,
          8000
        );
      },
    });

    this.addCommand({
      id: "export-log",
      name: "导出选中的日志范围",
      callback: () => {
        new ExportModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "search-log",
      name: "搜索工作日志",
      callback: async () => {
        await this.activateSearchView();
      },
    });

    // ─── 文件修改监听（更新缓存）────────────────────────────────
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          const yearMatch = file.basename.match(/(\d{4})/);
          if (yearMatch) {
            this.fileManager.invalidateCache(parseInt(yearMatch[1]));
          }
        }
      })
    );

    // ─── 初始化：打开今年文件（如果配置了自动生成）───────────────
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.autoGenerateYearStructure) {
        const year = moment().year();
        const filePath = this.fileManager.getFilePath(year);
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (!existing) {
          // 仅当文件不存在时才静默创建
          try {
            await this.fileManager.getOrCreateFile(year);
          } catch {
            // 忽略错误，避免影响 Obsidian 启动
          }
        }
      }

      // 自动打开日历视图（如果之前是打开的）
      if (!this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).length) {
        await this.activateCalendarView(false);
      }
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(SEARCH_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.fileManager) {
      this.fileManager.updateSettings(this.settings);
    }
    // 刷新日历视图
    this.refreshCalendarViews();
  }

  private refreshCalendarViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
      const view = leaf.view as CalendarView;
      view.refresh();
    }
  }

  // ─────────────────────────────────────────────────────
  // 核心操作
  // ─────────────────────────────────────────────────────

  async openTodayLog(): Promise<void> {
    const today = moment();
    await this.fileManager.openAndNavigateToDate(today);

    // 同步日历视图
    for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
      const view = leaf.view as CalendarView;
      await view.navigateTo(today.year(), today.month() + 1);
    }
  }

  async activateCalendarView(reveal = true): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
    if (existing.length > 0) {
      if (reveal) this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    let leaf;
    if (this.settings.calendarPosition === "right") {
      leaf = this.app.workspace.getRightLeaf(false);
    } else if (this.settings.calendarPosition === "left") {
      leaf = this.app.workspace.getLeftLeaf(false);
    } else {
      leaf = this.app.workspace.getLeaf("tab");
    }

    if (leaf) {
      await leaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
      if (reveal) this.app.workspace.revealLeaf(leaf);
    }
  }

  async activateSearchView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SEARCH_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({ type: SEARCH_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  // ─────────────────────────────────────────────────────
  // Ribbon 右键菜单
  // ─────────────────────────────────────────────────────

  private showRibbonContextMenu(e: MouseEvent): void {
    const menu = document.createElement("div");
    menu.className = "wl-context-menu";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    const items = [
      {
        text: "📅 打开今日工作日志",
        action: async () => { await this.openTodayLog(); },
      },
      {
        text: "🗓️ 打开日历视图",
        action: async () => { await this.activateCalendarView(); },
      },
      {
        text: "🔍 搜索工作日志",
        action: async () => { await this.activateSearchView(); },
      },
      {
        text: "🔧 修复当前年度结构",
        action: async () => { await this.fileManager.repairYearStructure(moment().year()); },
      },
    ];

    for (const item of items) {
      const el = menu.createDiv({ cls: "wl-context-item", text: item.text });
      el.addEventListener("click", async () => {
        document.body.removeChild(menu);
        await item.action();
      });
    }

    document.body.appendChild(menu);
    const close = () => {
      if (document.body.contains(menu)) document.body.removeChild(menu);
      document.removeEventListener("click", close);
    };
    setTimeout(() => document.addEventListener("click", close), 0);
  }
}

// ─────────────────────────────────────────────────────────────
// Modal：日期选择器
// ─────────────────────────────────────────────────────────────

class DatePickerModal extends Modal {
  private onConfirm: (date: moment.Moment) => void;

  constructor(app: App, onConfirm: (date: moment.Moment) => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "跳转到指定日期" });

    const inputEl = contentEl.createEl("input", {
      type: "date",
      cls: "wl-date-input",
      value: moment().format("YYYY-MM-DD"),
    });

    const btnRow = contentEl.createDiv("wl-modal-btns");
    const confirmBtn = btnRow.createEl("button", { cls: "mod-cta", text: "跳转" });
    const cancelBtn = btnRow.createEl("button", { text: "取消" });

    confirmBtn.addEventListener("click", () => {
      const val = inputEl.value;
      const m = moment(val, "YYYY-MM-DD", true);
      if (m.isValid()) {
        this.close();
        this.onConfirm(m);
      } else {
        new Notice("无效的日期格式");
      }
    });

    cancelBtn.addEventListener("click", () => this.close());

    // 回车确认
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmBtn.click();
    });

    inputEl.focus();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─────────────────────────────────────────────────────────────
// Modal：年份选择器
// ─────────────────────────────────────────────────────────────

class YearPickerModal extends Modal {
  private onConfirm: (year: number) => void;

  constructor(app: App, onConfirm: (year: number) => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "选择年份" });

    const select = contentEl.createEl("select", { cls: "wl-year-sel" });
    const currentYear = moment().year();
    for (let y = currentYear - 5; y <= currentYear + 2; y++) {
      const opt = select.createEl("option", { value: String(y), text: String(y) });
      if (y === currentYear) opt.selected = true;
    }

    const btnRow = contentEl.createDiv("wl-modal-btns");
    const confirmBtn = btnRow.createEl("button", { cls: "mod-cta", text: "修复" });
    const cancelBtn = btnRow.createEl("button", { text: "取消" });

    confirmBtn.addEventListener("click", () => {
      const year = parseInt(select.value);
      this.close();
      this.onConfirm(year);
    });

    cancelBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─────────────────────────────────────────────────────────────
// Modal：危险操作确认
// ─────────────────────────────────────────────────────────────

class ConfirmModal extends Modal {
  private title: string;
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, title: string, message: string, onConfirm: () => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title, cls: "wl-danger-title" });

    const msgEl = contentEl.createDiv({ cls: "wl-confirm-msg" });
    this.message.split("\n").forEach((line) => {
      msgEl.createDiv({ text: line });
    });

    const btnRow = contentEl.createDiv("wl-modal-btns");
    const confirmBtn = btnRow.createEl("button", { cls: "mod-warning", text: "确认执行（不可撤销）" });
    const cancelBtn = btnRow.createEl("button", { cls: "mod-cta", text: "取消" });

    confirmBtn.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
    cancelBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─────────────────────────────────────────────────────────────
// Modal：导出
// ─────────────────────────────────────────────────────────────

class ExportModal extends Modal {
  private plugin: WorkLogPlugin;

  constructor(app: App, plugin: WorkLogPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "导出工作日志" });

    const now = moment();

    // 年份
    const yearRow = contentEl.createDiv("wl-form-row");
    yearRow.createEl("label", { text: "年份：" });
    const yearSel = yearRow.createEl("select");
    for (let y = now.year() - 5; y <= now.year(); y++) {
      const opt = yearSel.createEl("option", { value: String(y), text: String(y) });
      if (y === now.year()) opt.selected = true;
    }

    // 范围
    const rangeRow = contentEl.createDiv("wl-form-row");
    rangeRow.createEl("label", { text: "范围：" });
    const rangeSel = rangeRow.createEl("select");
    rangeSel.createEl("option", { value: "year", text: "全年" });
    for (let m = 1; m <= 12; m++) {
      const names = ["", "1月", "2月", "3月", "4月", "5月", "6月",
        "7月", "8月", "9月", "10月", "11月", "12月"];
      rangeSel.createEl("option", { value: String(m), text: names[m] });
    }
    // 默认选当前月
    rangeSel.value = String(now.month() + 1);

    // 格式
    const fmtRow = contentEl.createDiv("wl-form-row");
    fmtRow.createEl("label", { text: "格式：" });
    const fmtSel = fmtRow.createEl("select");
    fmtSel.createEl("option", { value: "markdown", text: "Markdown (.md)" });
    fmtSel.createEl("option", { value: "html", text: "HTML (.html)" });
    fmtSel.createEl("option", { value: "json", text: "JSON (.json)" });

    const btnRow = contentEl.createDiv("wl-modal-btns");
    const exportBtn = btnRow.createEl("button", { cls: "mod-cta", text: "导出" });
    const cancelBtn = btnRow.createEl("button", { text: "取消" });

    exportBtn.addEventListener("click", async () => {
      const year = parseInt(yearSel.value);
      const rangeVal = rangeSel.value;
      const fmt = fmtSel.value as "markdown" | "html" | "json";
      const month = rangeVal === "year" ? undefined : parseInt(rangeVal);

      const content = await this.plugin.fileManager.exportRange(year, fmt, month);
      if (!content) {
        new Notice("未找到对应的工作日志文件");
        return;
      }

      const ext = fmt === "markdown" ? "md" : fmt;
      const suffix = month ? `-${month}月` : "";
      const fileName = `${year}工作日志${suffix}.${ext}`;
      const filePath = `${this.plugin.settings.logDirectory}/${fileName}`;

      await this.plugin.app.vault.adapter.write(filePath, content);
      new Notice(`已导出到：${filePath}`);
      this.close();
    });

    cancelBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
