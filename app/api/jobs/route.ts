import { createJob, listJobs, summary, type NewJobInput } from "@/lib/jobs";
import { body, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Everything the dashboard needs in one call: every job (with its next step) plus the numbers. */
export function GET() {
  return handle(async () => {
    const jobs = await listJobs();
    return { jobs, summary: summary(jobs) };
  });
}

/** "+ Add request": a phone call, text or referral logged from the dashboard. */
export function POST(req: Request) {
  return handle(async () => createJob((await body(req)) as unknown as NewJobInput));
}
