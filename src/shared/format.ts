const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

/** "2026-11-03T10:00" (Tashkent wall time) → "3-noyabr, seshanba, 10:00" */
export function formatInterview(local: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return local;
  const [, y, mo, d, h, mi] = m;
  const wd = new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay();
  return `${+d}-${MONTHS[+mo - 1]}, ${WEEKDAYS[wd]}, ${h}:${mi}`;
}

/** ISO timestamp → "31-oktabr, 14:05" in Tashkent time (UTC+5, no DST). */
export function formatStamp(iso: string) {
  const t = new Date(new Date(iso).getTime() + 5 * 3600_000);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${t.getUTCDate()}-${MONTHS[t.getUTCMonth()]}, ${hh}:${mm}`;
}
