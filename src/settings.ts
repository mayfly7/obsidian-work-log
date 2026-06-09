import { App, PluginSettingTab, Setting } from "obsidian";
import type WorkLogPlugin from "./main";

export interface WorkLogSettings {
  /** 工作日志存储目录（相对仓库根目录） */
  logDirectory: string;
  /** 文件名格式，支持 {{year}} 变量 */
  fileNameFormat: string;
  /** 日期格式（Moment.js 格式）*/
  dateFormat: string;
  /** 周起始日：'monday' | 'sunday' */
  weekStart: "monday" | "sunday";
  /** 星期几语言：'zh' | 'en' */
  weekdayLanguage: "zh" | "en";
  /** 是否自动生成全年框架 */
  autoGenerateYearStructure: boolean;
  /** 插入时间戳格式 */
  timestampFormat: string;
  /** 是否在日历上标记有内容的日期 */
  showContentDots: boolean;
  /** 日历视图默认位置 */
  calendarPosition: "right" | "left" | "tab";
  /** 文件头部模板 */
  fileHeaderTemplate: string;
}

export const DEFAULT_SETTINGS: WorkLogSettings = {
  logDirectory: "工作日志",
  fileNameFormat: "{{year}}-工作日志",
  dateFormat: "YYYY-MM-DD",
  weekStart: "monday",
  weekdayLanguage: "zh",
  autoGenerateYearStructure: true,
  timestampFormat: "HH:mm",
  showContentDots: true,
  calendarPosition: "right",
  fileHeaderTemplate: "# {{year}}年工作日志",
};

export class WorkLogSettingTab extends PluginSettingTab {
  plugin: WorkLogPlugin;

  constructor(app: App, plugin: WorkLogPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "工作日志设置" });

    // ─── 文件存储 ───────────────────────────────────────────────
    containerEl.createEl("h3", { text: "文件存储" });

    new Setting(containerEl)
      .setName("存储目录")
      .setDesc("所有年度文件存放的文件夹（相对仓库根目录）")
      .addText((text) =>
        text
          .setPlaceholder("工作日志")
          .setValue(this.plugin.settings.logDirectory)
          .onChange(async (value) => {
            this.plugin.settings.logDirectory = value.trim() || "工作日志";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("文件名格式")
      .setDesc("支持 {{year}} 变量，例如：{{year}}-工作日志")
      .addText((text) =>
        text
          .setPlaceholder("{{year}}-工作日志")
          .setValue(this.plugin.settings.fileNameFormat)
          .onChange(async (value) => {
            this.plugin.settings.fileNameFormat = value.trim() || "{{year}}-工作日志";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("文件头部模板")
      .setDesc("年度文件的第一行标题，支持 {{year}} 变量")
      .addText((text) =>
        text
          .setPlaceholder("# {{year}}年工作日志")
          .setValue(this.plugin.settings.fileHeaderTemplate)
          .onChange(async (value) => {
            this.plugin.settings.fileHeaderTemplate = value.trim() || "# {{year}}年工作日志";
            await this.plugin.saveSettings();
          })
      );

    // ─── 日期与时间 ──────────────────────────────────────────────
    containerEl.createEl("h3", { text: "日期与时间" });

    new Setting(containerEl)
      .setName("日期格式")
      .setDesc("四级标题中日期的显示格式（Moment.js 格式），默认 YYYY-MM-DD")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value.trim() || "YYYY-MM-DD";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("周起始日")
      .setDesc("每周从哪一天开始")
      .addDropdown((dd) =>
        dd
          .addOption("monday", "周一")
          .addOption("sunday", "周日")
          .setValue(this.plugin.settings.weekStart)
          .onChange(async (value) => {
            this.plugin.settings.weekStart = value as "monday" | "sunday";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("星期几语言")
      .setDesc("日期标题中星期几的显示语言")
      .addDropdown((dd) =>
        dd
          .addOption("zh", "中文（星期一…星期日）")
          .addOption("en", "英文（Monday…Sunday）")
          .setValue(this.plugin.settings.weekdayLanguage)
          .onChange(async (value) => {
            this.plugin.settings.weekdayLanguage = value as "zh" | "en";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("插入时间戳格式")
      .setDesc("快速插入工作记录时的时间前缀（Moment.js 格式），默认 HH:mm")
      .addText((text) =>
        text
          .setPlaceholder("HH:mm")
          .setValue(this.plugin.settings.timestampFormat)
          .onChange(async (value) => {
            this.plugin.settings.timestampFormat = value.trim() || "HH:mm";
            await this.plugin.saveSettings();
          })
      );

    // ─── 自动化 ──────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "自动化" });

    new Setting(containerEl)
      .setName("自动生成全年框架")
      .setDesc("每年首次打开时自动生成全年所有日期结构")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoGenerateYearStructure)
          .onChange(async (value) => {
            this.plugin.settings.autoGenerateYearStructure = value;
            await this.plugin.saveSettings();
          })
      );

    // ─── 日历视图 ─────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "日历视图" });

    new Setting(containerEl)
      .setName("标记有内容的日期")
      .setDesc("在日历上用圆点标记有工作内容的日期")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showContentDots)
          .onChange(async (value) => {
            this.plugin.settings.showContentDots = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("日历视图默认位置")
      .addDropdown((dd) =>
        dd
          .addOption("right", "右侧边栏")
          .addOption("left", "左侧边栏")
          .addOption("tab", "主区域标签页")
          .setValue(this.plugin.settings.calendarPosition)
          .onChange(async (value) => {
            this.plugin.settings.calendarPosition = value as "right" | "left" | "tab";
            await this.plugin.saveSettings();
          })
      );
  }
}
