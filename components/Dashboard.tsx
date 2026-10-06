"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OPEN_STAGES, STAGE_LABEL, STAGES } from "@/lib/rules";
import { AddRequest } from "./AddRequest";
import { ActionPrompt, type PromptKind, type PromptResult, type PromptState } from "./Dialogs";
import { JobDrawer } from "./JobDrawer";
import { api, dayLabel, money, telHref, waited, type Job, type Summary } from "./client";

type Tab = "today" | "upcoming" | "all";
interface Toast { id: number; text: string; undoJob?: number; kind?: "new" }

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const seen = useRef<number | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">, ms = 8000) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), ms);
  }, []);

  const load = useCallback(async () => {
    const d = await api<{ jobs: Job[]; summary: Summary }>("/api/jobs");
    // Tell her the moment a website request lands.
    const maxId = Math.max(0, ...d.jobs.map((j) => j.id));
    if (seen.current != null) {
      d.jobs.filter((j) => j.id > seen.current! && j.source === "Website form").forEach((j) =>
        toast({ kind: "new", text: `New website request: ${j.business || j.customer_name}${j.urgent ? " (equipment down)" : ""}` }, 10000));
    }
    seen.current = maxId;
    setJobs(d.jobs);
    setSum(d.summary);
  }, [toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  async function act(job: Job, body: PromptResult) {
    setBusyId(job.id);
    try {
      const r = await api<{ job: Job; message: string }>(`/api/jobs/${job.id}/action`, { method: "POST", json: body });
      toast({ text: r.message, undoJob: job.id });
      await load();
    } catch (e) {
      toast({ text: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function undo(t: Toast) {
    setToasts((p) => p.filter((x) => x.id !== t.id));
    try {
      await api(`/api/jobs/${t.undoJob}/undo`, { method: "POST" });
      toast({ text: "Undone." }, 3000);
      await load();
    } catch (e) {
      toast({ text: (e as Error).message }, 4000);
    }
  }

  const today = sum?.today ?? "";
  const open = useMemo(() => (jobs || []).filter((j) => OPEN_STAGES.includes(j.stage)), [jobs]);
  const due = useMemo(() => open.filter((j) => j.step?.due_now), [open]);
  const later = useMemo(() => open.filter((j) => !j.step?.due_now).sort((a, b) => a.step!.due.localeCompare(b.step!.due)), [open]);

  const ask = (kind: PromptKind, job: Job) => setPrompt({ kind, job });

  if (!jobs || !sum) return <div className="wrap"><p style={{ padding: 40 }}>Loading your list…</p></div>;

  const dateStr = new Date(today + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const hours = sum.median_hours_to_callback;

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <h1>❄ Callboard</h1>
          <span className="sub">Leads & follow-ups</span>
        </div>
        <div className="top-actions">
          <a className="btn" href="/request" target="_blank" rel="noreferrer">Website form ↗</a>
          <a className="btn" href="/api/export">Export CSV</a>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add request</button>
        </div>
      </header>

      <section className="hello">
        <h2>{dateStr}</h2>
        <p>
          {sum.to_call_today === 0
            ? "Nobody is waiting on you right now. Nice."
            : <>You have <b>{sum.to_call_today} {sum.to_call_today === 1 ? "person" : "people"}</b> to get back to today.</>}
        </p>
      </section>

      <section className="stats" aria-label="Summary">
        <div className={"stat" + (sum.to_call_today ? " hot" : "")}>
          <div className="k">To call today</div><div className="v">{sum.to_call_today}</div>
          <div className="h">{due.filter((j) => j.step!.overdue_days > 0).length} overdue</div>
        </div>
        <div className="stat">
          <div className="k">Open jobs</div><div className="v">{sum.open_jobs}</div>
          <div className="h">{sum.new_7} new this week</div>
        </div>
        <div className="stat">
          <div className="k">Open quotes</div><div className="v">{money(sum.open_pipeline) || "$0"}</div>
          <div className="h">quoted, not done yet</div>
        </div>
        <div className="stat">
          <div className="k">Time to call back</div>
          <div className="v">{hours == null ? "—" : hours < 1 ? "<1 hr" : hours < 48 ? `${Math.round(hours)} hr` : `${Math.round(hours / 24)} days`}</div>
          <div className="h">median, last 30 days</div>
        </div>
        <div className="stat">
          <div className="k">Last 30 days</div>
          <div className="v">{money(sum.done_30_value) || "$0"}</div>
          <div className="h">{sum.done_30} done · {sum.lost_30} lost{sum.lost_30_value ? ` (${money(sum.lost_30_value)})` : ""}</div>
        </div>
      </section>

      <nav className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === "today"} onClick={() => setTab("today")}>Who to call today<span className="n">{due.length}</span></button>
        <button className="tab" role="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>Coming up<span className="n">{later.length}</span></button>
        <button className="tab" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>All jobs<span className="n">{jobs.length}</span></button>
      </nav>

      {tab === "today" && <CallList jobs={due} today={today} busyId={busyId} onOpen={setOpenId} onAct={act} onAsk={ask} />}
      {tab === "upcoming" && <Upcoming jobs={later} today={today} busyId={busyId} onOpen={setOpenId} onAct={act} onAsk={ask} />}
      {tab === "all" && <AllJobs jobs={jobs} counts={sum.by_stage} today={today} onOpen={setOpenId} />}

      {openId != null && (
        <JobDrawer id={openId} today={today} onClose={() => { setOpenId(null); load(); }} onOpen={setOpenId}
          onSaved={(m) => { toast({ text: m }, 3500); load(); }} />
      )}
      {adding && (
        <AddRequest onClose={() => setAdding(false)} onAdded={(j) => {
          setAdding(false);
          seen.current = Math.max(seen.current ?? 0, j.id);
          toast({ text: `${j.business || j.customer_name} added to today's list.` }, 4000);
          setTab("today");
          load();
        }} />
      )}
      {prompt && (
        <ActionPrompt state={prompt} today={today} onCancel={() => setPrompt(null)}
          onSubmit={(r) => { const j = prompt.job; setPrompt(null); act(j, r); }} />
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast" + (t.kind === "new" ? " new" : "")}>
            <span>{t.text}</span>
            {t.undoJob != null && <button onClick={() => undo(t)}>Undo</button>}
            {t.kind === "new" && <button onClick={() => { setTab("today"); setToasts((p) => p.filter((x) => x.id !== t.id)); }}>Show</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- call list ----------------

interface ListProps {
  jobs: Job[]; today: string; busyId: number | null;
  onOpen: (id: number) => void; onAct: (j: Job, b: PromptResult) => void; onAsk: (k: PromptKind, j: Job) => void;
}

const GROUP_ORDER = ["new", "quote", "awaiting", "approved", "scheduled"];

function CallList(p: ListProps) {
  if (!p.jobs.length) {
    return <div className="empty"><strong>You&apos;re all caught up.</strong>Nobody is waiting on a call from you. New requests show up here the moment they come in.</div>;
  }
  const groups = GROUP_ORDER.map((s) => ({
    stage: s,
    jobs: p.jobs.filter((j) => j.stage === s).sort((a, b) => a.step!.pri - b.step!.pri || b.step!.overdue_days - a.step!.overdue_days || b.waiting_days - a.waiting_days),
  })).filter((g) => g.jobs.length);

  return (
    <div>
      {groups.map((g) => (
        <section className="group" key={g.stage}>
          <div className="group-h"><h3>{STAGE_LABEL[g.stage]}</h3><span className="c">{g.jobs.length}</span></div>
          {g.jobs.map((j) => <JobCard key={j.id} job={j} {...p} />)}
        </section>
      ))}
    </div>
  );
}

function Upcoming(p: ListProps) {
  if (!p.jobs.length) return <div className="empty"><strong>Nothing coming up.</strong>Jobs that aren&apos;t due yet wait here and move to your call list on their day.</div>;
  const byDay = new Map<string, Job[]>();
  p.jobs.forEach((j) => byDay.set(j.step!.due, [...(byDay.get(j.step!.due) || []), j]));
  return (
    <div>
      {[...byDay.entries()].map(([day, list]) => (
        <section className="group" key={day}>
          <div className="group-h"><h3>Back on your list {dayLabel(day, p.today)}</h3><span className="c">{list.length}</span></div>
          {list.map((j) => <JobCard key={j.id} job={j} {...p} upcoming />)}
        </section>
      ))}
    </div>
  );
}

function JobCard({ job: j, today, busyId, onOpen, onAct, onAsk, upcoming }: ListProps & { job: Job; upcoming?: boolean }) {
  const step = j.step!;
  const busy = busyId === j.id;
  const hot = j.urgent && (j.stage === "new" || j.stage === "quote");
  const go = (action: string) => onAct(j, { action });

  let primary: React.ReactNode = null;
  const secondary: React.ReactNode[] = [];
  switch (j.stage) {
    case "new":
      primary = <button className="btn ice" disabled={busy} onClick={() => go("called")}>Talked to them</button>;
      break;
    case "quote":
      primary = <button className="btn ice" disabled={busy} onClick={() => onAsk("quote", j)}>I sent the quote</button>;
      break;
    case "awaiting":
      primary = <button className="btn ice" disabled={busy} onClick={() => go("yes")}>They said yes</button>;
      secondary.push(<button key="f" className="btn sm" disabled={busy} onClick={() => go("followed_up")}>Followed up</button>);
      break;
    case "approved":
      primary = <button className="btn ice" disabled={busy} onClick={() => onAsk("schedule", j)}>Schedule it</button>;
      break;
    case "scheduled":
      primary = <button className="btn ice" disabled={busy} onClick={() => go("done")}>Mark done</button>;
      secondary.push(<button key="r" className="btn sm" disabled={busy} onClick={() => onAsk("schedule", j)}>Reschedule</button>);
      break;
  }
  if (!upcoming && j.stage !== "scheduled") secondary.unshift(<button key="n" className="btn sm" disabled={busy} onClick={() => go("no_answer")}>No answer → tomorrow</button>);
  secondary.push(<button key="c" className="btn sm ghost" disabled={busy} onClick={() => onAsk("callback", j)}>Call back on…</button>);
  secondary.push(<button key="l" className="btn sm ghost danger" disabled={busy} onClick={() => onAsk("lost", j)}>Lost</button>);

  return (
    <article className={"card" + (hot ? " urgent" : "")}>
      <div>
        <div className="who">
          <button className="name" onClick={() => onOpen(j.id)}>{j.business || j.customer_name}</button>
          {j.business && <span className="person">{j.customer_name}</span>}
        </div>
        <div className={"why" + (hot ? " hot" : "")}>
          {step.manual ? `Call back ${dayLabel(step.due, today)}` : step.text}
        </div>
        {j.problem && <div className="prob">{j.equipment ? <b>{j.equipment}: </b> : null}{j.problem}</div>}
        <div className="meta">
          {!upcoming && <span className={"pill " + (j.waiting_days >= 2 ? "warn" : "")}>Waiting {waited(j.waiting_days)}</span>}
          {step.overdue_days > 0 && !upcoming && <span className="pill hot">{step.overdue_days} day{step.overdue_days > 1 ? "s" : ""} overdue</span>}
          {j.quote_amount != null && <span className="pill ice">{money(j.quote_amount)}</span>}
          {j.scheduled_for && <span className="pill">{dayLabel(j.scheduled_for, today)}{j.tech ? " · " + j.tech : ""}</span>}
          <span className="pill">{j.source}</span>
          {j.notes && <span className="pill" title={j.notes}>📝 {j.notes.length > 40 ? j.notes.slice(0, 40) + "…" : j.notes}</span>}
        </div>
      </div>
      <div className="right">
        {j.phone && <a className="phone" href={telHref(j.phone)}>📞 {j.phone}</a>}
        <div className="acts">{primary}</div>
        <div className="acts">{secondary}</div>
      </div>
    </article>
  );
}

// ---------------- all jobs ----------------

function AllJobs({ jobs, counts, today, onOpen }: { jobs: Job[]; counts: Record<string, number>; today: string; onOpen: (id: number) => void }) {
  const [stage, setStage] = useState<string>("open");
  const [q, setQ] = useState("");
  const list = jobs.filter((j) => {
    if (stage === "open" && !OPEN_STAGES.includes(j.stage)) return false;
    if (stage !== "open" && stage !== "all" && j.stage !== stage) return false;
    if (!q) return true;
    const hay = [j.customer_name, j.business, j.phone, j.problem, j.equipment, j.tech].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase()) || (j.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~");
  });
  const openCount = OPEN_STAGES.reduce((s, x) => s + (counts[x] || 0), 0);

  return (
    <div>
      <div className="filters">
        <button className="chip" aria-pressed={stage === "open"} onClick={() => setStage("open")}>Open ({openCount})</button>
        <button className="chip" aria-pressed={stage === "all"} onClick={() => setStage("all")}>All ({jobs.length})</button>
        {STAGES.map((s) => (
          <button key={s.id} className="chip" aria-pressed={stage === s.id} onClick={() => setStage(s.id)}>{s.label} ({counts[s.id] || 0})</button>
        ))}
      </div>
      <div className="filters">
        <input className="search" placeholder="Search name, business, phone, problem…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Came in</th><th>Customer</th><th>Job</th><th>Stage</th><th>Next step</th><th className="num">Quote</th></tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id} onClick={() => onOpen(j.id)}>
                <td className="dim" style={{ whiteSpace: "nowrap" }}>{new Date(j.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                <td><b>{j.business || j.customer_name}</b><div className="dim">{j.phone}</div></td>
                <td>{j.equipment && <b>{j.equipment}: </b>}<span className="dim">{j.problem}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <span className={"pill " + (j.stage === "lost" ? "hot" : j.stage === "done" ? "ok" : "ice")}>{STAGE_LABEL[j.stage]}</span>
                  {j.lost_reason && <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>{j.lost_reason}</div>}
                </td>
                <td>{j.step ? <>{j.step.manual ? "Call back" : j.step.text}<div className={j.step.due_now ? "" : "dim"} style={{ fontSize: 12, color: j.step.due_now ? "var(--hot)" : undefined }}>{j.step.due_now ? "today" : dayLabel(j.step.due, today)}</div></> : <span className="dim">—</span>}</td>
                <td className="num">{money(j.quote_amount)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 30 }}>No jobs match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
