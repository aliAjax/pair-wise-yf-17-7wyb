import type { BatchStatus } from "../types";

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const STATUS_TEXT: Record<BatchStatus, string> = {
  recording: "记录中",
  review: "待复核",
  released: "已放行",
};

export function statusClass(status: BatchStatus): string {
  return `badge badge-${status}`;
}

export function centText(cents: number): string {
  if (cents > 0) return `+${cents}`;
  return String(cents);
}
