/**
 * Display formatting. Timestamps are stored in UTC (timestamptz) and rendered in the
 * factory timezone, configurable via NEXT_PUBLIC_DISPLAY_TIMEZONE (default Asia/Colombo).
 */
export const DISPLAY_TIMEZONE = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || "Asia/Colombo";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: DISPLAY_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

export function formatDateTime(value: Date | string): string {
  return dateTimeFormat.format(typeof value === "string" ? new Date(value) : value);
}

export function formatYards(value: number): string {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} yd`;
}

export function formatPct(value: number, { signed = true } = {}): string {
  const text = `${Math.abs(value).toFixed(2)}%`;
  if (!signed || value === 0) return value < 0 ? `-${text}` : text;
  return value > 0 ? `+${text}` : `−${text}`;
}

export function formatInt(value: number): string {
  return value.toLocaleString("en-US");
}
