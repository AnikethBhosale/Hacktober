import type { Evidence, MemoryReference } from "./types";
import {
  auditReportSchema,
  incidentAnalysisSchema,
  orchestrationDecisionSchema,
  routePlanSchema,
  type AuditReport,
  type IncidentAnalysis,
  type OrchestrationDecision,
  type RoutePlan,
} from "./contracts";

export function analyseIncident(transcript: string, evidence: Evidence[]): IncidentAnalysis {
  const tyre = /tyre|puncture|burst/i.test(transcript);
  const hasPhoto = evidence.some((e) => e.kind === "photo");
  // A photo alone is not sufficient to classify cargo_damage — the transcript
  // must describe damage. A photo only upgrades confidence when damage IS reported.
  const damageInTranscript = /damage|damaged|carton|box|wet|crush/i.test(transcript);
  const damage = damageInTranscript;
  const locationShared = evidence.some((e) => e.kind === "location");

  const incidentType = tyre ? "tyre_failure" : damage ? "cargo_damage" : "unknown";
  const severity = tyre ? "high" : damage ? "medium" : "medium";
  // Only assert carton quantity when the transcript explicitly mentions it.
  const cartonMatch = transcript.match(/(\d+)\s*carton/i);
  const affectedGoods = damage
    ? cartonMatch
      ? `${cartonMatch[1]} carton(s) reported by driver${hasPhoto ? " and possibly visible in photo" : ""} (unconfirmed)`
      : hasPhoto
        ? "Possible goods damage visible in photo; quantity not specified by driver (unconfirmed)"
        : "Affected goods reported by driver; no photo or quantity provided (unconfirmed)"
    : "No affected goods confirmed";
  const unknowns: string[] = ["Physical condition has not been verified by an inspector"];
  if (!locationShared) unknowns.push("Exact location not shared");
  if (tyre) unknowns.push("Tyre repairability unknown");
  if (damage && !hasPhoto) unknowns.push("No photo evidence for cargo damage claim");

  // Photo evidence raises confidence only when damage is already reported in transcript.
  const confidence = tyre ? 0.82 : damage && hasPhoto ? 0.71 : damage ? 0.64 : 0.5;

  return incidentAnalysisSchema.parse({ incidentType, severity, affectedGoods, unknowns, confidence });
}

export function planRecovery(analysis: IncidentAnalysis): RoutePlan {
  const simulatedAssumptions = ["Fleet availability and ETA are simulated", "Dispatcher approval is required"];

  const options =
    analysis.incidentType === "tyre_failure"
      ? [
        { action: "Dispatch backup vehicle and inspect cartons at transfer", etaMinutes: 75, estimatedCostInr: 2400, assumptions: simulatedAssumptions },
        { action: "Wait for roadside repair", etaMinutes: 130, estimatedCostInr: 900, assumptions: ["Repair crew accepts job"] },
        { action: "Escalate to fleet manager", etaMinutes: 30, estimatedCostInr: 0, assumptions: ["Manager determines recovery"] },
      ]
      : analysis.incidentType === "cargo_damage"
        ? [
          { action: "Request physical inspection before vehicle transfer", etaMinutes: 60, estimatedCostInr: 700, assumptions: ["Inspector is available"] },
          { action: "Escalate to fleet manager", etaMinutes: 30, estimatedCostInr: 0, assumptions: simulatedAssumptions },
        ]
        : [
          { action: "Escalate for dispatcher review", etaMinutes: 30, estimatedCostInr: 0, assumptions: simulatedAssumptions },
        ];

  return routePlanSchema.parse({ rankedRecoveryActions: options, assumptions: simulatedAssumptions });
}

export function verifyIncident(analysis: IncidentAnalysis, plan: RoutePlan, evidence: Evidence[]): AuditReport {
  const hasObserved = evidence.some((e) => e.source === "observed");
  const hasPhoto = evidence.some((e) => e.kind === "photo");
  const hasLocation = evidence.some((e) => e.kind === "location");

  const safetyFlags =
    analysis.incidentType === "tyre_failure" ? ["Do not continue on a damaged tyre"] : [];
  const contradictions: string[] = [];
  if (plan.rankedRecoveryActions.some((o) => o.action.includes("backup")) && !hasLocation) {
    contradictions.push("Backup ETA is based on simulated location data, not a confirmed GPS position");
  }
  if (analysis.incidentType === "cargo_damage" && !hasPhoto) {
    contradictions.push("Cargo damage claimed without photo evidence");
  }

  const evidenceCoverage = hasObserved && hasPhoto ? 0.82 : hasObserved ? 0.74 : hasPhoto ? 0.55 : 0.2;
  // When there is no observed evidence the audit applies a coverage penalty
  // rather than capping analyst confidence at 0.42. This avoids understating
  // confidence for a well-supported transcript-only tyre report.
  const observationBonus = hasObserved ? 0 : -0.15;
  const confidence = Math.max(0, Math.min(1, analysis.confidence + observationBonus));

  return auditReportSchema.parse({
    evidenceCoverage,
    contradictions,
    missingInformation: analysis.unknowns,
    safetyFlags,
    requiresHumanApproval: true,
    confidence,
  });
}

export function reconcile(
  analysis: IncidentAnalysis,
  plan: RoutePlan,
  audit: AuditReport,
  memory?: MemoryReference
): OrchestrationDecision {
  const selected = plan.rankedRecoveryActions[0];
  const clarificationRequest =
    audit.evidenceCoverage < 0.5
      ? "Please send a voice note, photo, or location so dispatch can verify the incident."
      : undefined;

  let reconciliation: string;
  if (memory) {
    reconciliation = `Advisory correction context from ${memory.sourceIncidentId} considered; current evidence remains decisive.`;
  } else if (audit.contradictions.length) {
    reconciliation = `Recommendation retained with caveat: ${audit.contradictions[0]}`;
  } else {
    reconciliation = "Analyst, planner, and verifier agree that human approval is required.";
  }

  const explanation =
    analysis.incidentType === "tyre_failure"
      ? `A simulated nearby backup minimises delay while the vehicle is made safe. ${audit.missingInformation[0] ?? ""}`.trim()
      : `Dispatcher review required. ${audit.missingInformation[0] ?? ""}`.trim();

  return orchestrationDecisionSchema.parse({
    selectedAction: selected.action,
    explanation,
    confidence: Number((Math.min(analysis.confidence, audit.confidence)).toFixed(2)),
    requiresHumanApproval: audit.requiresHumanApproval,
    reconciliation,
    clarificationRequest,
  });
}
