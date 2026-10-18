import type { AgentResult, Evidence, Incident, MemoryReference, Provider, Recommendation, TimelineEvent } from "./types.ts";
import { runAuditor, runIncidentAnalyst, runOrchestrator, runRoutePlanner } from "./agents.ts";
import { correctionMemory } from "./memory.ts";
import { geminiApiKey, gemmaModel } from "./gemma.ts";
import { ollamaConfig, useMockAi } from "./ollama.ts";
import { sarvamModel } from "./sarvam.ts";

/** Provider selection is explicit: no configured capability is silently substituted. */
export function providerFor(capability: "speech" | "multimodal" | "orchestration"): Provider {
  if (useMockAi()) return { name: "Deterministic demo", model: "routesathi-mock-v1", mode: "mock" };
  if (capability === "speech") {
    if (!process.env.SARVAM_API_KEY) throw new Error("No configured speech provider. Set MOCK_AI=true or SARVAM_API_KEY.");
    return { name: "Sarvam", model: sarvamModel(), mode: "live" };
  }
  if (geminiApiKey()) return { name: "Google AI Studio", model: gemmaModel(), mode: "live" };
  const { model } = ollamaConfig();
  return { name: "Ollama", model, mode: "live" };
}

export async function runWorkflow(
  input: { id: string; driver: string; transcript: string; language: string; evidence: Evidence[]; memory?: MemoryReference }
): Promise<Pick<Incident, "agents" | "recommendation" | "timeline" | "normalizedSummary" | "driverInstruction" | "retrievedMemory">> {
  const time = new Date().toISOString();
  const analystProvider = providerFor("multimodal");
  const orchestratorProvider = providerFor("orchestration");

  // — Stage 1: Incident Analyst —
  const analysis = await runIncidentAnalyst(input.transcript, input.evidence);

  // — Stage 2: Route Planner —
  const plan = await runRoutePlanner(analysis);

  // — Stage 3: Audit & Verification —
  const audit = await runAuditor(analysis, plan, input.evidence);

  const memory = input.memory ?? correctionMemory.findRelated(analysis.incidentType, input.id);

  // — Stage 4: Gemma Orchestrator (Google AI Studio Gemma, else local Ollama) —
  const decision = await runOrchestrator(analysis, plan, audit, memory);

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
        memoryConsidered: memory
          ? { sourceIncidentId: memory.sourceIncidentId, relationship: memory.relationship, advisoryOnly: true }
          : "No relevant correction found",
      },
    },
  ];

  // planRecovery always returns at least one option (schema enforces min(1)),
  // but guard defensively: if the list is somehow empty, use safe fallbacks
  // rather than crashing with TypeError on topAction.etaMinutes.
  const topAction = plan.rankedRecoveryActions[0] ?? {
    action: decision.selectedAction,
    etaMinutes: 0,
    estimatedCostInr: 0,
    assumptions: ["No recovery options derivable; dispatcher must decide"],
  };
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
    retrievedMemory: memory,
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
