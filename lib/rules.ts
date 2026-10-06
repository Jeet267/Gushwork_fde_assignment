// Pipeline stages and the follow-up rules behind "Who to call today".
// Every open job has exactly one next step with a due date. If it's due today or
// earlier, the job is on the call list. A manual "call back on" date overrides the rule.

export const STAGES = [
  { id: "new", label: "New request" },
  { id: "quote", label: "Needs quote" },
  { id: "awaiting", label: "Waiting on yes" },
  { id: "approved", label: "Needs scheduling" },
  { id: "scheduled", label: "Scheduled" },
  { id: "done", label: "Done" },
  { id: "lost", label: "Lost" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
export const OPEN_STAGES: StageId[] = ["new", "quote", "awaiting", "approved", "scheduled"];

export const SOURCES = ["Phone call", "Website form", "Text", "Referral", "Repeat customer"];
export const EQUIPMENT = ["Walk-in cooler", "Walk-in freezer", "Ice machine", "Reach-in / prep table", "Display case", "Other"];
export const TECHS = ["Marcus", "Tony", "Luis", "Dee"];
export const LOST_REASONS = ["Hired someone else", "Price too high", "Never heard back", "Fixed it themselves", "Not a job we do", "Other"];

/** A sent quote can go unanswered this long before it comes back onto the call list. */
export const QUOTE_FOLLOWUP_DAYS = 2;

/** "Today" is the business's local day, not the server's. */
export const TZ = process.env.BUSINESS_TZ || "America/Chicago";

/** YYYY-MM-DD for an instant, in the business's time zone. */
export function localDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function today(): string {
  return localDay(new Date());
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
}

export interface JobRow {
  id: number;
  customer_name: string;
  business: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  equipment: string | null;
  problem: string | null;
  source: string;
  urgent: number;
  stage: StageId;
  stage_at: string;
  created_at: string;
  updated_at: string;
  last_contact_at: string | null;
  first_contact_at: string | null;
  follow_up_on: string | null;
  quote_amount: number | null;
  scheduled_for: string | null;
  tech: string | null;
  lost_reason: string | null;
  notes: string | null;
}

export interface NextStep {
  due: string;
  pri: number;
  text: string;
  manual: boolean;
  overdue_days: number;
  due_now: boolean;
}

export function nextStep(job: JobRow): NextStep | null {
  if (!OPEN_STAGES.includes(job.stage)) return null;
  const t = today();
  const stageDay = localDay(job.stage_at);
  let step: Omit<NextStep, "manual" | "overdue_days" | "due_now">;

  switch (job.stage) {
    case "new":
      step = {
        due: localDay(job.created_at),
        pri: job.urgent ? 0 : 1,
        text: job.urgent ? "Equipment down. Call back now" : "Hasn't heard from us yet",
      };
      break;
    case "quote":
      step = { due: stageDay, pri: job.urgent ? 1 : 2, text: "Waiting on a quote from you" };
      break;
    case "awaiting": {
      const last = localDay(job.last_contact_at || job.stage_at);
      step = { due: addDays(last, QUOTE_FOLLOWUP_DAYS), pri: 3, text: "Quote sent, no answer yet" };
      break;
    }
    case "approved":
      step = { due: stageDay, pri: 2, text: "Said yes, needs a date" };
      break;
    default: {
      const day = job.scheduled_for || stageDay;
      step = {
        due: addDays(day, 1),
        pri: 4,
        text: day < t ? "Job date passed. Confirm it's done" : "Booked. Confirm it's done after the job",
      };
    }
  }

  let manual = false;
  if (job.follow_up_on) {
    step.due = job.follow_up_on;
    manual = true;
  }
  return { ...step, manual, overdue_days: Math.max(0, diffDays(t, step.due)), due_now: step.due <= t };
}

/** Days the customer has been waiting on us in the current stage (or since the last nudge on a quote). */
export function waitingDays(job: JobRow): number {
  const from = job.stage === "awaiting" ? job.last_contact_at || job.stage_at : job.stage_at;
  return Math.max(0, diffDays(today(), localDay(from)));
}
