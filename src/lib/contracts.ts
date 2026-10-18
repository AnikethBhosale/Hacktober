import { z } from "zod";

export const incidentAnalysisSchema = z.object({
  incidentType: z.enum(["tyre_failure", "cargo_damage", "delay", "unknown"]),
  severity: z.enum(["low", "medium", "high"]),
  affectedGoods: z.string(),
  unknowns: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});
export const routeOptionSchema = z.object({ action: z.string(), etaMinutes: z.number().int().nonnegative(), estimatedCostInr: z.number().nonnegative(), assumptions: z.array(z.string()) });
export const routePlanSchema = z.object({ rankedRecoveryActions: z.array(routeOptionSchema).min(1), assumptions: z.array(z.string()) });
export const auditReportSchema = z.object({ evidenceCoverage: z.number().min(0).max(1), contradictions: z.array(z.string()), missingInformation: z.array(z.string()), safetyFlags: z.array(z.string()), requiresHumanApproval: z.boolean(), confidence: z.number().min(0).max(1) });
export const orchestrationDecisionSchema = z.object({ selectedAction: z.string(), explanation: z.string(), confidence: z.number().min(0).max(1), requiresHumanApproval: z.boolean(), reconciliation: z.string(), clarificationRequest: z.string().optional() });

export type IncidentAnalysis = z.infer<typeof incidentAnalysisSchema>;
export type RoutePlan = z.infer<typeof routePlanSchema>;
export type AuditReport = z.infer<typeof auditReportSchema>;
export type OrchestrationDecision = z.infer<typeof orchestrationDecisionSchema>;
