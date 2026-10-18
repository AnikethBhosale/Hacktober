"use client";
import { useEffect, useState, useCallback } from "react";
import type { AgentResult, Evidence, Incident, TimelineEvent } from "@/src/lib/types";

/* ─── helpers ─── */
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/* ─── evidence icons ─── */
const EV_ICON: Record<string, string> = {
  voice: "🎙", photo: "📷", document: "📄", location: "📍",
  "fleet-data": "🚛", text: "💬", memory: "🧠",
};

/* ─── agent dot letters ─── */
const AGENT_INITIAL: Record<string, string> = {
  "Incident Analyst": "IA", "Route Planner": "RP",
  "Audit & Verification": "AV", "Gemma Orchestrator": "GO",
};

function EvidencePanel({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="card">
      <p className="card-label">Observed Evidence <span>DISTINCT FROM INFERENCE</span></p>
      <div className="evidence-list">
        {evidence.map((e) => (
          <div className="evidence-item" key={e.id}>
            <div className={`ev-icon ${e.kind}`}>{EV_ICON[e.kind] ?? "📎"}</div>
            <div className="ev-body">
              <div className="ev-label">{e.label}</div>
              <div className="ev-detail">{e.detail}{e.messageId ? ` · msg #${e.messageId}` : ""}</div>
            </div>
            <div className={`ev-source ${e.source}`}>{e.source}</div>
          </div>
        ))}
      </div>
      <div className="legend">
        <span><span className="dot observed" /> Observed (driver-submitted)</span>
        <span><span className="dot simulated" /> Simulated (demo fleet data)</span>
        <span><span className="dot mem" /> Memory (advisory)</span>
        <span><span className="dot inference" /> Model inference</span>
      </div>
    </div>
  );
}

