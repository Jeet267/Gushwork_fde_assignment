import type { InStatement } from "@libsql/client";
import { all, get, run, tx } from "./db";
import {
  addDays, localDay, nextStep, OPEN_STAGES, STAGE_IDS, STAGE_LABEL, today, waitingDays,
  type JobRow, type NextStep, type StageId,
} from "./rules";

export type Job = JobRow & { step: NextStep | null; waiting_days: number };
export interface HistoryItem { id: number; at: string; text: string }

const now = () => new Date().toISOString();
const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const phoneKey = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-10);

function decorate(row: JobRow): Job {
  return { ...row, step: nextStep(row), waiting_days: waitingDays(row) };
}

const row = (id: number) => get<JobRow>("SELECT * FROM jobs WHERE id = ?", [id]);

const logStmt = (id: number, text: string): InStatement =>
  ({ sql: "INSERT INTO history (job_id, at, text) VALUES (?, ?, ?)", args: [id, now(), text] });

// ---------- reads ----------

export async function listJobs(): Promise<Job[]> {
  return (await all<JobRow>("SELECT * FROM jobs ORDER BY created_at DESC")).map(decorate);
}

export async function getJob(id: number) {
  const r = await row(id);
  if (!r) return null;
  const history = await all<HistoryItem>("SELECT id, at, text FROM history WHERE job_id = ? ORDER BY id DESC", [id]);
  const key = phoneKey(r.phone);
  const others = key
    ? (await all<JobRow>("SELECT * FROM jobs WHERE id != ? AND phone IS NOT NULL ORDER BY created_at DESC", [id]))
        .filter((o) => phoneKey(o.phone) === key)
        .map((o) => ({ id: o.id, stage: o.stage, problem: o.problem, created_at: o.created_at, quote_amount: o.quote_amount }))
    : [];
  return { job: decorate(r), history, others };
}

/** Most recent customer details for a phone number, so a repeat caller fills in on their own. */
export async function findCustomer(phone: string) {
  const key = phoneKey(phone);
  if (key.length < 7) return null;
  const match = (await all<JobRow>("SELECT * FROM jobs WHERE phone IS NOT NULL ORDER BY created_at DESC"))
    .filter((r) => phoneKey(r.phone) === key);
  if (!match.length) return null;
  const m = match[0];
  return { customer_name: m.customer_name, business: m.business, email: m.email, address: m.address, job_count: match.length };
}

// ---------- create ----------

export interface NewJobInput {
  customer_name: string;
  business?: string; phone?: string; email?: string; address?: string;
  equipment?: string; problem?: string; source?: string; urgent?: boolean; notes?: string;
}

const SOURCE_PHRASE: Record<string, string> = {
  "Phone call": "by phone", "Website form": "from the website form", Text: "by text",
  Referral: "by referral", "Repeat customer": "from a repeat customer",
};

export async function createJob(input: NewJobInput, opts: { mergeOpen?: boolean } = {}) {
  const name = (input.customer_name || "").trim();
  if (!name) throw new HttpError(400, "Customer name is required");
  const source = input.source || "Phone call";

  // A second website submission from the same phone joins the open request instead of duplicating it.
  if (opts.mergeOpen && phoneKey(input.phone)) {
    const open = (await all<JobRow>("SELECT * FROM jobs WHERE stage = 'new'")).find((r) => phoneKey(r.phone) === phoneKey(input.phone));
    if (open) {
      const extra = `Sent another request: ${input.problem || "(no details)"}`;
      await tx([
        { sql: "UPDATE jobs SET notes = trim(coalesce(notes,'') || char(10) || ?), urgent = max(urgent, ?), updated_at = ? WHERE id = ?",
          args: [extra, input.urgent ? 1 : 0, now(), open.id] },
        logStmt(open.id, extra),
      ]);
      return { job: decorate((await row(open.id))!), merged: true };
    }
  }

  const ts = now();
  const { lastInsertRowid: id } = await run(`
    INSERT INTO jobs (customer_name, business, phone, email, address, equipment, problem, source, urgent, notes,
      stage, stage_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`, [
    name, input.business || null, input.phone || null, input.email || null, input.address || null,
    input.equipment || null, input.problem || null, source, input.urgent ? 1 : 0, input.notes || null, ts, ts, ts,
  ]);
  await tx([logStmt(id, `Request came in ${SOURCE_PHRASE[source] || "(" + source + ")"}${input.urgent ? ". Equipment down" : ""}`)]);
  return { job: decorate((await row(id))!), merged: false };
}

