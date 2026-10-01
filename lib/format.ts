const TZ = "Asia/Dubai";
const DAY = 86_400_000;

/** Calendar date (YYYY-MM-DD) in Asia/Dubai for a timestamp. */
export const dubaiDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(ms);

/** 09:00 Dubai time (UTC+4, no DST) on the current Dubai calendar date. */
export const demoAnchor = (nowMs: number) => Date.parse(`${dubaiDate(nowMs)}T09:00:00+04:00`);

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const addDays = (date: string, n: number) => new Date(utc(date) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

export const fmtTime = (ms: number) => timeFmt.format(ms);
export const fmtHm = (ms: number) => hmFmt.format(ms);
export const fmtDateTime = (ms: number) => dateTimeFmt.format(ms);
export const fmtDate = (date: string) => dateFmt.format(utc(date));

export const fmtKm = (km: number) => `${Math.round(km).toLocaleString("en-US")} km`;
export const fmtAed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
