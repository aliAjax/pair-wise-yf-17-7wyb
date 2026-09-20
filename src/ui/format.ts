export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function formatCents(cents: number): string {
  const sign = cents > 0 ? "+" : "";
  return `${sign}${cents} cent`;
}

export function formatTemp(t: number): string {
  return `${t}℃`;
}

export function formatHumidity(h: number): string {
  return `${h}%`;
}
