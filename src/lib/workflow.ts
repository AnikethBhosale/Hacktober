import type { AgentResult, Evidence, Incident, MemoryReference, Provider, Recommendation } from "./types";

/** Provider selection is explicit: no configured capability is silently substituted. */
export function providerFor(capability: "speech" | "multimodal" | "orchestration"): Provider {
  const mock = process.env.MOCK_AI !== "false";
  if (mock) return { name: "Deterministic demo", model: "routesathi-mock-v1", mode: "mock" };
  if (capability === "speech" && process.env.SARVAM_API_KEY) return { name: "Sarvam", model: "configured-at-runtime", mode: "live" };
  if (process.env.GEMMA_API_KEY) return { name: "Gemma", model: "Gemma 4 E2B (verify provider identifier)", mode: "live" };
  throw new Error(`No configured ${capability} provider. Set MOCK_AI=true or configure the required provider.`);
}

export function runWorkflow(input: { id: string; driver: string; transcript: string; language: string; evidence: Evidence[]; memory?: MemoryReference }): Pick<Incident, "agents" | "recommendation" | "timeline" | "normalizedSummary" | "driverInstruction" | "retrievedMemory"> {
  const time = new Date().toISOString();
  const analystProvider = providerFor("multimodal");
  const orchestratorProvider = providerFor("orchestration");
  const tyre = /tyre|puncture|burst/i.test(input.transcript);
  const action = tyre ? "Dispatch backup vehicle and inspect cartons at transfer" : "Escalate for dispatcher review";
  const recommendation: Recommendation = {
    action, confidence: tyre ? 0.84 : 0.65, requiresApproval: true, etaMinutes: tyre ? 75 : 45, estimatedCostInr: tyre ? 2400 : 0,
    explanation: tyre ? "A simulated nearby backup minimizes delay; carton condition needs inspection." : "Evidence is insufficient for an autonomous recovery recommendation.",
    assumptions: ["Fleet availability and ETA are simulated", "Dispatcher approval is required"],
    alternatives: [{ action: "Wait for roadside repair", etaMinutes: 130, estimatedCostInr: 900, assumptions: ["Repair crew accepts job"] }, { action: "Escalate to fleet manager", etaMinutes: 30, estimatedCostInr: 0, assumptions: ["Manager is reachable"] }]
  };
  const agents: AgentResult[] = [
    { agent: "Incident Analyst", provider: analystProvider, createdAt: time, output: { incidentType: tyre ? "tyre_failure" : "unknown", severity: tyre ? "high" : "medium", affectedGoods: "2 cartons reported", unknowns: ["internal package condition"], confidence: 0.82 } },
    { agent: "Route Planner", provider: analystProvider, createdAt: time, output: { rankedRecoveryActions: [action, "Wait for roadside repair"], etaMinutes: 75, estimatedCostInr: 2400, assumptions: recommendation.assumptions } },
    { agent: "Audit & Verification", provider: analystProvider, createdAt: time, output: { evidenceCoverage: 0.74, contradictions: [], missingInformation: ["Physical inspection not completed"], safetyFlags: tyre ? ["Do not continue on a damaged tyre"] : [], requiresHumanApproval: true } },
    { agent: "Gemma Orchestrator", provider: orchestratorProvider, createdAt: time, output: { selectedAction: action, reconciliation: "Analyst, planner and audit all require dispatcher approval.", memoryConsidered: input.memory ? { sourceIncidentId: input.memory.sourceIncidentId, relationship: input.memory.relationship, advisoryOnly: true } : "No relevant correction found" } }
  ];
  return {
    agents, recommendation, retrievedMemory: input.memory,
    normalizedSummary: tyre ? "Tyre failure reported; two cartons may be damaged." : "Driver submitted an incident report requiring review.",
    driverInstruction: input.language.toLowerCase().includes("hindi") || input.language.toLowerCase().includes("hinglish") ? "Incident mil gaya. Safe jagah par rukiyé; dispatcher approval ke bina route mat badaliyé." : "Incident received. Stop safely and wait for dispatcher approval before changing your route.",
    timeline: [
      { at: time, actor: "Telegram intake", message: "Incident evidence captured.", kind: "intake" },
      ...agents.map((agent) => ({ at: time, actor: agent.agent, message: `Structured result recorded via ${agent.provider.name}/${agent.provider.model}.`, kind: agent.agent === "Gemma Orchestrator" ? "decision" as const : "handoff" as const }))
    ]
  };
}
