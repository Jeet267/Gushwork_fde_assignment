import { createJob, HttpError } from "@/lib/jobs";
import { body, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Public endpoint behind the website "Request service" form.
 * Submissions land straight on the call list instead of in an inbox.
 */
export function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    // Hidden spam-trap field: real people never fill it in.
    if (b.website) return { ok: true };
    const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, 2000) : "");
    if (!str("customer_name")) throw new HttpError(400, "Please tell us your name");
    if (!str("phone") && !str("email")) throw new HttpError(400, "Please leave a phone number or email so we can reach you");
    const { merged } = await createJob(
      {
        customer_name: str("customer_name"), business: str("business"), phone: str("phone"), email: str("email"),
        address: str("address"), equipment: str("equipment"), problem: str("problem"),
        urgent: Boolean(b.urgent), source: "Website form",
      },
      { mergeOpen: true },
    );
    return { ok: true, merged };
  });
}
