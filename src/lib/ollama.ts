import type { ZodType } from "zod";
import { parseJsonObject } from "./json.ts";

export const OLLAMA_DEFAULT_HOST = "http://127.0.0.1:11434";
export const OLLAMA_DEFAULT_MODEL = "gemma4:e2b";

export function useMockAi() {
  return process.env.MOCK_AI !== "false";
}

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function ollamaConfig() {
  return {
    host: (process.env.OLLAMA_HOST ?? OLLAMA_DEFAULT_HOST).replace(/\/$/, ""),
    model: process.env.OLLAMA_MODEL ?? OLLAMA_DEFAULT_MODEL,
    // Gemma 4 E2B is multimodal; a 128k default context plus GPU projector often OOMs laptops.
    numCtx: envInt("OLLAMA_NUM_CTX", 2048),
    numGpu: envInt("OLLAMA_NUM_GPU", 0),
  };
}

export function parseOllamaJsonContent(content: string): unknown {
  return parseJsonObject(content);
}

export async function ollamaJson<T>(system: string, user: string, schema: ZodType<T>): Promise<T> {
  const { host, model, numCtx, numGpu } = ollamaConfig();
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      keep_alive: "10m",
      think: false,
      options: { num_ctx: numCtx, num_gpu: numGpu },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama ${model} request failed (${response.status}): ${body}`);
  }
  const payload = (await response.json()) as { message?: { content?: string } };
  const content = payload.message?.content;
  if (!content?.trim()) throw new Error(`Ollama ${model} returned an empty message`);
  return schema.parse(parseJsonObject(content));
}
