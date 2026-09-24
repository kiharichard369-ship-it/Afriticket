import { format, isSameDay, parseISO } from "date-fns";

export function formatEventDate(iso: string): string {
  return format(parseISO(iso), "EEE, d MMM yyyy");
}

export function formatEventTime(iso: string): string {
  return format(parseISO(iso), "h:mm a");
}

export function formatEventDateTime(iso: string): string {
  return `${formatEventDate(iso)} · ${formatEventTime(iso)}`;
}

export function formatDateRange(startIso: string, endIso?: string): string {
  if (!endIso) return formatEventDateTime(startIso);
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  if (isSameDay(start, end)) {
    return `${format(start, "EEE, d MMM yyyy")} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
  }
  return `${format(start, "d MMM, h:mm a")} – ${format(end, "d MMM yyyy, h:mm a")}`;
}

export function monthKeyLabel(monthKey: string): string {
  // monthKey: "2026-10"
  const [y, m] = monthKey.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMMM yyyy");
}

export function currentMonthKey(): string {
  const now = new Date();
  return format(now, "yyyy-MM");
}
