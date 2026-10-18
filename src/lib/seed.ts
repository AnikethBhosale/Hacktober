import type { Incident } from "./types.ts";

const now = new Date("2026-10-18T09:15:00+05:30").toISOString();
const mock = { name: "Deterministic demo", model: "routesathi-mock-v1", mode: "mock" as const };

export const fleet = {
  drivers: ["Amit Kumar", "Ravi Patil", "Suresh Yadav", "Imran Shaikh", "Pooja Singh"],
  vehicles: ["MH15 AB 1201", "MH12 RK 3410", "MH14 GN 5521", "MH43 DP 1809", "MH04 TC 7712", "MH15 ST 6660", "MH20 VA 9113", "MH01 KM 1094"],
  backups: ["MH15 BK 2201", "MH12 BK 3411", "MH14 BK 5522"],
  routes: ["Mumbai → Nashik → Indore", "Pune → Aurangabad → Nagpur"],
  shipments: Array.from({ length: 10 }, (_, i) => `SHP-${4101 + i}`)
};

function incident(id: string, status: Incident["status"], transcript: string, action: string, confidence: number): Incident {
  const isTyre = transcript.toLowerCase().includes("tyre");
  return {
    id, status, createdAt: now, driver: "Amit Kumar", language: "Hinglish", transcript,
    normalizedSummary: isTyre ? "Tyre burst near Nashik; two cartons may be damaged." : "Shipment delay reported; driver requests support.",
    evidence: [
      { id: "ev-voice", kind: "voice", label: "Driver voice note", detail: "Telegram voice message #4821; Sarvam mock transcript", source: "observed", messageId: "4821" },
      { id: "ev-photo", kind: "photo", label: "Package photo", detail: "Possible crushed outer carton corners; 2 cartons estimated", source: "observed", messageId: "4822" },
      { id: "ev-fleet", kind: "fleet-data", label: "Fleet availability", detail: "Backup MH15 BK 2201 is simulated as available 28 km away.", source: "simulated" }
    ],
    agents: [
      { agent: "Incident Analyst", provider: mock, createdAt: now, output: { incidentType: isTyre ? "tyre_failure" : "delay", severity: "high", affectedGoods: "2 cartons (unconfirmed)", unknowns: ["tyre repairability", "inner-product condition"], confidence: 0.82 } },
      { agent: "Route Planner", provider: mock, createdAt: now, output: { rankedActions: [{ action, etaMinutes: 75, estimatedCostInr: 2400 }, { action: "Wait for roadside repair", etaMinutes: 130, estimatedCostInr: 900 }], assumptions: ["Backup availability is demo data"] } },
      { agent: "Audit & Verification", provider: mock, createdAt: now, output: { evidenceCoverage: 0.74, contradictions: [], missingInformation: ["Photo cannot confirm internal damage"], safetyFlags: ["Do not continue on damaged tyre"], requiresHumanApproval: true } },
      { agent: "Gemma Orchestrator", provider: mock, createdAt: now, output: { selectedAction: action, rationale: "Fastest safe simulated option with explicit human approval gate.", reconciliation: "No conflict between analyst and planner." } }
    ],
    timeline: [
      { at: now, actor: "Telegram intake", message: "Evidence received and incident created.", kind: "intake" },
      { at: now, actor: "Incident Analyst", message: "Classified tyre failure and possible carton damage.", kind: "handoff" },
      { at: now, actor: "Route Planner", message: "Ranked simulated recovery options.", kind: "handoff" },
      { at: now, actor: "Audit & Verification", message: "Approval required; internal carton damage is unknown.", kind: "handoff" },
      { at: now, actor: "Gemma Orchestrator", message: "Submitted recommendation to dispatcher.", kind: "decision" }
    ],
    recommendation: { action, confidence, explanation: "A backup vehicle minimizes delay in this simulated fleet while the disabled vehicle is made safe. Verify carton contents at handover.", requiresApproval: true, etaMinutes: 75, estimatedCostInr: 2400, assumptions: ["Backup vehicle and route ETA are simulated", "Roadside safety assessment remains with driver"], alternatives: [{ action: "Wait for roadside repair", etaMinutes: 130, estimatedCostInr: 900, assumptions: ["Repair crew arrives within 45 minutes"] }, { action: "Escalate to fleet manager", etaMinutes: 30, estimatedCostInr: 0, assumptions: ["Manager determines recovery"] }] },
    driverInstruction: "Incident received. Please stop safely and wait for dispatcher approval before changing route."
  };
}

export const seededIncidents: Incident[] = [
  incident("RS-102", "PENDING_APPROVAL", "Tyre burst ho gaya near Nashik; two cartons are damaged.", "Dispatch backup vehicle and inspect cartons at transfer", 0.84),
  incident("RS-101", "APPROVED", "Tyre puncture near Igatpuri, goods are secure.", "Wait for roadside repair", 0.78),
  incident("RS-100", "CORRECTED", "Boxes wet after rain stop near Pune.", "Escalate for packaging inspection", 0.72)
];
