"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EQUIPMENT, LOST_REASONS, OPEN_STAGES, SOURCES, STAGE_LABEL, STAGES, TECHS } from "@/lib/rules";
import { api, dayLabel, money, telHref, when, type JobDetail } from "./client";

const FIELDS = ["customer_name", "business", "phone", "email", "address", "equipment", "problem", "source", "urgent",
  "stage", "follow_up_on", "quote_amount", "scheduled_for", "tech", "lost_reason", "notes"] as const;
type Form = Record<(typeof FIELDS)[number], string | boolean>;

function toForm(d: JobDetail): Form {
  const j = d.job as unknown as Record<string, unknown>;
  return Object.fromEntries(FIELDS.map((k) => [k, k === "urgent" ? !!j.urgent : j[k] == null ? "" : String(j[k])])) as Form;
}

export function JobDrawer({ id, today, onClose, onSaved, onOpen }: {
  id: number; today: string; onClose: () => void; onSaved: (msg: string) => void; onOpen: (id: number) => void;
}) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null);
    api<JobDetail>(`/api/jobs/${id}`).then((d) => { setData(d); setForm(toForm(d)); }).catch((e) => setErr(e.message));
  }, [id]);

  const original = useMemo(() => (data ? toForm(data) : null), [data]);
  const dirty = !!(form && original && FIELDS.some((k) => form[k] !== original[k]));

  const close = useCallback(() => {
    if (dirty && !confirm("Discard your changes to this job?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [close]);

  if (!data || !form || !original) {
    return (
      <div className="scrim" onMouseDown={onClose}>
        <aside className="drawer"><div className="drawer-b">{err || "Loading…"}</div></aside>
      </div>
    );
  }

  const set = (k: keyof Form, v: string | boolean) => setForm((p) => ({ ...p!, [k]: v }));
  const j = data.job;
  const s = (k: keyof Form) => String(form[k] ?? "");

  // Same rules as the server: filling a quote or a date moves the stage, unless she picked one by hand.
  const stagePicked = form.stage !== original.stage;
  let autoStage = "";
  if (!stagePicked) {
    if (s("quote_amount") && !original.quote_amount && (j.stage === "new" || j.stage === "quote")) autoStage = "awaiting";
    if (s("scheduled_for") && !original.scheduled_for && ["new", "quote", "awaiting", "approved"].includes(j.stage)) autoStage = "scheduled";
  }
  const finalStage = stagePicked ? s("stage") : autoStage || j.stage;
  const needsReason = finalStage === "lost" && !s("lost_reason");

  async function save() {
    if (!form || !original) return;
    if (needsReason) { setErr("Pick why the job was lost."); return; }
    setBusy(true); setErr("");
    const patch: Record<string, unknown> = {};
    for (const k of FIELDS) if (form[k] !== original[k]) patch[k] = form[k];
    try {
      const d = await api<JobDetail>(`/api/jobs/${id}`, { method: "PATCH", json: patch });
      setData(d); setForm(toForm(d));
      onSaved(`Saved ${d.job.business || d.job.customer_name}${d.job.stage !== j.stage ? `. Now: ${STAGE_LABEL[d.job.stage]}` : ""}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const trackStages = STAGES.filter((x) => x.id !== "lost");
  const idx = trackStages.findIndex((x) => x.id === j.stage);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={j.business || j.customer_name}>
        <div className="drawer-h">
          <div className="row">
            <div>
              <h3>{j.business || j.customer_name}</h3>
              <div className="dim" style={{ fontSize: 13 }}>
                {j.business ? j.customer_name + " · " : ""}Came in {when(j.created_at)} · {j.source}
              </div>
            </div>
            <button className="btn ghost sm" onClick={close} aria-label="Close">✕</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            {j.phone && <a className="phone" href={telHref(j.phone)}>📞 {j.phone}</a>}
            {j.urgent ? <span className="pill hot">Equipment down</span> : null}
            <span className={"pill " + (j.stage === "lost" ? "hot" : j.stage === "done" ? "ok" : "ice")}>{STAGE_LABEL[j.stage]}</span>
            {j.step && <span className={"pill " + (j.step.due_now ? "warn" : "")}>{j.step.due_now ? "On today's list" : "Back on " + dayLabel(j.step.due, today)}</span>}
          </div>
          <div className={"track" + (j.stage === "lost" ? " lost" : "")}>
            {trackStages.map((x, i) => <span key={x.id} className={i <= idx || j.stage === "lost" ? "on" : ""} />)}
          </div>
          <div className="track-l"><span>New</span><span>Quote</span><span>Yes</span><span>Booked</span><span>Done</span></div>
        </div>

        <div className="drawer-b">
          <div className="section">
            <h4>Status</h4>
            <div className="fields">
              <label className="f">Stage
                <select value={s("stage")} onChange={(e) => set("stage", e.target.value)}>
                  {STAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </label>
              {finalStage === "lost" ? (
                <label className="f">Why lost?
                  <select value={s("lost_reason")} onChange={(e) => set("lost_reason", e.target.value)}>
                    <option value="">Pick a reason…</option>
                    {LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
              ) : (
                <label className="f">Call back on
                  <input type="date" value={s("follow_up_on")} onChange={(e) => set("follow_up_on", e.target.value)} />
                </label>
              )}
              <label className="f">Quote ($)
                <input type="number" min="0" value={s("quote_amount")} onChange={(e) => set("quote_amount", e.target.value)} />
              </label>
              <label className="f">Scheduled for
                <input type="date" value={s("scheduled_for")} onChange={(e) => set("scheduled_for", e.target.value)} />
              </label>
              <label className="f">Tech
                <select value={s("tech")} onChange={(e) => set("tech", e.target.value)}>
                  <option value="">—</option>
                  {TECHS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}>
                <input type="checkbox" checked={!!form.urgent} onChange={(e) => set("urgent", e.target.checked)} />
                Equipment down
              </label>
            </div>
          </div>

          <div className="section">
            <h4>Customer & job</h4>
            <div className="fields">
              <label className="f">Contact name<input value={s("customer_name")} onChange={(e) => set("customer_name", e.target.value)} /></label>
              <label className="f">Business<input value={s("business")} onChange={(e) => set("business", e.target.value)} /></label>
              <label className="f">Phone<input type="tel" value={s("phone")} onChange={(e) => set("phone", e.target.value)} /></label>
              <label className="f">Email<input type="email" value={s("email")} onChange={(e) => set("email", e.target.value)} /></label>
              <label className="f full">Address<input value={s("address")} onChange={(e) => set("address", e.target.value)} /></label>
              <label className="f">Equipment
                <select value={s("equipment")} onChange={(e) => set("equipment", e.target.value)}>
                  <option value="">—</option>
                  {EQUIPMENT.map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="f">Came in by
                <select value={s("source")} onChange={(e) => set("source", e.target.value)}>
                  {SOURCES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="f full">Problem<textarea value={s("problem")} onChange={(e) => set("problem", e.target.value)} /></label>
              <label className="f full">Notes<textarea value={s("notes")} onChange={(e) => set("notes", e.target.value)} placeholder="Gate code, who to ask for, what they said…" /></label>
            </div>
          </div>

          {data.others.length > 0 && (
            <div className="section">
              <h4>Other jobs for this customer</h4>
              <ul className="hist">
                {data.others.map((o) => (
                  <li key={o.id} style={{ cursor: "pointer" }} onClick={() => (!dirty || confirm("Discard your changes?")) && onOpen(o.id)}>
                    <time>{new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</time>
                    <span style={{ flex: 1 }}>{o.problem || "—"}</span>
                    <span className="dim">{STAGE_LABEL[o.stage]}{o.quote_amount ? " · " + money(o.quote_amount) : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="section">
            <h4>History</h4>
            <ul className="hist">
              {data.history.map((h) => (
                <li key={h.id}><time>{when(h.at)}</time><span>{h.text}</span></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="drawer-f">
          <span className="hint">
            {err ? <span style={{ color: "var(--hot)" }}>{err}</span>
              : autoStage ? <>Saving moves this to <b>{STAGE_LABEL[autoStage]}</b>.</>
              : stagePicked ? <>Saving moves this to <b>{STAGE_LABEL[s("stage")]}</b>.</>
              : dirty ? "Unsaved changes" : OPEN_STAGES.includes(j.stage) && j.step ? j.step.text : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={close}>Close</button>
            <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
