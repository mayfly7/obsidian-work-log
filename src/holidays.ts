/**
 * 中国法定节假日 — 联网获取 + 离线回退
 *
 * 数据来源：NateScarlet/holiday-cn (GitHub)
 * 每年启动时自动获取当年和下一年的节假日数据，失败则使用内置数据回退。
 */

/** 当前运行时的节假日缓存 { "YYYY-MM-DD": "节日名称" } */
const HOLIDAY_CACHE: Record<string, string> = {};

/** 已获取过的年份，避免重复请求 */
const FETCHED_YEARS = new Set<number>();

/** 内置回退数据，在联网失败时使用 */
const BUILTIN: Record<string, string> = {
  // ── 2026 ──
  "2026-01-01": "元旦",
  "2026-01-02": "元旦",
  "2026-01-03": "元旦",
  "2026-02-15": "春节",
  "2026-02-16": "春节",
  "2026-02-17": "春节",
  "2026-02-18": "春节",
  "2026-02-19": "春节",
  "2026-02-20": "春节",
  "2026-02-21": "春节",
  "2026-04-05": "清明",
  "2026-04-06": "清明",
  "2026-04-07": "清明",
  "2026-05-01": "劳动节",
  "2026-05-02": "劳动节",
  "2026-05-03": "劳动节",
  "2026-05-04": "劳动节",
  "2026-05-05": "劳动节",
  "2026-06-19": "端午",
  "2026-06-20": "端午",
  "2026-06-21": "端午",
  "2026-09-25": "中秋",
  "2026-09-26": "中秋",
  "2026-09-27": "中秋",
  "2026-10-01": "国庆",
  "2026-10-02": "国庆",
  "2026-10-03": "国庆",
  "2026-10-04": "国庆",
  "2026-10-05": "国庆",
  "2026-10-06": "国庆",
  "2026-10-07": "国庆",

  // ── 2027 ──
  "2027-01-01": "元旦",
  "2027-01-02": "元旦",
  "2027-01-03": "元旦",
  "2027-02-06": "春节",
  "2027-02-07": "春节",
  "2027-02-08": "春节",
  "2027-02-09": "春节",
  "2027-02-10": "春节",
  "2027-02-11": "春节",
  "2027-02-12": "春节",
  "2027-04-05": "清明",
  "2027-04-06": "清明",
  "2027-04-07": "清明",
  "2027-05-01": "劳动节",
  "2027-05-02": "劳动节",
  "2027-05-03": "劳动节",
  "2027-05-04": "劳动节",
  "2027-05-05": "劳动节",
  "2027-06-09": "端午",
  "2027-06-10": "端午",
  "2027-06-11": "端午",
  "2027-09-15": "中秋",
  "2027-09-16": "中秋",
  "2027-09-17": "中秋",
  "2027-10-01": "国庆",
  "2027-10-02": "国庆",
  "2027-10-03": "国庆",
  "2027-10-04": "国庆",
  "2027-10-05": "国庆",
  "2027-10-06": "国庆",
  "2027-10-07": "国庆",
};

/**
 * 联网获取指定年份的节假日数据
 * @param requestUrl Obsidian 的 requestUrl 函数（避免直接依赖 obsidian 模块）
 * @param year 目标年份
 */
export async function fetchHolidays(
  requestUrl: (opts: { url: string; method?: string }) => Promise<{ json: any; status: number }>,
  year: number
): Promise<void> {
  if (FETCHED_YEARS.has(year)) return;

  try {
    const url = `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`;
    const resp = await requestUrl({ url, method: "GET" });

    if (resp.status !== 200 || !resp.json?.days) {
      throw new Error("Invalid response");
    }

    for (const day of resp.json.days) {
      if (day.isOffDay && day.date) {
        HOLIDAY_CACHE[day.date] = day.name;
      }
    }

    FETCHED_YEARS.add(year);
  } catch {
    // 联网失败：使用内置数据回退
    for (const [key, val] of Object.entries(BUILTIN)) {
      if (key.startsWith(String(year) + "-") && !HOLIDAY_CACHE[key]) {
        HOLIDAY_CACHE[key] = val;
      }
    }
    FETCHED_YEARS.add(year);
  }
}

/** 获取指定日期的节假日名称，非节假日返回空字符串 */
export function getHolidayName(dateKey: string): string {
  return HOLIDAY_CACHE[dateKey] || "";
}
