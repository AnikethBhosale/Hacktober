import { describe, expect, it } from "vitest";
import { providerFor, runWorkflow } from "../src/lib/workflow";
import { analyseIncident, planRecovery, verifyIncident, reconcile } from "../src/lib/agents";
import { ollamaConfig, parseOllamaJsonContent } from "../src/lib/ollama";

describe("typed multi-agent workflow", () => {
  it("keeps a tyre incident approval-gated and records all agents", async () => {
    process.env.MOCK_AI = "true";
    const result = await runWorkflow({ id: "RS-test", driver: "Amit", transcript: "Tyre burst ho gaya; cartons damaged", language: "Hinglish", evidence: [] });
    expect(result.agents).toHaveLength(4);
    expect(result.agents.map((a) => a.agent)).toContain("Gemma Orchestrator");
    expect(result.recommendation.requiresApproval).toBe(true);
    expect(result.recommendation.action).toMatch(/backup/i);
  });

  it("surfaces relevant correction memory without treating it as evidence", async () => {
    process.env.MOCK_AI = "true";
    const memory = { sourceIncidentId: "RS-99", incidentType: "tyre_failure", correctionReason: "Inspect seals first", replacementAction: "Inspect seals", relationship: "same-incident-type" as const };
    const result = await runWorkflow({ id: "RS-test", driver: "Amit", transcript: "tyre puncture", language: "English", evidence: [], memory });
    expect(result.retrievedMemory?.sourceIncidentId).toBe("RS-99");
    expect(result.agents[3].output.memoryConsidered).toEqual({ sourceIncidentId: "RS-99", relationship: "same-incident-type", advisoryOnly: true });
  });

  it("non-tyre incident produces 4 agents and requiresApproval", async () => {
    process.env.MOCK_AI = "true";
    const result = await runWorkflow({ id: "RS-x", driver: "Ravi", transcript: "Boxes wet after rain near Pune", language: "English", evidence: [] });
    expect(result.agents).toHaveLength(4);
    expect(result.recommendation.requiresApproval).toBe(true);
  });

  it("uses Google AI Studio Gemma when a Gemini key is set", () => {
    process.env.MOCK_AI = "false";
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMMA_MODEL;
    expect(providerFor("orchestration")).toEqual({ name: "Google AI Studio", model: "gemma-4-26b-a4b-it", mode: "live" });
    expect(providerFor("multimodal")).toEqual({ name: "Google AI Studio", model: "gemma-4-26b-a4b-it", mode: "live" });
    delete process.env.GEMINI_API_KEY;
    process.env.MOCK_AI = "true";
  });

  it("uses local Ollama gemma4:e2b when MOCK_AI is false and no Gemini key is set", () => {
    process.env.MOCK_AI = "false";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OLLAMA_MODEL;
    expect(providerFor("orchestration")).toEqual({ name: "Ollama", model: "gemma4:e2b", mode: "live" });
    expect(providerFor("multimodal")).toEqual({ name: "Ollama", model: "gemma4:e2b", mode: "live" });
    process.env.MOCK_AI = "true";
  });

  it("uses Sarvam for live speech", () => {
    process.env.MOCK_AI = "false";
    process.env.SARVAM_API_KEY = "test-sarvam";
    delete process.env.SARVAM_STT_MODEL;
    expect(providerFor("speech")).toEqual({ name: "Sarvam", model: "saaras:v4", mode: "live" });
    process.env.MOCK_AI = "true";
  });
});

describe("ollama laptop defaults", () => {
  it("caps context and prefers CPU when GPU layers are unset", async () => {
    const prevCtx = process.env.OLLAMA_NUM_CTX;
    const prevGpu = process.env.OLLAMA_NUM_GPU;
    delete process.env.OLLAMA_NUM_CTX;
    delete process.env.OLLAMA_NUM_GPU;
    expect(ollamaConfig()).toMatchObject({ numCtx: 2048, numGpu: 0, model: expect.any(String) });
    if (prevCtx === undefined) delete process.env.OLLAMA_NUM_CTX; else process.env.OLLAMA_NUM_CTX = prevCtx;
    if (prevGpu === undefined) delete process.env.OLLAMA_NUM_GPU; else process.env.OLLAMA_NUM_GPU = prevGpu;
  });
});

