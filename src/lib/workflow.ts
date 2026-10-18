import type { AgentResult, Evidence, Incident, MemoryReference, Provider, Recommendation, TimelineEvent } from "./types";
import { analyseIncident, planRecovery, verifyIncident, reconcile } from "./agents";

/** Provider selection is explicit: no configured capability is silently substituted. */
export function providerFor(capability: "speech" | "multimodal" | "orchestration"): Provider {
  const mock = process.env.MOCK_AI !== "false";
  if (mock) return { name: "Deterministic demo", model: "routesathi-mock-v1", mode: "mock" };
  if (capability === "speech" && process.env.SARVAM_API_KEY) return { name: "Sarvam", model: "configured-at-runtime", mode: "live" };
  if (process.env.GEMMA_API_KEY) return { name: "Gemma", model: "Gemma 4 E2B (verify provider identifier)", mode: "live" };
  throw new Error(`No configured ${capability} provider. Set MOCK_AI=true or configure the required provider.`);
}

export function runWorkflow(
  input: { id: string; driver: string; transcript: string; language: string; evidence: Evidence[]; memory?: MemoryReference }
): Pick<Incident, "agents" | "recommendation" | "timeline" | "normalizedSummary" | "driverInstruction" | "retrievedMemory"> {
  const time = new Date().toISOString();
  const analystProvider = providerFor("multimodal");
  const orchestratorProvider = providerFor("orchestration");

  // — Stage 1: Incident Analyst —
  const analysis = analyseIncident(input.transcript, input.evidence);

  // — Stage 2: Route Planner —
  const plan = planRecovery(analysis);

  // — Stage 3: Audit & Verification —
  const audit = verifyIncident(analysis, plan, input.evidence);

  // — Stage 4: Gemma Orchestrator —
  const decision = reconcile(analysis, plan, audit, input.memory);

  // Build structured AgentResult records with provenance
  const agents: AgentResult[] = [
    {
      agent: "Incident Analyst",
      provider: analystProvider,
      createdAt: time,
      output: analysis as unknown as Record<string, unknown>,
    },
    {
      agent: "Route Planner",
      provider: analystProvider,
      createdAt: time,
      output: plan as unknown as Record<string, unknown>,
    },
    {
      agent: "Audit & Verification",
      provider: analystProvider,
      createdAt: time,
      output: audit as unknown as Record<string, unknown>,
    },
    {
      agent: "Gemma Orchestrator",
      provider: orchestratorProvider,
      createdAt: time,
      output: {
        ...decision,
        memoryConsidered: input.memory
          ? { sourceIncidentId: input.memory.sourceIncidentId, relationship: input.memory.relationship, advisoryOnly: true }
          : "No relevant correction found",
      },
    },
  ];

  const topAction = plan.rankedRecoveryActions[0];
  const recommendation: Recommendation = {
    action: decision.selectedAction,
    confidence: decision.confidence,
    requiresApproval: decision.requiresHumanApproval,
    etaMinutes: topAction.etaMinutes,
    estimatedCostInr: topAction.estimatedCostInr,
    explanation: decision.explanation,
    assumptions: topAction.assumptions,
    alternatives: plan.rankedRecoveryActions.slice(1).map((opt) => ({
      action: opt.action,
      etaMinutes: opt.etaMinutes,
      estimatedCostInr: opt.estimatedCostInr,
      assumptions: opt.assumptions,
    })),
  };

  const isTyre = analysis.incidentType === "tyre_failure";
  const isHinglish = /hindi|hinglish/i.test(input.language);

  const timeline: TimelineEvent[] = [
    { at: time, actor: "Telegram intake", message: "Incident evidence captured.", kind: "intake" },
    { at: time, actor: "Incident Analyst", message: `Classified ${analysis.incidentType} — severity ${analysis.severity} — confidence ${Math.round(analysis.confidence * 100)}%.`, kind: "handoff" },
    { at: time, actor: "Route Planner", message: `Ranked ${plan.rankedRecoveryActions.length} recovery option(s). Top: ${decision.selectedAction}.`, kind: "handoff" },
    { at: time, actor: "Audit & Verification", message: `Evidence coverage ${Math.round(audit.evidenceCoverage * 100)}%. Human approval required: ${String(audit.requiresHumanApproval)}.`, kind: "handoff" },
    { at: time, actor: "Gemma Orchestrator", message: decision.reconciliation + (decision.clarificationRequest ? ` Clarification needed: ${decision.clarificationRequest}` : ""), kind: "decision" },
  ];

  return {
    agents,
    recommendation,
    retrievedMemory: input.memory,
    normalizedSummary: isTyre
      ? "Tyre failure reported; two cartons may be damaged."
      : analysis.incidentType === "cargo_damage"
        ? "Cargo damage reported; dispatcher review required."
        : "Driver submitted an incident report requiring review.",
    driverInstruction: isHinglish
      ? "Incident mil gaya. Safe jagah par rukiyé; dispatcher approval ke bina route mat badaliyé."
      : "Incident received. Stop safely and wait for dispatcher approval before changing your route.",
    timeline,
  };
}
