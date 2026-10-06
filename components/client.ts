// Shared client-side types, API calls and formatting.
import type { JobRow, NextStep } from "@/lib/rules";

export type Job = JobRow & { step: NextStep | null; waiting_days: number };
export interface HistoryItem { id: number; at: string; text: string }
export interface OtherJob { id: number; stage: string; problem: string | null; created_at: string; quote_amount: number | null }
export interface JobDetail { job: Job; history: HistoryItem[]; others: OtherJob[] }
export interface Summary {
  to_call_today: number; open_jobs: number; open_pipeline: number; median_hours_to_callback: number | null;
  done_30: number; done_30_value: number; lost_30: number; lost_30_value: number; new_7: number;
  by_stage: Record<string, number>; today: string;
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const money = (n?: number | null) =>
  n == null ? "" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export const telHref = (p?: string | null) => "tel:" + (p || "").replace(/[^\d+]/g, "");

/** Turns a YYYY-MM-DD into "today", "tomorrow", "Thu, Oct 8". */
export function dayLabel(day: string | null | undefined, today: string) {
  if (!day) return "";
  const d = new Date(day + "T12:00:00Z");
  const t = new Date(today + "T12:00:00Z");
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function waited(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function addDaysStr(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
