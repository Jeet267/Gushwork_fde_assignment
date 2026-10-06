import { findCustomer } from "@/lib/jobs";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Recognise a returning customer by phone number. */
export function GET(req: Request) {
  return handle(async () => ({ customer: await findCustomer(new URL(req.url).searchParams.get("phone") || "") }));
}
