import { ItemView, WorkspaceLeaf, moment } from "obsidian";
import type WorkLogPlugin from "./main";
import { isSameDay } from "./dateUtils";

export const CALENDAR_VIEW_TYPE = "work-log-calendar";

export class CalendarView extends ItemView {
  private plugin: WorkLogPlugin;
  private currentYear: number;
  private currentMonth: number; // 1-12
  private selectedDate: moment.Moment | null = null;
  private tooltip: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: WorkLogPlugin) {
    super(leaf);
    this.plugin = plugin;
    const now = moment();
    this.currentYear = now.year();
    this.currentMonth = now.month() + 1;
    this.selectedDate = now.clone();
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
    try {
      await this.plugin.fileManager.getOrCreateFile(this.currentYear);
    } catch {
      // ignore
    }
    await this.render();
  }

  private async render(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("work-log-calendar");

    // 加载当前月份有内容的日期
    const datesWithContent = await this.plugin.fileManager.getDatesWithContent(
      this.currentYear,
      this.currentMonth
    );

    this.renderHeader(container);
    this.renderCalendarGrid(container, datesWithContent);
    this.renderActionButton(container);
  }

  // ─────────────────────────────────────────────────────
  // Header
  // ─────────────────────────────────────────────────────

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv("wl-cal-header");

    const prevBtn = header.createEl("button", { cls: "wl-nav-btn", text: "‹" });
    prevBtn.title = "上一月";
    prevBtn.addEventListener("click", () => this.navigateMonth(-1));

    const titleArea = header.createDiv("wl-cal-title");
    const now = moment();

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

    const nextBtn = header.createEl("button", { cls: "wl-nav-btn", text: "›" });
    nextBtn.title = "下一月";
    nextBtn.addEventListener("click", () => this.navigateMonth(1));

    const todayBtn = header.createEl("button", { cls: "wl-today-btn", text: "今日" });
    todayBtn.addEventListener("click", async () => {
      const n = moment();
      this.currentYear = n.year();
      this.currentMonth = n.month() + 1;
      this.selectedDate = n.clone();
      await this.refresh();
      await this.plugin.fileManager.openAndNavigateToDate(n);
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
  // Calendar grid
  // ─────────────────────────────────────────────────────

  private renderCalendarGrid(container: HTMLElement, datesWithContent: Set<string>): void {
    const grid = container.createDiv("wl-cal-grid");

    const weekStartDay = this.plugin.settings.weekStart;
    const headers = weekStartDay === "monday"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["日", "一", "二", "三", "四", "五", "六"];

    const headerRow = grid.createDiv("wl-cal-row wl-cal-weekdays");
    for (const h of headers) {
      headerRow.createDiv({ cls: "wl-cal-cell wl-weekday-header", text: h });
    }

    const firstDay = moment({ year: this.currentYear, month: this.currentMonth - 1, date: 1 });
    const lastDay = firstDay.clone().endOf("month");
    const today = moment();

    const dowFirst = firstDay.day();
    let startOffset: number;
    if (weekStartDay === "monday") {
      startOffset = (dowFirst + 6) % 7;
    } else {
      startOffset = dowFirst;
    }

    let dayRow = grid.createDiv("wl-cal-row");
    let cellCount = 0;

    for (let i = 0; i < startOffset; i++) {
      dayRow.createDiv("wl-cal-cell wl-cal-empty");
      cellCount++;
    }

    let cur = firstDay.clone();
    while (cur.isSameOrBefore(lastDay, "day")) {
      if (cellCount > 0 && cellCount % 7 === 0) {
        dayRow = grid.createDiv("wl-cal-row");
      }

      const isToday = isSameDay(cur, today);
      const isWeekend = cur.day() === 0 || cur.day() === 6;

      // Highlight if this date is the selected one
      let selectedCls = "";
      if (this.selectedDate && isSameDay(cur, this.selectedDate)) {
        selectedCls = "wl-selected";
      }

      const cell = dayRow.createDiv({
        cls: [
          "wl-cal-cell",
          "wl-cal-day",
          isToday ? "wl-today" : "",
          isWeekend ? "wl-weekend" : "",
          selectedCls,
        ].filter(Boolean).join(" "),
      });

      cell.createSpan({ cls: "wl-day-num", text: String(cur.date()) });

      // Dot marker for dates that have content
      if (datesWithContent.has(cur.format("YYYY-MM-DD"))) {
        cell.addClass("wl-has-content");
        cell.createDiv("wl-dot");
      }

      const dateCopy = cur.clone();

      // Click: select date + open file
      cell.addEventListener("click", async () => {
        this.selectedDate = dateCopy.clone();
        await this.render();
        await this.plugin.fileManager.openAndNavigateToDate(dateCopy);
      });

      // Hover preview (desktop only)
      if (!this.app.isMobile) {
        cell.addEventListener("mouseenter", async (e) => {
          await this.showTooltip(e, dateCopy);
        });
        cell.addEventListener("mouseleave", () => {
          this.removeTooltip();
        });
      }

      cur.add(1, "day");
      cellCount++;
    }

    const remaining = cellCount % 7;
    if (remaining !== 0) {
      for (let i = remaining; i < 7; i++) {
        dayRow.createDiv("wl-cal-cell wl-cal-empty");
      }
    }
  }

  // ─────────────────────────────────────────────────────
  // Action button below calendar
  // ─────────────────────────────────────────────────────

  private renderActionButton(container: HTMLElement): void {
    const actionBar = container.createDiv("wl-action-bar");

    const today = moment();
    let targetDate: moment.Moment;
    let label: string;

    if (this.selectedDate && isSameDay(this.selectedDate, today)) {
      targetDate = today.clone();
      label = "＋ 添加今日工作记录";
    } else if (this.selectedDate) {
      targetDate = this.selectedDate.clone();
      label = `＋ 添加 ${targetDate.format("MM-DD")} 工作记录`;
    } else {
      targetDate = today.clone();
      label = "＋ 添加今日工作记录";
    }

    const btn = actionBar.createEl("button", { cls: "wl-add-btn" });
    btn.textContent = label;

    // Popup for session picker
    const popup = actionBar.createDiv("wl-session-popup");
    popup.style.display = "none";

    const amBtn = popup.createEl("button", { cls: "wl-session-opt wl-session-am" });
    amBtn.textContent = "☀ 上午";
    amBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.plugin.fileManager.insertSessionLabel(targetDate, "上午");
      await this.render();
    });

    const pmBtn = popup.createEl("button", { cls: "wl-session-opt wl-session-pm" });
    pmBtn.textContent = "🌙 下午";
    pmBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await this.plugin.fileManager.insertSessionLabel(targetDate, "下午");
      await this.render();
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = popup.style.display !== "none";
      popup.style.display = isVisible ? "none" : "flex";
    });

    // Click outside to close
    document.addEventListener("click", (ev) => {
      if (!actionBar.contains(ev.target as Node)) {
        popup.style.display = "none";
      }
    });
  }

  // ─────────────────────────────────────────────────────
  // Tooltip (desktop only)
  // ─────────────────────────────────────────────────────

  private async showTooltip(e: MouseEvent, date: moment.Moment): Promise<void> {
    this.removeTooltip();

    const preview = await this.plugin.fileManager.getDayPreview(date, 5);
    if (!preview) return;

    const tt = document.createElement("div");
    tt.className = "wl-tooltip";
    tt.style.left = `${e.pageX + 12}px`;
    tt.style.top = `${e.pageY + 4}px`;

    tt.createDiv({ cls: "wl-tt-title", text: date.format("YYYY-MM-DD") });
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
  // Public
  // ─────────────────────────────────────────────────────

  async navigateTo(year: number, month: number): Promise<void> {
    this.currentYear = year;
    this.currentMonth = month;
    await this.refresh();
  }
}
