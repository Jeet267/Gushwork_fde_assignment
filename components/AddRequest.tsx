"use client";

import { useEffect, useRef, useState } from "react";
import { EQUIPMENT, SOURCES } from "@/lib/rules";
import { Modal } from "./Dialogs";
import { api, type Job } from "./client";

interface Found { customer_name: string; business: string | null; email: string | null; address: string | null; job_count: number }

/** Log a phone call, text or referral in about ten seconds. */
export function AddRequest({ onClose, onAdded }: { onClose: () => void; onAdded: (job: Job) => void }) {
  const [f, setF] = useState({
    phone: "", customer_name: "", business: "", email: "", address: "",
    equipment: "", problem: "", source: "Phone call", urgent: false,
  });
  const [found, setFound] = useState<Found | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const touched = useRef(new Set<string>());

  const set = (k: keyof typeof f, v: string | boolean) => {
    touched.current.add(k);
    setF((p) => ({ ...p, [k]: v }));
  };

  // Recognise a returning customer by phone number and fill in what we already know.
  useEffect(() => {
    const digits = f.phone.replace(/\D/g, "");
    if (digits.length < 7) { setFound(null); return; }
    const t = setTimeout(async () => {
      const { customer } = await api<{ customer: Found | null }>(`/api/customers?phone=${encodeURIComponent(f.phone)}`);
      setFound(customer);
      if (customer) {
        setF((p) => ({
          ...p,
          customer_name: touched.current.has("customer_name") ? p.customer_name : customer.customer_name,
          business: touched.current.has("business") ? p.business : customer.business || "",
          email: touched.current.has("email") ? p.email : customer.email || "",
          address: touched.current.has("address") ? p.address : customer.address || "",
          source: touched.current.has("source") ? p.source : "Repeat customer",
        }));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [f.phone]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!f.customer_name.trim()) { setErr("Add a name so you know who to call."); return; }
    setBusy(true);
    try {
      const { job } = await api<{ job: Job }>("/api/jobs", { method: "POST", json: f });
      onAdded(job);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a request" sub="A call, text or referral. It goes straight onto today's list." onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-b">
          <div className="fields">
            <label className="f">Phone
              <input autoFocus type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(312) 555-0100" />
            </label>
            <label className="f">Came in by
              <select value={f.source} onChange={(e) => set("source", e.target.value)}>
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            {found && (
              <div className="match full">
                Returning customer: {found.business || found.customer_name}, {found.job_count} earlier job{found.job_count === 1 ? "" : "s"}. Details filled in.
              </div>
            )}
            <label className="f">Contact name
              <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Who called" />
            </label>
            <label className="f">Business
              <input value={f.business} onChange={(e) => set("business", e.target.value)} placeholder="Restaurant / store" />
            </label>
            <label className="f">Equipment
              <select value={f.equipment} onChange={(e) => set("equipment", e.target.value)}>
                <option value="">—</option>
                {EQUIPMENT.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="f">Address
              <input value={f.address} onChange={(e) => set("address", e.target.value)} />
            </label>
            <label className="f full">What&apos;s wrong?
              <textarea value={f.problem} onChange={(e) => set("problem", e.target.value)} placeholder="Freezer not holding temp…" />
            </label>
            <label className="check full">
              <input type="checkbox" checked={f.urgent} onChange={(e) => set("urgent", e.target.checked)} />
              Equipment is down right now (puts it at the top of the list)
            </label>
            {err && <div className="err full">{err}</div>}
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Add to list"}</button>
        </div>
      </form>
    </Modal>
  );
}
