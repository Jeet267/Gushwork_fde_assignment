"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LOST_REASONS, TECHS } from "@/lib/rules";
import { addDaysStr, type Job } from "./client";

export function Modal({ title, sub, children, onClose }: { title: string; sub?: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export type PromptKind = "quote" | "schedule" | "callback" | "lost";
export interface PromptState { kind: PromptKind; job: Job }
export interface PromptResult { action: string; amount?: number; date?: string; tech?: string; reason?: string }

/** The small question an action needs before it can run: how much, which day, which tech, or why lost. */
export function ActionPrompt({ state, today, onCancel, onSubmit }: {
  state: PromptState; today: string; onCancel: () => void; onSubmit: (r: PromptResult) => void;
}) {
  const { kind, job } = state;
  const [amount, setAmount] = useState(job.quote_amount != null ? String(job.quote_amount) : "");
  const [date, setDate] = useState(kind === "schedule" ? job.scheduled_for || addDaysStr(today, 1) : job.follow_up_on || addDaysStr(today, 2));
  const [tech, setTech] = useState(job.tech || "");
  const [reason, setReason] = useState("");
  const name = job.business || job.customer_name;

  const cfg = {
    quote: { title: "I sent the quote", sub: `How much did you quote ${name}? They come back to your list in 2 days if they haven't answered.`, btn: "Log quote" },
    schedule: { title: "Schedule the job", sub: `Pick a day for ${name}.`, btn: "Schedule" },
    callback: { title: "Call back on…", sub: `When did ${name} ask you to call back?`, btn: "Set call-back" },
    lost: { title: "Mark lost", sub: `Why did ${name} not go ahead? This keeps your numbers honest.`, btn: "Mark lost" },
  }[kind];

  const valid = kind === "lost" ? !!reason : kind === "quote" ? true : !!date;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (kind === "quote") onSubmit({ action: "quote_sent", amount: amount ? Number(amount) : undefined });
    if (kind === "schedule") onSubmit({ action: "schedule", date, tech: tech || undefined });
    if (kind === "callback") onSubmit({ action: "callback", date });
    if (kind === "lost") onSubmit({ action: "lost", reason });
  }

  return (
    <Modal title={cfg.title} sub={cfg.sub} onClose={onCancel}>
      <form onSubmit={submit}>
        <div className="modal-b">
          {kind === "quote" && (
            <label className="f">Quote amount ($)
              <input autoFocus type="number" min="0" step="1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 850" />
            </label>
          )}
          {(kind === "schedule" || kind === "callback") && (
            <div className="fields">
              <label className={"f" + (kind === "callback" ? " full" : "")}>Date
                <input autoFocus type="date" required value={date} min={kind === "callback" ? today : undefined} onChange={(e) => setDate(e.target.value)} />
              </label>
              {kind === "schedule" && (
                <label className="f">Tech
                  <select value={tech} onChange={(e) => setTech(e.target.value)}>
                    <option value="">Decide later</option>
                    {TECHS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          {kind === "lost" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {LOST_REASONS.map((r) => (
                <button type="button" key={r} className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-f">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className={"btn " + (kind === "lost" ? "danger" : "primary")} disabled={!valid}>{cfg.btn}</button>
        </div>
      </form>
    </Modal>
  );
}
