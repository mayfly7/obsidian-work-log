import { ItemView, WorkspaceLeaf, moment } from "obsidian";
import type WorkLogPlugin from "./main";
import { isSameDay } from "./dateUtils";

export const CALENDAR_VIEW_TYPE = "work-log-calendar";

export class CalendarView extends ItemView {
  private plugin: WorkLogPlugin;
  private currentYear: number;
  private currentMonth: number; // 1-12
  private datesWithContent: Set<string> = new Set();
  private tooltip: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WorkLogPlugin) {
    super(leaf);
    this.plugin = plugin;
    const now = moment();
    this.currentYear = now.year();
    this.currentMonth = now.month() + 1;
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "工作日志日历";
  }

  getIcon(): string {
    return "calendar-days";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.removeTooltip();
  }

  async refresh(): Promise<void> {
    await this.loadDatesWithContent();
    this.render();
  }

  private async loadDatesWithContent(): Promise<void> {
    if (this.plugin.settings.showContentDots) {
      this.datesWithContent = await this.plugin.fileManager.getDatesWithContent(
        this.currentYear,
        this.currentMonth
      );
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("work-log-calendar");

    this.renderHeader(container);
    this.renderCalendarGrid(container);
    this.renderStats(container);
  }

  // ─────────────────────────────────────────────────────
  // Header（年月切换）
  // ─────────────────────────────────────────────────────

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv("wl-cal-header");

    // 上一月
    const prevBtn = header.createEl("button", { cls: "wl-nav-btn", text: "‹" });
    prevBtn.title = "上一月";
    prevBtn.addEventListener("click", () => this.navigateMonth(-1));

    // 年月标题
    const titleArea = header.createDiv("wl-cal-title");
    const now = moment();

    // 年份选择
    const yearSel = titleArea.createEl("select", { cls: "wl-year-select" });
    const startYear = now.year() - 5;
    const endYear = now.year() + 2;
    for (let y = startYear; y <= endYear; y++) {
      const opt = yearSel.createEl("option", { value: String(y), text: String(y) });
      if (y === this.currentYear) opt.selected = true;
    }
    yearSel.addEventListener("change", async (e) => {
      this.currentYear = parseInt((e.target as HTMLSelectElement).value);
      await this.refresh();
    });

    titleArea.createSpan({ text: "年", cls: "wl-title-sep" });

    // 月份选择
    const monthSel = titleArea.createEl("select", { cls: "wl-month-select" });
    const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月",
      "七月", "八月", "九月", "十月", "十一月", "十二月"];
    for (let m = 1; m <= 12; m++) {
      const opt = monthSel.createEl("option", { value: String(m), text: monthNames[m - 1] });
      if (m === this.currentMonth) opt.selected = true;
    }
    monthSel.addEventListener("change", async (e) => {
      this.currentMonth = parseInt((e.target as HTMLSelectElement).value);
      await this.refresh();
    });

    // 下一月
    const nextBtn = header.createEl("button", { cls: "wl-nav-btn", text: "›" });
    nextBtn.title = "下一月";
    nextBtn.addEventListener("click", () => this.navigateMonth(1));

    // 今日按钮
    const todayBtn = header.createEl("button", { cls: "wl-today-btn", text: "今日" });
    todayBtn.addEventListener("click", async () => {
      const n = moment();
      this.currentYear = n.year();
      this.currentMonth = n.month() + 1;
      await this.refresh();
    });
  }

  private async navigateMonth(delta: number): Promise<void> {
    let m = this.currentMonth + delta;
    let y = this.currentYear;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    this.currentMonth = m;
    this.currentYear = y;
    await this.refresh();
  }

  // ─────────────────────────────────────────────────────
  // 日历格子
  // ─────────────────────────────────────────────────────

  private renderCalendarGrid(container: HTMLElement): void {
    const grid = container.createDiv("wl-cal-grid");

    // 星期标题行
    const weekStartDay = this.plugin.settings.weekStart;
    const headers = weekStartDay === "monday"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["日", "一", "二", "三", "四", "五", "六"];

    const headerRow = grid.createDiv("wl-cal-row wl-cal-weekdays");
    for (const h of headers) {
      headerRow.createDiv({ cls: "wl-cal-cell wl-weekday-header", text: h });
    }

    // 生成日历天
    const firstDay = moment({ year: this.currentYear, month: this.currentMonth - 1, date: 1 });
    const lastDay = firstDay.clone().endOf("month");
    const today = moment();

    // 计算第一天在格子中的偏移
    const dowFirst = firstDay.day(); // 0=Sun
    let startOffset: number;
    if (weekStartDay === "monday") {
      startOffset = (dowFirst + 6) % 7; // Mon=0
    } else {
      startOffset = dowFirst; // Sun=0
    }

    let dayRow = grid.createDiv("wl-cal-row");
    let cellCount = 0;

    // 填充起始空白
    for (let i = 0; i < startOffset; i++) {
      dayRow.createDiv("wl-cal-cell wl-cal-empty");
      cellCount++;
    }

    // 填充日期
    let cur = firstDay.clone();
    while (cur.isSameOrBefore(lastDay, "day")) {
      if (cellCount > 0 && cellCount % 7 === 0) {
        dayRow = grid.createDiv("wl-cal-row");
      }

      const dateKey = cur.format("YYYY-MM-DD");
      const isToday = isSameDay(cur, today);
      const hasContent = this.datesWithContent.has(dateKey);
      const isWeekend = cur.day() === 0 || cur.day() === 6;

      const cell = dayRow.createDiv({
        cls: [
          "wl-cal-cell",
          "wl-cal-day",
          isToday ? "wl-today" : "",
          hasContent ? "wl-has-content" : "",
          isWeekend ? "wl-weekend" : "",
        ].filter(Boolean).join(" "),
      });

      const dayNum = cell.createSpan({ cls: "wl-day-num", text: String(cur.date()) });

      if (hasContent && this.plugin.settings.showContentDots) {
        cell.createDiv({ cls: "wl-dot" });
      }

      // 点击跳转
      const dateCopy = cur.clone();
      cell.addEventListener("click", async () => {
        await this.plugin.fileManager.openAndNavigateToDate(dateCopy);
      });

      // 右键菜单
      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showContextMenu(e, dateCopy);
      });

      // Hover 预览
      cell.addEventListener("mouseenter", async (e) => {
        await this.showTooltip(e, dateCopy);
      });
      cell.addEventListener("mouseleave", () => {
        this.removeTooltip();
      });

      cur.add(1, "day");
      cellCount++;
    }

    // 补全最后一行
    const remaining = cellCount % 7;
    if (remaining !== 0) {
      for (let i = remaining; i < 7; i++) {
        dayRow.createDiv("wl-cal-cell wl-cal-empty");
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // 右键菜单
  // ─────────────────────────────────────────────────────

  private showContextMenu(e: MouseEvent, date: moment.Moment): void {
    const menu = document.createElement("div");
    menu.className = "wl-context-menu";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    const items = [
      {
        text: `📖 打开 ${date.format("MM-DD")} 记录`,
        action: async () => {
          await this.plugin.fileManager.openAndNavigateToDate(date);
        },
      },
      {
        text: `✏️ 添加工作记录`,
        action: async () => {
          await this.plugin.fileManager.insertTimestampEntry(date);
        },
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

  // ─────────────────────────────────────────────────────
  // Hover Tooltip
  // ─────────────────────────────────────────────────────

  private async showTooltip(e: MouseEvent, date: moment.Moment): Promise<void> {
    this.removeTooltip();

    const preview = await this.plugin.fileManager.getDayPreview(date, 5);
    if (!preview) return;

    const tt = document.createElement("div");
    tt.className = "wl-tooltip";
    tt.style.left = `${e.pageX + 12}px`;
    tt.style.top = `${e.pageY + 4}px`;

    const title = tt.createDiv({ cls: "wl-tt-title", text: date.format("YYYY-MM-DD") });
    const body = tt.createDiv({ cls: "wl-tt-body" });

    preview.split("\n").forEach((line) => {
      body.createDiv({ cls: "wl-tt-line", text: line });
    });

    document.body.appendChild(tt);
    this.tooltip = tt;
  }

  private removeTooltip(): void {
    if (this.tooltip && document.body.contains(this.tooltip)) {
      document.body.removeChild(this.tooltip);
    }
    this.tooltip = null;
  }

  // ─────────────────────────────────────────────────────
  // 统计区域
  // ─────────────────────────────────────────────────────

  private renderStats(container: HTMLElement): void {
    const stats = container.createDiv("wl-stats");

    const daysCount = this.datesWithContent.size;
    stats.createDiv({
      cls: "wl-stat-item",
      text: `📅 本月记录：${daysCount} 天`,
    });

    // 本周统计
    const now = moment();
    if (now.year() === this.currentYear && now.month() + 1 === this.currentMonth) {
      const weekStart = this.plugin.settings.weekStart === "monday"
        ? now.clone().startOf("isoWeek")
        : now.clone().startOf("week");
      const weekEnd = weekStart.clone().add(6, "days");

      let weekDays = 0;
      this.datesWithContent.forEach((d) => {
        const m = moment(d);
        if (m.isBetween(weekStart, weekEnd, "day", "[]")) weekDays++;
      });

      stats.createDiv({
        cls: "wl-stat-item",
        text: `📊 本周记录：${weekDays} 天`,
      });
    }
  }

  // ─────────────────────────────────────────────────────
  // 公开方法：切换到指定月份
  // ─────────────────────────────────────────────────────

  async navigateTo(year: number, month: number): Promise<void> {
    this.currentYear = year;
    this.currentMonth = month;
    await this.refresh();
  }
}
