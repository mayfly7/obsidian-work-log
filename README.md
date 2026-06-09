# Work Log — Obsidian Plugin

**[English](#english) | [中文](#中文)**

---

<a id="english"></a>

## English

A feature-rich Obsidian plugin for daily work logging with a **single file per year**, organized by **month → week → date**, plus an interactive **calendar view** for quick navigation.

### Features

- **Yearly single-file structure** — One Markdown file per year (e.g. `2026-WorkLog.md`), auto-generated with full year scaffold
- **Calendar view** — Embedded panel with month/year switching, today highlight, content dots, hover preview, and right-click actions
- **Quick timestamp insertion** — Insert `- HH:mm` entries into the current date block; auto-creates missing date structure
- **Structure repair** — Detect and fix missing month/week/date headings without touching user content
- **Statistics panel** — Recorded days, entry count, character count per month
- **Full-text search** — Search across all work log files with keyword highlighting
- **Export** — Export by month/week/year to Markdown, HTML, or JSON
- **Fully configurable** — Storage folder, date format, week start day, weekday language, timestamp format, and more

### Commands

| Command | Description |
|---------|-------------|
| `Work Log: Open today's work log` | Open current year file and navigate to today |
| `Work Log: Jump to a specific date` | Date picker to jump to any date |
| `Work Log: Insert current time to work log` | Append timestamped entry to today's block |
| `Work Log: Open calendar view` | Open/focus the calendar panel |
| `Work Log: Repair current year file structure` | Fill in missing headings, preserve content |
| `Work Log: Regenerate current year file (dangerous)` | Full overwrite with confirmation |
| `Work Log: Export selected log range` | Export Markdown by month/week/year |
| `Work Log: Search work logs` | Open search panel |

### Installation

#### From Obsidian Community Plugins
1. Open Obsidian → Settings → Community Plugins
2. Disable Safe Mode
3. Click Browse, search for "Work Log"
4. Install and enable

#### Manual Installation
1. Download `main.js`, `manifest.json`, `styles.css` from the latest [Release](https://github.com/mayfly7/obsidian-work-log/releases)
2. Create folder `<your-vault>/.obsidian/plugins/obsidian-work-log/`
3. Copy the three files into the folder
4. Enable in Settings → Community Plugins

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Storage directory | `WorkLogs/` | Folder for year files |
| File name format | `{{year}}-WorkLog` | Supports `{{year}}` variable |
| Date format | `YYYY-MM-DD` | Display format in headings |
| Week start day | Monday | Monday / Sunday |
| Weekday language | Chinese | Chinese / English |
| Auto-generate full year scaffold | On | Generate structure on first open |
| Timestamp format | `HH:mm` | Inserted time prefix format |
| Show content markers on calendar | On | Dots for days with entries |
| Calendar default position | Right sidebar | Right / Left sidebar |

### Structure Example

```markdown
# 2026 Work Log

## January

### Week 1 (Jan 1 – Jan 4)

#### 2026-01-01 Thursday
- Annual planning
- Project kick-off meeting

#### 2026-01-02 Friday
- Set up dev environment
```

### Contributing

Pull requests and feature suggestions are welcome. Please open an issue first to discuss.

### License

MIT

---

<a id="中文"></a>

## 中文

以年度单文件形式记录每日工作，按月分组、按周归类，并提供日历视图快速跳转。

## 功能亮点

- **年度单文件**：每年一个 `.md` 文件，自动生成全年框架（所有月/周/日标题）
- **日历视图**：侧边栏日历，点击日期直接跳转，圆点标记有记录的日期
- **今日快捷入口**：Ribbon 图标 + 命令，一键定位今日
- **带时间戳插入**：快速追加 `- HH:mm 工作内容` 条目，光标自动聚焦
- **结构修复**：自动补全缺失的月/周/日标题，不破坏已有内容
- **Hover 预览**：鼠标悬停日历上任意日期，弹出工作内容快速预览
- **月度统计**：记录天数、条目数、总字数
- **全库搜索**：跨年度关键词搜索，结果直接跳转
- **多格式导出**：Markdown / HTML / JSON，支持按月导出

---

## 文件结构

```
obsidian-work-log/
├── src/
│   ├── main.ts          # 插件主入口，命令注册
│   ├── settings.ts      # 设置界面与默认值
│   ├── fileManager.ts   # 核心文件操作（生成/解析/定位/修复）
│   ├── dateUtils.ts     # 日期工具（周月分组/星期几/格式化）
│   ├── calendarView.ts  # 日历视图（ItemView）
│   └── statistics.ts    # 统计 + 搜索视图
├── styles.css           # 所有 UI 样式
├── manifest.json        # 插件清单
├── package.json
├── tsconfig.json
└── esbuild.config.mjs
```

---

## 本地开发安装

### 1. 安装依赖

```bash
cd obsidian-work-log
npm install
```

### 2. 构建

```bash
# 开发模式（watch）
npm run dev

# 生产构建
npm run build
```

### 3. 安装到 Obsidian

将以下文件复制到你的 Vault 的 `.obsidian/plugins/obsidian-work-log/` 目录：

```
main.js
manifest.json
styles.css
```

在 Obsidian 设置 → 社区插件 → 已安装插件 → 启用「工作日志 Work Log」。

---

## 生成的文件结构示例

```markdown
# 2026年工作日志

## 一月

### 第1周（1月1日 - 1月4日）

#### 2026-01-01 星期四
- 完成年度计划制定
- 参加项目启动会

#### 2026-01-02 星期五
- 搭建开发环境

### 第2周（1月5日 - 1月11日）

#### 2026-01-05 星期一
- 编写需求文档
```

---

## 命令列表

| 命令 | 说明 |
|---|---|
| 打开今日工作日志 | 打开当年文件并定位到今日 |
| 打开日历视图 | 打开日历侧边栏 |
| 跳转到指定日期 | 弹出日期选择器 |
| 插入当前时间到工作日志 | 在今日区块追加带时间戳条目 |
| 修复当前年度文件结构 | 补全缺失标题，不覆盖内容 |
| 显示月度统计 | 弹出本月统计通知 |
| 导出选中的日志范围 | 按月/全年导出 MD/HTML/JSON |
| 搜索工作日志 | 全库关键词搜索 |

---

## 设置项

| 设置 | 默认值 | 说明 |
|---|---|---|
| 存储目录 | `工作日志` | 相对仓库根目录 |
| 文件名格式 | `{{year}}-工作日志` | 支持 `{{year}}` |
| 日期格式 | `YYYY-MM-DD` | Moment.js 格式 |
| 周起始日 | 周一 | 周一/周日 |
| 星期几语言 | 中文 | 中文/英文 |
| 自动生成全年框架 | 开启 | |
| 插入时间戳格式 | `HH:mm` | |
| 日历标记有内容日期 | 开启 | 圆点标记 |
| 日历默认位置 | 右侧边栏 | 左/右/标签页 |
