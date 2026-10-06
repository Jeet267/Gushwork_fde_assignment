import { getJob, HttpError, updateJob, type JobPatch } from "@/lib/jobs";
import { body, handle } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const data = await getJob(Number((await params).id));
    if (!data) throw new HttpError(404, "Job not found");
    return data;
  });
}

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = Number((await params).id);
    await updateJob(id, (await body(req)) as JobPatch);
    return await getJob(id);
  });
}