// ---------- edit (the job form) ----------

export type JobPatch = Partial<Pick<JobRow,
  "customer_name" | "business" | "phone" | "email" | "address" | "equipment" | "problem" | "source" |
  "stage" | "follow_up_on" | "quote_amount" | "scheduled_for" | "tech" | "lost_reason" | "notes">> & { urgent?: boolean | number };

const EDITABLE = ["customer_name", "business", "phone", "email", "address", "equipment", "problem", "source", "urgent",
  "follow_up_on", "quote_amount", "scheduled_for", "tech", "lost_reason", "notes"] as const;

export async function updateJob(id: number, patch: JobPatch) {
  const cur = await row(id);
  if (!cur) throw new HttpError(404, "Job not found");
  const next: Record<string, unknown> = { ...cur };
  const notes: string[] = [];

  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    let v = (patch as Record<string, unknown>)[k];
    if (k === "urgent") v = v ? 1 : 0;
    if (v === "") v = null;
    if (k === "quote_amount" && v != null) v = Number(v);
    next[k] = v;
  }

  // Keep the stage in step with what she fills in, unless she picked a stage by hand.
  let stage = (patch.stage as StageId | undefined) ?? cur.stage;
  if (patch.stage && !STAGE_IDS.includes(patch.stage)) throw new HttpError(400, "Unknown stage");
  if (!patch.stage || patch.stage === cur.stage) {
    if (next.quote_amount != null && cur.quote_amount == null && (cur.stage === "new" || cur.stage === "quote")) stage = "awaiting";
    if (next.scheduled_for && !cur.scheduled_for && ["new", "quote", "awaiting", "approved"].includes(cur.stage)) stage = "scheduled";
  }
  if (stage === "lost" && !next.lost_reason) throw new HttpError(400, "Pick a reason the job was lost");

  if (next.quote_amount != null && next.quote_amount !== cur.quote_amount) notes.push(`Quote ${cur.quote_amount == null ? "sent" : "changed"}: ${money(next.quote_amount as number)}`);
  if (next.scheduled_for && next.scheduled_for !== cur.scheduled_for) notes.push(`Scheduled for ${next.scheduled_for}${next.tech ? " with " + next.tech : ""}`);
  else if (next.tech && next.tech !== cur.tech) notes.push(`Tech: ${next.tech}`);
  if (next.follow_up_on !== cur.follow_up_on && "follow_up_on" in patch) notes.push(next.follow_up_on ? `Call back on ${next.follow_up_on}` : "Call-back date cleared");

  const ts = now();
  if (stage !== cur.stage) {
    next.stage = stage;
    next.stage_at = ts;
    if (!("follow_up_on" in patch)) next.follow_up_on = null;
    if (stage === "awaiting" || stage === "quote") next.last_contact_at = ts;
    if (!cur.first_contact_at && stage !== "new" && stage !== "lost") next.first_contact_at = ts;
    notes.push(stage === "lost" ? `Marked lost: ${next.lost_reason}` : `Moved to ${STAGE_LABEL[stage]}`);
  }
  if (stage !== "lost") next.lost_reason = null;
  const otherChanged = EDITABLE.some((k) => k in patch && String(next[k] ?? "") !== String((cur as unknown as Record<string, unknown>)[k] ?? ""));
  if (otherChanged && !notes.length) notes.push("Details edited");

  next.updated_at = ts;
  next.undo_snapshot = null; // any edit cancels a pending undo
  next.undo_at = null;
  await tx([writeStmt(id, next), ...notes.map((n) => logStmt(id, n))]);
  return decorate((await row(id))!);
}

