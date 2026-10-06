import { listJobs, toCsv } from "@/lib/jobs";
import { today } from "@/lib/rules";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(toCsv(await listJobs()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="callboard-jobs-${today()}.csv"`,
    },
  });
}
