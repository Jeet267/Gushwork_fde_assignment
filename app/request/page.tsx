"use client";

import { useState } from "react";
import { EQUIPMENT } from "@/lib/rules";

/** The customer-facing "Request service" form for the website. Submissions land on Denise's call list. */
export default function RequestPage() {
  const [f, setF] = useState({ customer_name: "", business: "", phone: "", email: "", address: "", equipment: "", problem: "", urgent: false, website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setState("sending");
    const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "Something went wrong. Please call us."); setState("idle"); return; }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <main className="public">
        <div className="thanks">
          <h1>Got it. Thank you!</h1>
          <p className="lead" style={{ margin: "8px 0 0" }}>
            {f.urgent ? "We see your equipment is down. We'll call you back as fast as we can." : "We'll call you back, usually the same business day."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="public">
      <h1>Request service</h1>
      <p className="lead">Walk-in coolers, freezers, ice machines and display cases. Tell us what&apos;s going on and we&apos;ll call you back.</p>
      <form onSubmit={submit}>
        <div className="fields">
          <label className="f">Your name *<input required value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} /></label>
          <label className="f">Business<input value={f.business} onChange={(e) => set("business", e.target.value)} placeholder="Restaurant, store, warehouse" /></label>
          <label className="f">Phone *<input required type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className="f">Email<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label className="f full">Address<input value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
          <label className="f full">Equipment
            <select value={f.equipment} onChange={(e) => set("equipment", e.target.value)}>
              <option value="">Choose one</option>
              {EQUIPMENT.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="f full">What&apos;s happening?<textarea rows={4} value={f.problem} onChange={(e) => set("problem", e.target.value)} placeholder="e.g. Freezer reading 25°F and rising, compressor making noise" /></label>
          <div className={"urgent-box full" + (f.urgent ? " on" : "")}>
            <label className="check"><input type="checkbox" checked={f.urgent} onChange={(e) => set("urgent", e.target.checked)} /> My equipment is down right now</label>
          </div>
          <div className="trap" aria-hidden="true">
            <label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} /></label>
          </div>
          {err && <div className="err full">{err}</div>}
          <div className="full"><button className="btn primary" style={{ width: "100%", padding: "11px" }} disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send request"}</button></div>
        </div>
      </form>
    </main>
  );
}
