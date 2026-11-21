/** 日本の国民の祝日・振替休日・国民の休日判定ヘルパー (2000〜2099年対応) */

const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysYmd(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekUtc(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** 第n月曜日の日(1-31)を返す */
function nthMondayDay(year: number, month: number, nth: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (1 - firstDow + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

/** 春分の日 (1980〜2099) */
function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 秋分の日 (1980〜2099) */
function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 国民の祝日（振替休日・国民の休日を除く基本祝日名）を返す */
function getBaseJapaneseHolidayName(dateStr: string): string | null {
  if (!VALID_DATE_RE.test(dateStr)) return null;
  const [year, month, day] = dateStr.split("-").map(Number);

  // 1月
  if (month === 1 && day === 1) return "元日";
  if (month === 1) {
    if (year >= 2000 && day === nthMondayDay(year, 1, 2)) return "成人の日";
    if (year < 2000 && day === 15) return "成人の日";
  }

  // 2月
  if (month === 2 && day === 11) return "建国記念の日";
  if (month === 2 && day === 23 && year >= 2020) return "天皇誕生日";

  // 3月
  if (month === 3 && year >= 1980 && year <= 2099 && day === vernalEquinoxDay(year)) {
    return "春分の日";
  }

  // 4月
  if (month === 4 && day === 29) return year >= 2007 ? "昭和の日" : "みどりの日";

  // 5月
  if (month === 5 && day === 3) return "憲法記念日";
  if (month === 5 && day === 4 && year >= 2007) return "みどりの日";
  if (month === 5 && day === 5) return "こどもの日";

  // 7月（2020・2021年は五輪特例）
  if (month === 7) {
    if (year === 2020) {
      if (day === 23) return "海の日";
      if (day === 24) return "スポーツの日";
    } else if (year === 2021) {
      if (day === 22) return "海の日";
      if (day === 23) return "スポーツの日";
    } else if (year >= 2003 && day === nthMondayDay(year, 7, 3)) {
      return "海の日";
    } else if (year >= 1996 && year < 2003 && day === 20) {
      return "海の日";
    }
  }

  // 8月（2020・2021年は五輪特例）
  if (month === 8) {
    if (year === 2020 && day === 10) return "山の日";
    if (year === 2021 && day === 8) return "山の日";
    if (year >= 2016 && year !== 2020 && year !== 2021 && day === 11) return "山の日";
  }

  // 9月
  if (month === 9) {
    if (year >= 2003 && day === nthMondayDay(year, 9, 3)) return "敬老の日";
    if (year < 2003 && day === 15) return "敬老の日";
    if (year >= 1980 && year <= 2099 && day === autumnalEquinoxDay(year)) return "秋分の日";
  }

  // 10月（2020・2021年は7月に移動）
  if (month === 10 && year !== 2020 && year !== 2021) {
    if (year >= 2020 && day === nthMondayDay(year, 10, 2)) return "スポーツの日";
    if (year >= 2000 && year < 2020 && day === nthMondayDay(year, 10, 2)) return "体育の日";
    if (year < 2000 && day === 10) return "体育の日";
  }

  // 11月
  if (month === 11 && day === 3) return "文化の日";
  if (month === 11 && day === 23) return "勤労感謝の日";

  // 12月（〜2018年）
  if (month === 12 && day === 23 && year <= 2018) return "天皇誕生日";

  return null;
}

const holidayCache = new Map<string, string | null>();

/**
 * 指定日 (`YYYY-MM-DD`) が日本の国民の祝日・振替休日・国民の休日であれば名称を返し、
 * そうでなければ `null` を返す。
 */
export function getJapaneseHolidayName(dateStr: string): string | null {
  if (holidayCache.has(dateStr)) return holidayCache.get(dateStr)!;
  if (!VALID_DATE_RE.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (dateStr !== formatYmd(y, m, d)) return null;

  let result: string | null = getBaseJapaneseHolidayName(dateStr);
  if (!result) {
    const dow = dayOfWeekUtc(dateStr);

    // 振替休日: 日曜日の祝日の翌日以降で最初の祝日でない日
    if (dow !== 0) {
      let cursor = addDaysYmd(dateStr, -1);
      while (getBaseJapaneseHolidayName(cursor) !== null) {
        if (dayOfWeekUtc(cursor) === 0) {
          result = "振替休日";
          break;
        }
        cursor = addDaysYmd(cursor, -1);
      }
    }

    // 国民の休日: 前後を国民の祝日に挟まれた平日（2007年以降、実質1988年以降）
    if (!result && dow !== 0 && y >= 1988) {
      const prev = addDaysYmd(dateStr, -1);
      const next = addDaysYmd(dateStr, 1);
      if (getBaseJapaneseHolidayName(prev) !== null && getBaseJapaneseHolidayName(next) !== null) {
        result = "国民の休日";
      }
    }
  }

  if (holidayCache.size >= 2000) holidayCache.clear();
  holidayCache.set(dateStr, result);
  return result;
}
