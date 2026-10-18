import { describe, expect, it } from "vitest";
import { runWorkflow } from "../src/lib/workflow";

describe("typed multi-agent workflow", () => {
  it("keeps a tyre incident approval-gated and records all agents", () => {
    process.env.MOCK_AI = "true";
    const result = runWorkflow({ id: "RS-test", driver: "Amit", transcript: "Tyre burst ho gaya; cartons damaged", language: "Hinglish", evidence: [] });
    expect(result.agents).toHaveLength(4);
    expect(result.agents.map((a) => a.agent)).toContain("Gemma Orchestrator");
    expect(result.recommendation.requiresApproval).toBe(true);
    expect(result.recommendation.action).toMatch(/backup/i);
  });
  it("surfaces relevant correction memory without treating it as evidence", () => {
    process.env.MOCK_AI = "true";
    const memory = { sourceIncidentId: "RS-99", incidentType: "tyre_failure", correctionReason: "Inspect seals first", replacementAction: "Inspect seals", relationship: "same-incident-type" as const };
    const result = runWorkflow({ id: "RS-test", driver: "Amit", transcript: "tyre puncture", language: "English", evidence: [], memory });
    expect(result.retrievedMemory?.sourceIncidentId).toBe("RS-99");
    expect(result.agents[3].output.memoryConsidered).toEqual({ sourceIncidentId: "RS-99", relationship: "same-incident-type", advisoryOnly: true });
  });
});
