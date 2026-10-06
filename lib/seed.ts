import type { InStatement } from "@libsql/client";
import { addDays, today } from "./rules";

const H = 3600_000;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();

interface SeedJob {
  customer_name: string;
  business: string;
  phone: string;
  equipment: string;
  problem: string;
  source: string;
  urgent?: boolean;
  stage: string;
  createdH: number; // hours ago the request came in
  stageH: number; // hours ago it entered its current stage
  contactH?: number; // hours ago we first spoke to them
  lastContactH?: number;
  follow_up_on?: string | null;
  quote_amount?: number;
  scheduled_for?: string;
  tech?: string;
  lost_reason?: string;
  notes?: string;
  history: string[];
}

/** A realistic week for Denise's shop, all relative to "now" so the demo never goes stale. */
export function seedStatements(): InStatement[] {
  const t = today();
  const jobs: SeedJob[] = [
    {
      customer_name: "Rosa Delgado", business: "Rosa's Taqueria", phone: "(312) 555-0141", equipment: "Walk-in freezer",
      problem: "Freezer at 28°F and climbing, compressor clicking. Full of product.", source: "Phone call", urgent: true,
      stage: "new", createdH: 2, stageH: 2, history: ["Request came in by phone"],
    },
    {
      customer_name: "Mike Haran", business: "Harbor Grill", phone: "(312) 555-0187", equipment: "Walk-in freezer",
      problem: "Called Friday afternoon. Freezer not holding temp, door gasket torn.", source: "Phone call",
      stage: "new", createdH: 96, stageH: 96, history: ["Request came in by phone"],
    },
    {
      customer_name: "Priya Shah", business: "Green Valley Market", phone: "(773) 555-0122", equipment: "Ice machine",
      problem: "Ice machine making thin cubes, slow harvest. Website form.", source: "Website form",
      stage: "new", createdH: 20, stageH: 20, history: ["Request came in from the website form"],
    },
    {
      customer_name: "Tom Becker", business: "Blue Door Bistro", phone: "(312) 555-0199", equipment: "Reach-in / prep table",
      problem: "Prep table running warm on the line. Tech visited, needs new fan motor.", source: "Referral",
      stage: "quote", createdH: 50, stageH: 26, contactH: 47, history: ["Request came in by referral (from Oak St Cafe)", "Talked to Tom. Needs a quote"],
    },
    {
      customer_name: "Raj Patel", business: "Patel Cold Storage", phone: "(708) 555-0160", equipment: "Walk-in cooler",
      problem: "Warehouse cooler #3: evaporator coil icing. Wants price for coil replacement.", source: "Repeat customer",
      stage: "quote", createdH: 6, stageH: 5, contactH: 5, history: ["Request came in by text", "Talked to Raj. Needs a quote"],
    },
    {
      customer_name: "Linda Moore", business: "Sunrise Diner", phone: "(312) 555-0110", equipment: "Walk-in cooler",
      problem: "Condenser fan replacement + refrigerant recharge.", source: "Phone call",
      stage: "awaiting", createdH: 120, stageH: 74, contactH: 100, lastContactH: 74, quote_amount: 850,
      history: ["Request came in by phone", "Talked to Linda. Needs a quote", "Quote sent: $850"],
    },
    {
      customer_name: "Sam Ortiz", business: "Lakeview Brewery", phone: "(773) 555-0175", equipment: "Walk-in cooler",
      problem: "Keg cooler compressor replacement.", source: "Website form",
      stage: "awaiting", createdH: 60, stageH: 20, contactH: 52, lastContactH: 20, quote_amount: 1400,
      history: ["Request came in from the website form", "Talked to Sam. Needs a quote", "Quote sent: $1,400"],
    },
    {
      customer_name: "Gina Russo", business: "Mama Lucia's", phone: "(312) 555-0133", equipment: "Display case",
      problem: "Gelato display case not cooling. Approved the $480 quote.", source: "Repeat customer",
      stage: "approved", createdH: 80, stageH: 22, contactH: 78, lastContactH: 22, quote_amount: 480,
      history: ["Request came in by text", "Quote sent: $480", "They said yes"],
    },
    {
      customer_name: "Dan Kim", business: "Fresh Mart #2", phone: "(708) 555-0144", equipment: "Ice machine",
      problem: "Annual descale + water filter swap on 2 ice machines.", source: "Repeat customer",
      stage: "scheduled", createdH: 150, stageH: 30, contactH: 148, lastContactH: 30, quote_amount: 390,
      scheduled_for: addDays(t, 1), tech: "Marcus",
      history: ["Request came in by text", "Quote sent: $390", "They said yes", "Scheduled with Marcus"],
    },
    {
      customer_name: "Ella Brooks", business: "Oak St Cafe", phone: "(312) 555-0152", equipment: "Walk-in cooler",
      problem: "Thermostat replacement.", source: "Phone call",
      stage: "scheduled", createdH: 200, stageH: 90, contactH: 196, lastContactH: 90, quote_amount: 270,
      scheduled_for: addDays(t, -2), tech: "Tony",
      history: ["Request came in by phone", "Quote sent: $270", "They said yes", "Scheduled with Tony"],
    },
    {
      customer_name: "Hank Fuller", business: "Corner Deli", phone: "(773) 555-0108", equipment: "Reach-in / prep table",
      problem: "Two reach-ins, door hinges + gaskets.", source: "Referral",
      stage: "awaiting", createdH: 100, stageH: 70, contactH: 96, lastContactH: 30, quote_amount: 640,
      follow_up_on: addDays(t, 2), notes: "Said: call me back Thursday, owner is out of town.",
      history: ["Request came in by referral", "Quote sent: $640", "Followed up. Call back on " + addDays(t, 2)],
    },
    {
      customer_name: "Nora James", business: "Riverside Hotel", phone: "(312) 555-0191", equipment: "Ice machine",
      problem: "Ice machine leaking.", source: "Website form",
      stage: "done", createdH: 300, stageH: 120, contactH: 296, lastContactH: 120, quote_amount: 620, tech: "Luis",
      scheduled_for: addDays(t, -6), history: ["Request came in from the website form", "Quote sent: $620", "They said yes", "Marked done"],
    },
    {
      customer_name: "Quan Nguyen", business: "Pho 99", phone: "(773) 555-0117", equipment: "Walk-in freezer",
      problem: "Freezer down on a Friday. We didn't call back until Monday.", source: "Phone call", urgent: true,
      stage: "lost", createdH: 260, stageH: 190, quote_amount: 2000, lost_reason: "Hired someone else",
      history: ["Request came in by phone", "Marked lost: Hired someone else"],
    },
    {
      customer_name: "Carl Weiss", business: "Northside Distribution", phone: "(708) 555-0129", equipment: "Walk-in freezer",
      problem: "Warehouse freezer compressor swap.", source: "Referral",
      stage: "done", createdH: 500, stageH: 240, contactH: 497, lastContactH: 240, quote_amount: 2300, tech: "Dee",
      scheduled_for: addDays(t, -11), history: ["Request came in by referral", "Quote sent: $2,300", "They said yes", "Marked done"],
    },
    {
      customer_name: "Rosa Delgado", business: "Rosa's Taqueria", phone: "(312) 555-0141", equipment: "Ice machine",
      problem: "Ice machine cleaning.", source: "Phone call",
      stage: "done", createdH: 960, stageH: 900, contactH: 958, lastContactH: 900, quote_amount: 180, tech: "Marcus",
      history: ["Request came in by phone", "Marked done"],
    },
  ];

  const out: InStatement[] = [];
  jobs.forEach((j, i) => {
    const id = i + 1;
    out.push({
      sql: `INSERT INTO jobs (id, customer_name, business, phone, equipment, problem, source, urgent, stage, stage_at, created_at,
        updated_at, first_contact_at, last_contact_at, follow_up_on, quote_amount, scheduled_for, tech, lost_reason, notes)
        VALUES (@id, @customer_name, @business, @phone, @equipment, @problem, @source, @urgent, @stage, @stage_at, @created_at,
        @updated_at, @first_contact_at, @last_contact_at, @follow_up_on, @quote_amount, @scheduled_for, @tech, @lost_reason, @notes)`,
      args: {
        id, customer_name: j.customer_name, business: j.business, phone: j.phone, equipment: j.equipment, problem: j.problem,
        source: j.source, urgent: j.urgent ? 1 : 0, stage: j.stage, stage_at: ago(j.stageH), created_at: ago(j.createdH),
        updated_at: ago(j.stageH), first_contact_at: j.contactH != null ? ago(j.contactH) : null,
        last_contact_at: j.lastContactH != null ? ago(j.lastContactH) : j.contactH != null ? ago(j.contactH) : null,
        follow_up_on: j.follow_up_on ?? null, quote_amount: j.quote_amount ?? null, scheduled_for: j.scheduled_for ?? null,
        tech: j.tech ?? null, lost_reason: j.lost_reason ?? null, notes: j.notes ?? null,
      },
    });
    const step = (j.createdH - j.stageH) / Math.max(1, j.history.length - 1);
    j.history.forEach((text, k) =>
      out.push({ sql: "INSERT INTO history (job_id, at, text) VALUES (?, ?, ?)", args: [id, ago(j.createdH - step * k), text] }));
  });
  return out;
}
