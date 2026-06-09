import { App, Notice, TFile, TFolder, normalizePath, moment } from "obsidian";
import type { WorkLogSettings } from "./settings";
import {
  buildYearStructure,
  formatDayTitle,
  formatMonthHeading,
  formatWeekTitle,
  parseDayTitle,
  MonthGroup,
  WeekGroup,
} from "./dateUtils";

/** 缓存：年份 → (日期字符串 YYYY-MM-DD → 行号) */
type DateLineCache = Map<string, Map<string, number>>;

export class FileManager {
  private app: App;
  private settings: WorkLogSettings;
  /** 内存缓存 */
  private cache: DateLineCache = new Map();

  constructor(app: App, settings: WorkLogSettings) {
    this.app = app;
    this.settings = settings;
  }

  updateSettings(settings: WorkLogSettings) {
    this.settings = settings;
  }

  // ─────────────────────────────────────────────────────
  // 文件路径
  // ─────────────────────────────────────────────────────

  getFileName(year: number): string {
    return this.settings.fileNameFormat.replace("{{year}}", String(year));
  }

  getFilePath(year: number): string {
    const dir = this.settings.logDirectory;
    const name = this.getFileName(year);
    return normalizePath(`${dir}/${name}.md`);
  }

  async getOrCreateFile(year: number): Promise<TFile> {
    const filePath = this.getFilePath(year);
    let file = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
    if (!file) {
      await this.ensureDirectory(this.settings.logDirectory);
      const content = this.settings.autoGenerateYearStructure
        ? await this.generateFullYearContent(year)
        : this.generateFileHeader(year);
      file = await this.app.vault.create(filePath, content);
      new Notice(`已创建 ${year} 年工作日志文件`);
    }
    return file;
  }

  private async ensureDirectory(dir: string): Promise<void> {
    const normalized = normalizePath(dir);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (!existing) {
      await this.app.vault.createFolder(normalized);
    }
  }

  // ─────────────────────────────────────────────────────
  // 内容生成
  // ─────────────────────────────────────────────────────

  private generateFileHeader(year: number): string {
    return this.settings.fileHeaderTemplate.replace("{{year}}", String(year)) + "\n";
  }

  async generateFullYearContent(year: number): Promise<string> {
    const groups = buildYearStructure(year, this.settings);
    const lines: string[] = [];

    lines.push(this.generateFileHeader(year).trimEnd());
    lines.push("");

    for (const mg of groups) {
      lines.push(`## ${formatMonthHeading(mg.month)}`);
      lines.push("");

      for (const wg of mg.weeks) {
        lines.push(`### ${formatWeekTitle(wg, year)}`);
        lines.push("");

        for (const day of wg.days) {
          lines.push(`#### ${formatDayTitle(day, this.settings)}`);
          lines.push("");
        }
      }
    }

    return lines.join("\n");
  }

  // ─────────────────────────────────────────────────────
  // 缓存管理
  // ─────────────────────────────────────────────────────