function AlternativesPanel({ alternatives }: { alternatives: Incident["recommendation"]["alternatives"] }) {
  if (!alternatives.length) return null;
  return (
    <div className="card">
      <p className="card-label">Alternatives <span>SIMULATED DATA</span></p>
      <div className="alternatives">
        {alternatives.map((a, i) => (
          <div className="alt-item" key={i}>
            <div className="alt-body">
              <div className="alt-action">{a.action}</div>
              <div className="alt-assumptions">{a.assumptions.join(" · ")}</div>
            </div>
            <div className="alt-metrics">
              <span style={{ color: "var(--green)", fontWeight: 600 }}>{a.etaMinutes} min</span>
              <span style={{ color: "var(--amber)" }}>{money(a.estimatedCostInr)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelinePanel({ timeline, agents }: { timeline: TimelineEvent[]; agents: AgentResult[] }) {
  return (
    <div className="card">
      <p className="card-label">Agent Workflow &amp; Audit Trail</p>
      <div className="timeline">
        {timeline.map((ev, i) => (
          <div className="tl-event" key={i}>
            <div className={`tl-dot ${ev.kind}`}>
              {ev.kind === "intake" ? "IN" : ev.kind === "human" ? "👤" : AGENT_INITIAL[ev.actor] ?? "??"}
            </div>
            <div className="tl-body">
              <div className="tl-actor">{ev.actor}</div>
              <div className="tl-message">{ev.message}</div>
              <div className="tl-time">{fmtTime(ev.at)}</div>
            </div>
          </div>
        ))}
      </div>

      <details className="agent-details" style={{ marginTop: 16 }}>
        <summary>View structured agent outputs and provider provenance</summary>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {agents.map((a) => (
            <div className="agent-item" key={a.agent}>
              <div className="agent-header">
                <span className="agent-name">{a.agent}</span>
                <span className={`agent-provider${a.provider.mode === "mock" ? " mock" : ""}`}>
                  {a.provider.name} / {a.provider.model} / {a.provider.mode}
                </span>
              </div>
              <pre className="agent-out">{JSON.stringify(a.output, null, 2)}</pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Incident["recommendation"] }) {
  return (
    <div className="card card-recommendation">
      <p className="card-label">Recommended Action <span>MODEL INFERENCE</span></p>
      <div className="rec-action">{rec.action}</div>
      <div className="rec-explanation">{rec.explanation}</div>
      <div className="metrics">
        <div className="metric eta"><b>{rec.etaMinutes} min</b><span>ETA</span></div>
        <div className="metric cost"><b>{money(rec.estimatedCostInr)}</b><span>Est. Cost</span></div>
        <div className="metric conf"><b>{pct(rec.confidence)}</b><span>Confidence</span></div>
      </div>
      {rec.assumptions.length > 0 && (
        <div className="assumptions-list" style={{ marginBottom: 10 }}>
          {rec.assumptions.map((a, i) => <span className="assumption-tag" key={i}>{a}</span>)}
        </div>
      )}
      <div className="approval-warning">⚠ Human approval required — no operational change will occur until a dispatcher approves.</div>
    </div>
  );
}

function DriverPanel({ incident }: { incident: Incident }) {
  return (
    <div className="card">
      <p className="card-label">Driver Communication</p>
      <p className="section-label">Safe instruction (pending approval)</p>
      <div className="driver-instruction">{incident.driverInstruction}</div>
      <p className="section-label" style={{ marginTop: 12 }}>Raw transcript · {incident.language}</p>
      <div className="raw-transcript">{incident.transcript}</div>
    </div>
  );
}

function CorrectionPanel({
  incident, busy, onDecide,
}: {
  incident: Incident;
  busy: boolean;
  onDecide: (d: "approve" | "escalate" | "correct", r?: string, a?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [action, setAction] = useState("");

  return (
    <div className="card correction-panel">
      <p className="card-label">Correct Recommendation <span>HUMAN DECISION</span></p>
      {incident.retrievedMemory && (
        <div className="memory-note" style={{ marginBottom: 12 }}>
          🧠 <strong>Advisory memory</strong> from incident {incident.retrievedMemory.sourceIncidentId}
          ({incident.retrievedMemory.relationship}): &ldquo;{incident.retrievedMemory.correctionReason}&rdquo;.
          Shown for context only — not evidence, not an automatic override.
        </div>
      )}
      {incident.correction && (
        <div className="correction-saved" style={{ marginBottom: 12 }}>
          ✅ <strong>Correction saved:</strong> {incident.correction.replacementAction}
          &nbsp;—&nbsp;<em>{incident.correction.reason}</em>
        </div>
      )}
      <div className="correction-form">
        <input
          aria-label="Correction reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this recommendation wrong or incomplete?"
          disabled={busy}
        />
        <input
          aria-label="Replacement action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Dispatcher's replacement action"
          disabled={busy}
        />
        <button
          className="btn-correct"
          disabled={busy || !reason.trim() || !action.trim()}
          onClick={() => { onDecide("correct", reason, action); setReason(""); setAction(""); }}
        >
          Save correction to memory
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function Dashboard() {
  const [items, setItems] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mockMode, setMockMode] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents");
      if (!res.ok) throw new Error("Unable to load incidents");
      const data = await res.json() as { incidents?: Incident[]; mockData?: boolean };
      if (!Array.isArray(data.incidents)) throw new Error("Invalid incident response");
      setItems(data.incidents);
      setMockMode(data.mockData !== false);
      setSelected((cur) => data.incidents!.find((i) => i.id === cur?.id) ?? data.incidents![0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load incidents");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function decide(decision: "approve" | "escalate" | "correct", reason?: string, replacementAction?: string) {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/incidents/${selected.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, ...(decision === "correct" ? { reason, replacementAction } : {}) }),
      });
      const data = await res.json() as { incident?: Incident; error?: string };
      if (!res.ok || !data.incident) throw new Error(data.error ?? "Unable to save decision");
      setSelected(data.incident);
      setItems((old) => old.map((i) => i.id === data.incident!.id ? data.incident! : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save dispatcher decision");
    } finally {
      setBusy(false);
    }
  }

  if (!selected) {
    return (
      <div className="app-shell">
        <div className="loading-state">{error || "Loading RouteSathi…"}</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo">RS</div>
          <div>
            <div className="topbar-name">RouteSathi</div>
            <div className="topbar-sub">Dispatch Control</div>
          </div>
        </div>
        {mockMode && <div className="mock-badge">MOCK DATA — deterministic demo mode</div>}
      </header>

      {/* ── Workspace ── */}
      <div className="workspace">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">Open Incidents</div>
            <div className="sidebar-count">{items.length}</div>
          </div>
          <div className="incident-list">
            {items.map((item) => (
              <button
                key={item.id}
                className={`incident-card${item.id === selected.id ? " active" : ""}`}
                onClick={() => setSelected(item)}
              >
                <div className="ic-row1">
                  <span className="ic-id">{item.id}</span>
                  <span className={`badge ${item.status.toLowerCase()}`}>
                    {item.status.replace("_", " ")}
                  </span>
                </div>
                <div className="ic-summary">{item.normalizedSummary}</div>
                <div className="ic-meta">{item.driver} · {new Date(item.createdAt).toLocaleDateString("en-IN")}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Detail ── */}
        <main className="main">
          <div className="detail">
            {/* Header */}
            <div className="detail-header">
              <div>
                <p className="detail-eyebrow">Incident {selected.id}</p>
                <h1 className="detail-title">{selected.normalizedSummary}</h1>
                <p className="detail-driver">
                  {selected.driver} &nbsp;·&nbsp; {selected.language} &nbsp;·&nbsp;
                  <span className={`badge ${selected.status.toLowerCase()}`}>{selected.status.replace("_", " ")}</span>
                </p>
              </div>
              <div className="action-row">
                <button className="btn-approve" disabled={busy} onClick={() => decide("approve")}>✓ Approve</button>
                <button className="btn-escalate" disabled={busy} onClick={() => decide("escalate")}>⬆ Escalate</button>
              </div>
            </div>

            {error && <div className="error-msg" role="alert">{error}</div>}

            {/* Row 1: Recommendation + Driver */}
            <div className="grid-2">
              <RecommendationCard rec={selected.recommendation} />
              <DriverPanel incident={selected} />
            </div>

            {/* Row 2: Evidence + Alternatives */}
            <div className="grid-2">
              <EvidencePanel evidence={selected.evidence} />
              <AlternativesPanel alternatives={selected.recommendation.alternatives} />
            </div>

            {/* Row 3: Full-width timeline */}
            <TimelinePanel timeline={selected.timeline} agents={selected.agents} />

            {/* Row 4: Correction */}
            <CorrectionPanel incident={selected} busy={busy} onDecide={decide} />
          </div>
        </main>
      </div>
    </div>
  );
}