describe("ollama json parsing", () => {
  it("extracts a JSON object from fenced model output", () => {
    expect(parseOllamaJsonContent('```json\n{"selectedAction":"Escalate"}\n```')).toEqual({ selectedAction: "Escalate" });
  });
});

describe("google ai studio payload", () => {
  it("reads concatenated text parts", async () => {
    const { geminiText, gemmaModels } = await import("../src/lib/gemma");
    expect(geminiText({
      candidates: [{ content: { parts: [{ text: "{\"ok\":" }, { text: "true}" }] } }],
    })).toBe("{\"ok\":\ntrue}");
    const prev = process.env.GEMMA_FALLBACK_MODELS;
    delete process.env.GEMMA_FALLBACK_MODELS;
    delete process.env.GEMMA_MODEL;
    expect(gemmaModels()[0]).toBe("gemma-4-26b-a4b-it");
    expect(gemmaModels()).toContain("gemini-2.0-flash");
    if (prev === undefined) delete process.env.GEMMA_FALLBACK_MODELS; else process.env.GEMMA_FALLBACK_MODELS = prev;
  });
});

describe("individual agent contracts", () => {
  it("analyseIncident returns a valid IncidentAnalysis schema shape", () => {
    const result = analyseIncident("Tyre burst ho gaya", [{ id: "e1", kind: "photo", label: "Photo", detail: "damaged carton", source: "observed" }]);
    expect(result.incidentType).toBe("tyre_failure");
    expect(result.severity).toBe("high");
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.unknowns)).toBe(true);
  });

  it("analyseIncident detects cargo_damage from photo + damage keyword", () => {
    const evidence = [{ id: "e1", kind: "photo" as const, label: "Photo", detail: "wet box", source: "observed" as const }];
    const result = analyseIncident("Boxes are damaged", evidence);
    expect(result.incidentType).toBe("cargo_damage");
  });

  it("planRecovery returns ranked options with required fields", () => {
    const analysis = analyseIncident("Tyre burst", []);
    const plan = planRecovery(analysis);
    expect(plan.rankedRecoveryActions.length).toBeGreaterThanOrEqual(1);
    for (const opt of plan.rankedRecoveryActions) {
      expect(typeof opt.action).toBe("string");
      expect(typeof opt.etaMinutes).toBe("number");
      expect(typeof opt.estimatedCostInr).toBe("number");
      expect(Array.isArray(opt.assumptions)).toBe(true);
    }
  });

  it("verifyIncident flags backup-without-location as contradiction", () => {
    const analysis = analyseIncident("Tyre burst", []);
    const plan = planRecovery(analysis);
    const audit = verifyIncident(analysis, plan, []); // no location evidence
    expect(audit.requiresHumanApproval).toBe(true);
    expect(audit.contradictions.some((c) => /simulated/i.test(c))).toBe(true);
  });

  it("reconcile produces a structurally complete orchestration decision", () => {
    const analysis = analyseIncident("Tyre burst", []);
    const plan = planRecovery(analysis);
    const audit = verifyIncident(analysis, plan, []);
    const decision = reconcile(analysis, plan, audit);
    expect(typeof decision.selectedAction).toBe("string");
    expect(typeof decision.explanation).toBe("string");
    expect(typeof decision.reconciliation).toBe("string");
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.requiresHumanApproval).toBe(true);
  });

  it("reconcile carries advisory memory reference without overriding evidence", () => {
    const analysis = analyseIncident("Tyre burst", []);
    const plan = planRecovery(analysis);
    const audit = verifyIncident(analysis, plan, []);
    const memory = { sourceIncidentId: "RS-88", incidentType: "tyre_failure", correctionReason: "Check seals", replacementAction: "Seal check", relationship: "same-incident-type" as const };
    const decision = reconcile(analysis, plan, audit, memory);
    expect(decision.reconciliation).toContain("RS-88");
    expect(decision.reconciliation).toMatch(/advisory/i);
  });
});
