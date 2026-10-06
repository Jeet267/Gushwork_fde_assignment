import { doAction, type ActionName, type ActionPayload } from "@/lib/jobs";
import { body, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { action, ...payload } = await body(req);
    return doAction(Number((await params).id), action as ActionName, payload as ActionPayload);
  });
}
