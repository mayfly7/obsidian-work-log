import { ItemView, TFile, WorkspaceLeaf, moment } from "obsidian";
import type WorkLogPlugin from "./main";

export const SEARCH_VIEW_TYPE = "work-log-search";

// ─────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────

export interface MonthStats {
  year: number;
  month: number;
  recordedDays: number;
  totalEntries: number;
  totalChars: number;
  totalLines: number;
}

export async function getMonthStats(
  plugin: WorkLogPlugin,
  year: number,
  month: number
): Promise<MonthStats> {
  const filePath = plugin.fileManager.getFilePath(year);
  const file = plugin.app.vault.getAbstractFileByPath(filePath) as TFile | null;

  if (!file) {
    return { year, month, recordedDays: 0, totalEntries: 0, totalChars: 0, totalLines: 0 };
  }

  const content = await plugin.app.vault.read(file);
  const lines = content.split("\n");

  const datesWithContent = new Set<string>();
  let totalEntries = 0;
  let totalChars = 0;
  let totalLines = 0;
  let currentDateInMonth = false;

  for (const line of lines) {
    if (line.startsWith("#### ")) {
      const stripped = line.replace(/^####\s+/, "").trim();
      const datePart = stripped.split(/\s+/)[0];
      const m = moment(datePart, plugin.settings.dateFormat, true);
      if (m.isValid() && m.year() === year && m.month() + 1 === month) {
        currentDateInMonth = true;
        datesWithContent; // will be added later when content found
      } else {
        currentDateInMonth = false;
      }
    } else if (
      currentDateInMonth &&
      !line.startsWith("## ") &&
      !line.startsWith("### ") &&
      line.trim() !== ""
    ) {
      // 找出当前日期
      const idx = lines.indexOf(line);
      for (let i = idx - 1; i >= 0; i--) {
        if (lines[i].startsWith("#### ")) {
          const stripped = lines[i].replace(/^####\s+/, "").trim();
          const datePart = stripped.split(/\s+/)[0];
          const m = moment(datePart, plugin.settings.dateFormat, true);
          if (m.isValid() && m.year() === year && m.month() + 1 === month) {
            datesWithContent.add(m.format("YYYY-MM-DD"));
          }
          break;
        }
      }
      totalEntries++;
      totalChars += line.length;
      totalLines++;
    }
  }

  return {
    year,
    month,
    recordedDays: datesWithContent.size,
    totalEntries,
    totalChars,
    totalLines,
  };
}

// ─────────────────────────────────────────────────────────────
// SearchView
// ─────────────────────────────────────────────────────────────

export class SearchView extends ItemView {
  private plugin: WorkLogPlugin;
  private keyword = "";
  private results: Array<{ date: string; content: string; filePath: string }> = [];

  constructor(leaf: WorkspaceLeaf, plugin: WorkLogPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SEARCH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "工作日志搜索";
  }

  getIcon(): string {
    return "search";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("work-log-search");

    // 搜索头部
    const searchHeader = container.createDiv("wl-search-header");
    searchHeader.createEl("h4", { text: "🔍 搜索工作日志" });

    const inputRow = searchHeader.createDiv("wl-search-row");
    const input = inputRow.createEl("input", {
      type: "text",
      placeholder: "输入关键词…",
      cls: "wl-search-input",
      value: this.keyword,
    });

    const searchBtn = inputRow.createEl("button", { cls: "wl-search-btn", text: "搜索" });

    const doSearch = async () => {
      this.keyword = input.value.trim();
      if (!this.keyword) return;
      searchBtn.textContent = "搜索中…";
      searchBtn.disabled = true;
      this.results = await this.plugin.fileManager.searchAllLogs(this.keyword);
      this.renderResults(container);
      searchBtn.textContent = "搜索";
      searchBtn.disabled = false;
    };

    searchBtn.addEventListener("click", doSearch);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });

    // 结果区域
    this.renderResults(container);
  }

  private renderResults(container: HTMLElement): void {
    // 移除旧结果
    const oldResults = container.querySelector(".wl-search-results");
    if (oldResults) container.removeChild(oldResults);

    const resultsEl = container.createDiv("wl-search-results");

    if (this.results.length === 0 && this.keyword) {
      resultsEl.createDiv({ cls: "wl-no-results", text: `未找到包含"${this.keyword}"的记录` });
      return;
    }

    if (this.results.length === 0) return;

    resultsEl.createDiv({
      cls: "wl-result-count",
      text: `找到 ${this.results.length} 条结果`,
    });

    // 按日期分组
    const byDate = new Map<string, typeof this.results>();
    for (const r of this.results) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date)!.push(r);
    }

    const sortedDates = Array.from(byDate.keys()).sort().reverse();

    for (const date of sortedDates) {
      const group = resultsEl.createDiv("wl-result-group");
      const dateHeader = group.createDiv({ cls: "wl-result-date" });
      dateHeader.createSpan({ cls: "wl-result-date-icon", text: "📅" });
      dateHeader.createSpan({ text: date });

      const items = byDate.get(date)!;
      for (const item of items) {
        const row = group.createDiv({ cls: "wl-result-item" });

        // 高亮关键词
        const highlighted = this.highlightKeyword(item.content, this.keyword);
        row.innerHTML = highlighted;

        row.addEventListener("click", async () => {
          const m = moment(date, "YYYY-MM-DD", true);
          if (m.isValid()) {
            await this.plugin.fileManager.openAndNavigateToDate(m);
          }
        });
      }
    }
  }

  private highlightKeyword(text: string, keyword: string): string {
    if (!keyword) return this.escapeHtml(text);
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})`, "gi");
    return this.escapeHtml(text).replace(re, '<mark class="wl-highlight">$1</mark>');
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
