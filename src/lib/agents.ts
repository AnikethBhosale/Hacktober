import type { Evidence, MemoryReference } from "./types";
import { auditReportSchema, incidentAnalysisSchema, orchestrationDecisionSchema, routePlanSchema, type AuditReport, type IncidentAnalysis, type OrchestrationDecision, type RoutePlan } from "./contracts";

export function analyseIncident(transcript: string, evidence: Evidence[]): IncidentAnalysis {
  const tyre = /tyre|puncture|burst/i.test(transcript);
  const damage = /damage|damaged|carton|box/i.test(transcript) || evidence.some((item) => item.kind === "photo");
  return incidentAnalysisSchema.parse({ incidentType: tyre ? "tyre_failure" : damage ? "cargo_damage" : "unknown", severity: tyre ? "high" : damage ? "medium" : "medium", affectedGoods: damage ? "2 cartons reported or visually indicated (unconfirmed)" : "No affected goods confirmed", unknowns: ["Physical condition has not been verified", ...(evidence.some((item) => item.kind === "location") ? [] : ["Exact location not shared"])], confidence: tyre ? 0.82 : 0.64 });
}

export function planRecovery(analysis: IncidentAnalysis): RoutePlan {
  const assumptions = ["Fleet availability and ETA are simulated", "Dispatcher approval is required"];
  const options = analysis.incidentType === "tyre_failure"
    ? [{ action: "Dispatch backup vehicle and inspect cartons at transfer", etaMinutes: 75, estimatedCostInr: 2400, assumptions }, { action: "Wait for roadside repair", etaMinutes: 130, estimatedCostInr: 900, assumptions: ["Repair crew accepts job"] }]
    : [{ action: "Escalate to fleet manager", etaMinutes: 30, estimatedCostInr: 0, assumptions }, { action: "Request physical inspection before vehicle transfer", etaMinutes: 60, estimatedCostInr: 700, assumptions: ["Inspector is available"] }];
  return routePlanSchema.parse({ rankedRecoveryActions: options, assumptions });
}

export function verifyIncident(analysis: IncidentAnalysis, plan: RoutePlan, evidence: Evidence[]): AuditReport {
  const hasObserved = evidence.some((item) => item.source === "observed");
  const safetyFlags = analysis.incidentType === "tyre_failure" ? ["Do not continue on a damaged tyre"] : [];
  const contradictions = plan.rankedRecoveryActions.some((option) => option.action.includes("backup")) && !evidence.some((item) => item.kind === "location") ? ["Backup ETA is based on simulated location data, not a live GPS position"] : [];
  return auditReportSchema.parse({ evidenceCoverage: hasObserved ? 0.74 : 0.2, contradictions, missingInformation: analysis.unknowns, safetyFlags, requiresHumanApproval: true, confidence: hasObserved ? 0.79 : 0.42 });
}

export function reconcile(analysis: IncidentAnalysis, plan: RoutePlan, audit: AuditReport, memory?: MemoryReference): OrchestrationDecision {
  const selected = plan.rankedRecoveryActions[0];
  const clarificationRequest = audit.evidenceCoverage < 0.5 ? "Please send a voice note, photo, or location so dispatch can verify the incident." : undefined;
  return orchestrationDecisionSchema.parse({ selectedAction: selected.action, explanation: `${analysis.incidentType === "tyre_failure" ? "A simulated nearby backup minimizes delay" : "The dispatcher should review the available evidence"}. ${audit.missingInformation[0] ?? ""}`.trim(), confidence: Math.min(analysis.confidence, audit.confidence), requiresHumanApproval: audit.requiresHumanApproval, reconciliation: memory ? `Used advisory correction context from ${memory.sourceIncidentId}; current evidence remains decisive.` : audit.contradictions.length ? `Recommendation retained with caveat: ${audit.contradictions[0]}` : "Analyst, planner, and verifier agree that approval is required.", clarificationRequest });
}