const WRITE_COLS = [...EDITABLE, "stage", "stage_at", "updated_at", "last_contact_at", "first_contact_at", "undo_snapshot", "undo_at"];

function writeStmt(id: number, f: Record<string, unknown>): InStatement {
  return {
    sql: `UPDATE jobs SET ${WRITE_COLS.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`,
    args: { ...Object.fromEntries(WRITE_COLS.map((c) => [c, (f[c] ?? null) as string | number | null])), id },
  };
}

// ---------- one-tap actions from the call list ----------

export type ActionName = "called" | "quote_sent" | "followed_up" | "yes" | "schedule" | "done" | "no_answer" | "callback" | "lost";

export interface ActionPayload { amount?: number; date?: string; tech?: string; reason?: string }

const UNDO_WINDOW_MS = 2 * 60_000;

export async function doAction(id: number, action: ActionName, p: ActionPayload = {}) {
  const cur = await row(id);
  if (!cur) throw new HttpError(404, "Job not found");
  const ts = now();
  const t = today();
  const m = await get<{ m: number }>("SELECT coalesce(max(id),0) AS m FROM history WHERE job_id = ?", [id]);
  const { undo_snapshot: _s, undo_at: _a, ...plain } = cur as JobRow & { undo_snapshot?: unknown; undo_at?: unknown };
  const snapshot = JSON.stringify({ row: plain, maxHist: Number(m?.m ?? 0) });

  const f: Record<string, unknown> = { ...cur };
  const firstTouch = () => { if (!f.first_contact_at) f.first_contact_at = ts; f.last_contact_at = ts; };
  const toStage = (s: StageId) => { f.stage = s; f.stage_at = ts; f.follow_up_on = null; };
  let note: string;
  let message: string;
  const name = cur.business || cur.customer_name;

  switch (action) {
    case "called":
      firstTouch(); toStage("quote");
      note = "Talked to them. Needs a quote";
      message = `${name} moved to Needs quote. It stays on today's list until you send it.`;
      break;
    case "quote_sent":
      if (p.amount != null && !Number.isNaN(Number(p.amount))) f.quote_amount = Number(p.amount);
      firstTouch(); toStage("awaiting");
      note = "Quote sent" + (f.quote_amount != null ? `: ${money(f.quote_amount as number)}` : "");
      message = `Quote logged. ${name} comes back to your list on ${addDays(t, 2)} if they haven't answered.`;
      break;
    case "followed_up":
      firstTouch(); f.follow_up_on = null;
      note = "Followed up on the quote";
      message = `Nice. ${name} comes back in 2 days if there's still no answer.`;
      break;
    case "yes":
      firstTouch(); toStage("approved");
      note = "They said yes";
      message = `${name} said yes. Now it needs a date.`;
      break;
    case "schedule":
      if (!p.date) throw new HttpError(400, "Pick a date");
      f.scheduled_for = p.date; if (p.tech) f.tech = p.tech;
      firstTouch(); toStage("scheduled");
      note = `Scheduled for ${p.date}${p.tech ? " with " + p.tech : ""}`;
      message = `Booked for ${p.date}. It comes back the day after so you can confirm it's done.`;
      break;
    case "done":
      toStage("done");
      note = "Marked done";
      message = `${name} is done.${cur.quote_amount ? " " + money(cur.quote_amount) + " for the books." : ""}`;
      break;
    case "no_answer":
      f.follow_up_on = addDays(t, 1);
      note = "No answer. Try again tomorrow";
      message = `No answer. ${name} is back on tomorrow's list.`;
      break;
    case "callback":
      if (!p.date) throw new HttpError(400, "Pick a date");
      f.follow_up_on = p.date; firstTouch();
      note = `Call back on ${p.date}`;
      message = `${name} comes back to your list on ${p.date}.`;
      break;
    case "lost":
      if (!p.reason) throw new HttpError(400, "Pick a reason");
      f.lost_reason = p.reason; toStage("lost");
      note = `Marked lost: ${p.reason}`;
      message = `${name} marked lost (${p.reason}).`;
      break;
    default:
      throw new HttpError(400, "Unknown action");
  }

  f.updated_at = ts;
  f.undo_snapshot = snapshot;
  f.undo_at = ts;
  await tx([writeStmt(id, f), logStmt(id, note)]);
  return { job: decorate((await row(id))!), message };
}

