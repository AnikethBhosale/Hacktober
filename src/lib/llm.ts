import type { ZodType } from "zod";
import { geminiApiKey, geminiJson } from "./gemma.ts";
import { ollamaJson } from "./ollama.ts";

/** Prefer hosted Gemma on Google AI Studio; fall back to local Ollama. */
export async function completeJson<T>(system: string, user: string, schema: ZodType<T>): Promise<T> {
  if (geminiApiKey()) return geminiJson(system, user, schema);
  return ollamaJson(system, user, schema);
}