  /** 解析文件，建立 日期字符串→行号 的缓存 */
  async buildCache(file: TFile): Promise<Map<string, number>> {
    const year = this.extractYearFromFile(file);
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const dateMap = new Map<string, number>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("#### ")) {
        const m = parseDayTitle(line, this.settings.dateFormat);
        if (m && m.isValid()) {
          dateMap.set(m.format("YYYY-MM-DD"), i);
        }
      }
    }

    if (year) {
      this.cache.set(year, dateMap);
    }
    return dateMap;
  }

  invalidateCache(year: number) {
    this.cache.delete(String(year));
  }

  private extractYearFromFile(file: TFile): string | null {
    // 从文件路径中解析年份（从文件名中找4位数字）
    const m = file.basename.match(/(\d{4})/);
    return m ? m[1] : null;
  }

  async getDateLineMap(file: TFile): Promise<Map<string, number>> {
    const year = this.extractYearFromFile(file);
    if (year && this.cache.has(year)) {
      return this.cache.get(year)!;
    }
    return this.buildCache(file);
  }

  // ─────────────────────────────────────────────────────
  // 日期定位与创建
  // ─────────────────────────────────────────────────────

  /**
   * 打开文件并跳转到指定日期标题
   * 若不存在则先创建缺失的日期结构
   */
  async openAndNavigateToDate(date: moment.Moment): Promise<void> {
    const year = date.year();
    const file = await this.getOrCreateFile(year);

    let lineMap = await this.getDateLineMap(file);
    const dateKey = date.format("YYYY-MM-DD");

    if (!lineMap.has(dateKey)) {
      // 插入缺失的日期区块
      await this.insertMissingDateBlock(file, date);
      lineMap = await this.buildCache(file);
    }

    const lineNo = lineMap.get(dateKey);

    // 打开文件
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);

    // 等待编辑器渲染完成后定位
    if (lineNo !== undefined) {
      // 使用 setTimeout 确保编辑器已加载
      setTimeout(() => {
        const view = leaf.view as any;
        if (view?.editor) {
          const editor = view.editor;
          editor.setCursor({ line: lineNo, ch: 0 });
          editor.scrollIntoView({ from: { line: lineNo, ch: 0 }, to: { line: lineNo, ch: 0 } }, true);
        }
      }, 100);
    }
  }

  /**
   * 在文件中插入缺失的日期区块，保持月/周/日结构完整
   */
  async insertMissingDateBlock(file: TFile, date: moment.Moment): Promise<void> {
    const year = date.year();
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    const groups = buildYearStructure(year, this.settings);

    // 找到目标月份和周
    const month = date.month() + 1;
    const targetMg = groups.find((mg) => mg.month === month);
    if (!targetMg) return;

    const dateKey = date.format("YYYY-MM-DD");
    const targetWg = targetMg.weeks.find((wg) =>
      wg.days.some((d) => d.format("YYYY-MM-DD") === dateKey)
    );
    if (!targetWg) return;

    // 检查月份标题是否存在
    const monthHeading = `## ${formatMonthHeading(month)}`;
    const monthLineIdx = lines.findIndex((l) => l.trim() === monthHeading);

    if (monthLineIdx === -1) {
      // 月份不存在，在合适位置插入整个月份块
      await this.insertMonthBlock(file, targetMg, groups, year);
    } else {
      // 月份存在，检查周标题
      const weekTitle = `### ${formatWeekTitle(targetWg, year)}`;
      const weekLineIdx = lines.findIndex((l) => l.trim() === weekTitle);

      if (weekLineIdx === -1) {
        await this.insertWeekBlock(file, targetMg, targetWg, month, year);
      } else {
        // 周已存在，只插入日期标题
        await this.insertDayHeading(file, date, targetWg, year);
      }
    }

    this.invalidateCache(year);
  }

  private async insertDayHeading(
    file: TFile,
    date: moment.Moment,
    wg: WeekGroup,
    year: number
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const dateKey = date.format("YYYY-MM-DD");
    const weekTitle = `### ${formatWeekTitle(wg, year)}`;

    const weekLineIdx = lines.findIndex((l) => l.trim() === weekTitle);
    if (weekLineIdx === -1) return;

    // 找到该周内日期应该插入的位置（按日期顺序）
    let insertIdx = weekLineIdx + 1;
    // 跳过空行
    while (insertIdx < lines.length && lines[insertIdx].trim() === "") {
      insertIdx++;
    }

    // 找到正确的日期插入位置
    for (let i = insertIdx; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("## ") || line.startsWith("### ")) break;
      if (line.startsWith("#### ")) {
        const m = parseDayTitle(line, this.settings.dateFormat);
        if (m && m.isValid() && m.format("YYYY-MM-DD") > dateKey) {
          insertIdx = i;
          break;
        }
        insertIdx = i + 1;
      }
    }

    const dayHeading = `#### ${formatDayTitle(date, this.settings)}`;
    lines.splice(insertIdx, 0, dayHeading, "");
    await this.app.vault.modify(file, lines.join("\n"));
  }

  private async insertWeekBlock(
    file: TFile,
    mg: MonthGroup,
    wg: WeekGroup,
    month: number,
    year: number
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const monthHeading = `## ${formatMonthHeading(month)}`;
    const monthLineIdx = lines.findIndex((l) => l.trim() === monthHeading);
    if (monthLineIdx === -1) return;

    // 找到周应插入的位置
    let insertIdx = monthLineIdx + 1;
    const weekTitle = `### ${formatWeekTitle(wg, year)}`;

    for (let i = monthLineIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("## ")) {
        insertIdx = i;
        break;
      }
      if (line.startsWith("### ")) {
        // 比较周序号
        const wMatch = line.match(/第(\d+)周/);
        if (wMatch && parseInt(wMatch[1]) > wg.weekIndex) {
          insertIdx = i;
          break;
        }
        insertIdx = i + 1;
      }
    }

    // 生成周块（含该周所有天的标题）
    const weekLines: string[] = ["", `### ${formatWeekTitle(wg, year)}`, ""];
    for (const day of wg.days) {
      weekLines.push(`#### ${formatDayTitle(day, this.settings)}`);
      weekLines.push("");
    }

    lines.splice(insertIdx, 0, ...weekLines);
    await this.app.vault.modify(file, lines.join("\n"));
  }

  private async insertMonthBlock(
    file: TFile,
    mg: MonthGroup,
    allGroups: MonthGroup[],
    year: number
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    // 找到月份应插入的位置（按月份顺序）
    let insertIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("## ")) {
        // 检查是否是月份标题
        const existingMonth = allGroups.findIndex(
          (g) => `## ${formatMonthHeading(g.month)}` === line.trim()
        );
        if (existingMonth !== -1 && allGroups[existingMonth].month > mg.month) {
          insertIdx = i;
          break;
        }
      }
    }

    // 生成完整月份块
    const monthLines: string[] = ["", `## ${formatMonthHeading(mg.month)}`, ""];
    for (const wg of mg.weeks) {
      monthLines.push(`### ${formatWeekTitle(wg, year)}`);
      monthLines.push("");
      for (const day of wg.days) {
        monthLines.push(`#### ${formatDayTitle(day, this.settings)}`);
        monthLines.push("");
      }
    }

    lines.splice(insertIdx, 0, ...monthLines);
    await this.app.vault.modify(file, lines.join("\n"));
  }

  // ─────────────────────────────────────────────────────
  // 结构修复
  // ─────────────────────────────────────────────────────

  /**
   * 修复当前年度文件结构：补全缺失的月份/周/日期标题，不覆盖已有内容
   */
  async repairYearStructure(year: number): Promise<void> {
    const file = await this.getOrCreateFile(year);
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    const groups = buildYearStructure(year, this.settings);

    // 收集文件中已有的标题
    const existingMonths = new Set<string>();
    const existingWeeks = new Set<string>();
    const existingDays = new Set<string>();

    for (const line of lines) {
      if (line.startsWith("## ")) existingMonths.add(line.trim());
      if (line.startsWith("### ")) existingWeeks.add(line.trim());
      if (line.startsWith("#### ")) {
        const m = parseDayTitle(line, this.settings.dateFormat);
        if (m) existingDays.add(m.format("YYYY-MM-DD"));
      }
    }

    let repaired = 0;

    for (const mg of groups) {
      const monthHeading = `## ${formatMonthHeading(mg.month)}`;
      if (!existingMonths.has(monthHeading)) {
        await this.insertMonthBlock(file, mg, groups, year);
        repaired++;
        continue;
      }

      for (const wg of mg.weeks) {
        const weekHeading = `### ${formatWeekTitle(wg, year)}`;
        if (!existingWeeks.has(weekHeading)) {
          await this.insertWeekBlock(file, mg, wg, mg.month, year);
          repaired++;
          continue;
        }

        for (const day of wg.days) {
          const dateKey = day.format("YYYY-MM-DD");
          if (!existingDays.has(dateKey)) {
            await this.insertDayHeading(file, day, wg, year);
            repaired++;
          }
        }
      }
    }

    this.invalidateCache(year);
    new Notice(`结构修复完成，补全了 ${repaired} 处缺失标题`);
  }

  // ─────────────────────────────────────────────────────
  // 快速插入带时间戳条目
  // ─────────────────────────────────────────────────────

  /**
   * 在今日日期区块下追加带时间戳的工作条目
   */
  async insertTimestampEntry(customDate?: moment.Moment): Promise<void> {
    const today = customDate || moment();
    const file = await this.getOrCreateFile(today.year());
    let lineMap = await this.getDateLineMap(file);
    const dateKey = today.format("YYYY-MM-DD");

    if (!lineMap.has(dateKey)) {
      await this.insertMissingDateBlock(file, today);
      lineMap = await this.buildCache(file);
    }

    const headingLine = lineMap.get(dateKey);
    if (headingLine === undefined) {
      new Notice("无法定位今日日期标题");
      return;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    const timestamp = moment().format(this.settings.timestampFormat);
    const entry = `- ${timestamp} `;

    // 找到该日期标题下，下一个标题之前，追加到末尾
    let insertIdx = headingLine + 1;
    for (let i = headingLine + 1; i < lines.length; i++) {
      if (lines[i].startsWith("## ") || lines[i].startsWith("### ") || lines[i].startsWith("#### ")) {
        break;
      }
      if (lines[i].trim() !== "") {
        insertIdx = i + 1;
      } else {
        insertIdx = i;
      }
    }

    lines.splice(insertIdx, 0, entry);
    await this.app.vault.modify(file, lines.join("\n"));

    // 打开文件并将光标定位到新行
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    setTimeout(() => {
      const view = leaf.view as any;
      if (view?.editor) {
        const editor = view.editor;
        editor.setCursor({ line: insertIdx, ch: entry.length });
        editor.scrollIntoView(
          { from: { line: insertIdx, ch: 0 }, to: { line: insertIdx, ch: entry.length } },
          true
        );
        editor.focus();
      }
    }, 100);

    this.invalidateCache(today.year());
  }

  // ─────────────────────────────────────────────────────
  // 内容统计（供日历视图和统计面板使用）
  // ─────────────────────────────────────────────────────

  /**
   * 获取某年某月有内容的日期集合
   */
  async getDatesWithContent(year: number, month: number): Promise<Set<string>> {
    const filePath = this.getFilePath(year);
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
    if (!file) return new Set();

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    const result = new Set<string>();
    let currentDate: string | null = null;
    let hasContent = false;

    for (const line of lines) {
      if (line.startsWith("#### ")) {
        if (currentDate && hasContent) {
          result.add(currentDate);
        }
        const m = parseDayTitle(line, this.settings.dateFormat);
        if (m && m.isValid() && m.year() === year && m.month() + 1 === month) {
          currentDate = m.format("YYYY-MM-DD");
          hasContent = false;
        } else {
          currentDate = null;
        }
      } else if (
        currentDate &&
        !line.startsWith("## ") &&
        !line.startsWith("### ") &&
        line.trim() !== ""
      ) {
        hasContent = true;
      }
    }
    // 最后一个日期
    if (currentDate && hasContent) {
      result.add(currentDate);
    }

    return result;
  }

  /**
   * 获取某日期的前几行工作内容（用于 hover 预览）
   */
  async getDayPreview(date: moment.Moment, maxLines = 4): Promise<string> {
    const year = date.year();
    const filePath = this.getFilePath(year);
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
    if (!file) return "";

    const lineMap = await this.getDateLineMap(file);
    const dateKey = date.format("YYYY-MM-DD");
    const headingLine = lineMap.get(dateKey);
    if (headingLine === undefined) return "";

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    const previewLines: string[] = [];
    for (let i = headingLine + 1; i < lines.length && previewLines.length < maxLines; i++) {
      const line = lines[i];
      if (line.startsWith("## ") || line.startsWith("### ") || line.startsWith("#### ")) break;
      if (line.trim() !== "") {
        previewLines.push(line.trim());
      }
    }

    return previewLines.join("\n");
  }

  // ─────────────────────────────────────────────────────
  // 导出
  // ─────────────────────────────────────────────────────

  async exportRange(
    year: number,
    format: "markdown" | "html" | "json",
    month?: number
  ): Promise<string> {
    const filePath = this.getFilePath(year);
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
    if (!file) return "";

    const content = await this.app.vault.read(file);

    if (format === "markdown") {
      if (month === undefined) return content;
      return this.extractMonthContent(content, month);
    }

    if (format === "html") {
      const md = month !== undefined ? this.extractMonthContent(content, month) : content;
      return this.markdownToSimpleHtml(md, year, month);
    }

    if (format === "json") {
      return this.contentToJson(content, year, month);
    }

    return content;
  }

  private extractMonthContent(content: string, month: number): string {
    const monthHeading = `## ${this.getMonthName(month)}`;
    const lines = content.split("\n");
    let inMonth = false;
    const result: string[] = [];

    for (const line of lines) {
      if (line.trim() === monthHeading) {
        inMonth = true;
        result.push(line);
        continue;
      }
      if (inMonth) {
        if (line.startsWith("## ") && line.trim() !== monthHeading) {
          break;
        }
        result.push(line);
      }
    }

    return result.join("\n");
  }

  private getMonthName(month: number): string {
    const names = ["", "一月", "二月", "三月", "四月", "五月", "六月",
      "七月", "八月", "九月", "十月", "十一月", "十二月"];
    return names[month] || `${month}月`;
  }

  private markdownToSimpleHtml(md: string, year: number, month?: number): string {
    const title = month ? `${year}年${this.getMonthName(month)}工作日志` : `${year}年工作日志`;
    let body = md
      .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/^- \[x\] (.+)$/gm, '<li class="done">✅ $1</li>')
      .replace(/^- \[ \] (.+)$/gm, '<li class="todo">⬜ $1</li>')
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/\n{2,}/g, "\n<br>\n");

    return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
  h1 { border-bottom: 2px solid #333; }
  h2 { color: #444; border-left: 4px solid #7c3aed; padding-left: 8px; }
  h3 { color: #666; }
  h4 { color: #888; }
  li { margin: 4px 0; }
  li.done { color: #22c55e; }
</style>
</head>
<body>${body}</body>
</html>`;
  }

  private contentToJson(content: string, year: number, month?: number): string {
    const lines = content.split("\n");
    const result: Record<string, string[]> = {};
    let currentDate: string | null = null;

    for (const line of lines) {
      if (line.startsWith("#### ")) {
        const m = parseDayTitle(line, this.settings.dateFormat);
        if (m && m.isValid()) {
          if (month !== undefined && m.month() + 1 !== month) {
            currentDate = null;
            continue;
          }
          currentDate = m.format("YYYY-MM-DD");
          result[currentDate] = [];
        }
      } else if (
        currentDate &&
        !line.startsWith("## ") &&
        !line.startsWith("### ") &&
        line.trim() !== ""
      ) {
        result[currentDate].push(line.trim());
      }
    }

    return JSON.stringify({ year, month: month ?? null, data: result }, null, 2);
  }

  // ─────────────────────────────────────────────────────
  // 搜索
  // ─────────────────────────────────────────────────────

  async searchAllLogs(keyword: string): Promise<Array<{ date: string; content: string; filePath: string }>> {
    const dir = this.settings.logDirectory;
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(dir));
    if (!(folder instanceof TFolder)) return [];

    const results: Array<{ date: string; content: string; filePath: string }> = [];

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      const content = await this.app.vault.read(child);
      const lines = content.split("\n");

      let currentDate: string | null = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("#### ")) {
          const m = parseDayTitle(line, this.settings.dateFormat);
          currentDate = m ? m.format("YYYY-MM-DD") : null;
        } else if (currentDate && line.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({
            date: currentDate,
            content: line.trim(),
            filePath: child.path,
          });
        }
      }
    }

    return results;
  }
}