export async function undo(id: number) {
  const cur = await get<{ undo_snapshot: string | null; undo_at: string | null }>(
    "SELECT undo_snapshot, undo_at FROM jobs WHERE id = ?", [id]);
  if (!cur?.undo_snapshot || !cur.undo_at || Date.now() - Date.parse(cur.undo_at) > UNDO_WINDOW_MS) {
    throw new HttpError(409, "Too late to undo this one");
  }
  const { row: prev, maxHist } = JSON.parse(cur.undo_snapshot) as { row: JobRow; maxHist: number };
  await tx([
    writeStmt(id, { ...prev, undo_snapshot: null, undo_at: null }),
    { sql: "DELETE FROM history WHERE job_id = ? AND id > ?", args: [id, maxHist] },
  ]);
  return decorate((await row(id))!);
}

// ---------- numbers for the books ----------

export function summary(jobs: Job[]) {
  const t = today();
  const cutoff = addDays(t, -30);
  const open = jobs.filter((j) => OPEN_STAGES.includes(j.stage));
  const recent = (j: Job) => localDay(j.stage_at) >= cutoff;
  const hours = jobs
    .filter((j) => j.first_contact_at && localDay(j.created_at) >= cutoff)
    .map((j) => (Date.parse(j.first_contact_at!) - Date.parse(j.created_at)) / 3600_000)
    .sort((a, b) => a - b);
  const median = hours.length ? hours[Math.floor(hours.length / 2)] : null;
  const done30 = jobs.filter((j) => j.stage === "done" && recent(j));
  const lost30 = jobs.filter((j) => j.stage === "lost" && recent(j));
  const byStage = Object.fromEntries(STAGE_IDS.map((s) => [s, jobs.filter((j) => j.stage === s).length]));

  return {
    to_call_today: open.filter((j) => j.step?.due_now).length,
    open_jobs: open.length,
    open_pipeline: open.reduce((s, j) => s + (j.quote_amount || 0), 0),
    median_hours_to_callback: median,
    done_30: done30.length,
    done_30_value: done30.reduce((s, j) => s + (j.quote_amount || 0), 0),
    lost_30: lost30.length,
    lost_30_value: lost30.reduce((s, j) => s + (j.quote_amount || 0), 0),
    new_7: jobs.filter((j) => localDay(j.created_at) >= addDays(t, -7)).length,
    by_stage: byStage,
    today: t,
  };
}

export function toCsv(jobs: Job[]) {
  const cols: [string, (j: Job) => unknown][] = [
    ["ID", (j) => j.id], ["Received", (j) => localDay(j.created_at)], ["Customer", (j) => j.customer_name],
    ["Business", (j) => j.business], ["Phone", (j) => j.phone], ["Email", (j) => j.email], ["Source", (j) => j.source],
    ["Equipment", (j) => j.equipment], ["Problem", (j) => j.problem], ["Urgent", (j) => (j.urgent ? "Yes" : "")],
    ["Stage", (j) => STAGE_LABEL[j.stage]], ["Quote", (j) => j.quote_amount ?? ""], ["Scheduled for", (j) => j.scheduled_for],
    ["Tech", (j) => j.tech], ["Lost reason", (j) => j.lost_reason], ["Next step", (j) => j.step?.text], ["Next step due", (j) => j.step?.due],
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => c[0]).join(","), ...jobs.map((j) => cols.map(([, f]) => esc(f(j))).join(","))].join("\n");
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
