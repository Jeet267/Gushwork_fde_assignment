import { undo } from "@/lib/jobs";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => ({ job: await undo(Number((await params).id)) }));
}
