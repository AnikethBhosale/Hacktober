export type Provider = { name: string; model: string; mode: "live" | "mock" };
export type EvidenceKind = "voice" | "photo" | "document" | "location" | "text" | "fleet-data" | "memory";
export type Evidence = { id: string; kind: EvidenceKind; label: string; detail: string; source: "observed" | "simulated" | "memory"; messageId?: string };
export type AgentResult = { agent: "Incident Analyst" | "Route Planner" | "Audit & Verification" | "Gemma Orchestrator"; provider: Provider; output: Record<string, unknown>; createdAt: string };
export type TimelineEvent = { at: string; actor: string; message: string; kind: "intake" | "handoff" | "decision" | "human" };
export type Alternative = { action: string; etaMinutes: number; estimatedCostInr: number; assumptions: string[] };
export type Recommendation = { action: string; confidence: number; explanation: string; requiresApproval: boolean; etaMinutes: number; estimatedCostInr: number; assumptions: string[]; alternatives: Alternative[] };
export type Correction = { reason: string; replacementAction: string; at: string };
export type MemoryReference = { sourceIncidentId: string; incidentType: string; correctionReason: string; replacementAction: string; relationship: "same-incident-type" };
export type Incident = {
  id: string; status: "PENDING_APPROVAL" | "APPROVED" | "ESCALATED" | "CORRECTED";
  createdAt: string; driver: string; language: string; transcript: string; normalizedSummary: string;
  evidence: Evidence[]; agents: AgentResult[]; timeline: TimelineEvent[]; recommendation: Recommendation;
  correction?: Correction; retrievedMemory?: MemoryReference; driverInstruction: string;
};

