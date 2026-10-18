import type { ZodType } from "zod";
import { parseJsonObject } from "./json.ts";

export const GEMMA_DEFAULT_MODEL = "gemma-4-26b-a4b-it";
export const GEMMA_DEFAULT_FALLBACKS = "gemma-4-31b-it,gemini-2.0-flash";

export function geminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

export function gemmaModel() {
  return process.env.GEMMA_MODEL ?? GEMMA_DEFAULT_MODEL;
}

export function gemmaModels() {
  const extras = (process.env.GEMMA_FALLBACK_MODELS ?? GEMMA_DEFAULT_FALLBACKS)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set([gemmaModel(), ...extras])];
}

export function geminiText(payload: unknown): string {
  const parts = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").filter(Boolean).join("\n").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateContent(
  key: string,
  model: string,
  system: string,
  user: string,
  useSystemInstruction: boolean,
  generationConfig?: Record<string, unknown>
) {
  const body: Record<string, unknown> = {
    contents: [{
      role: "user",
      parts: [{ text: useSystemInstruction ? user : `${system}\n\n${user}` }],
    }],
  };
  if (useSystemInstruction) body.systemInstruction = { parts: [{ text: system }] };
  if (generationConfig) body.generationConfig = generationConfig;
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(body),
  });
}

export async function geminiJson<T>(system: string, user: string, schema: ZodType<T>): Promise<T> {
  const key = geminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const shapes: Array<{ useSystemInstruction: boolean; generationConfig?: Record<string, unknown> }> = [
    { useSystemInstruction: false, generationConfig: { temperature: 0.2 } },
    { useSystemInstruction: true, generationConfig: { temperature: 0.2 } },
    { useSystemInstruction: true, generationConfig: { temperature: 0.2, responseMimeType: "application/json" } },
  ];

  let lastError = "no Google AI Studio attempt succeeded";
  for (const model of gemmaModels()) {
    let internalFailures = 0;
    shapeLoop: for (const shape of shapes) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await generateContent(key, model, system, user, shape.useSystemInstruction, shape.generationConfig);
        const body = await response.text();
        if (response.status === 500 || response.status === 429 || response.status === 503) {
          lastError = `Google AI Studio ${model} request failed (${response.status}): ${body}`;
          internalFailures += 1;
          await sleep(300 * (attempt + 1));
          if (internalFailures >= 2) break shapeLoop;
          continue;
        }
        if (!response.ok) {
          lastError = `Google AI Studio ${model} request failed (${response.status}): ${body}`;
          break;
        }
        const content = geminiText(JSON.parse(body) as unknown);
        if (!content) {
          lastError = `Google AI Studio ${model} returned an empty message`;
          continue;
        }
        if (model !== gemmaModel()) {
          console.warn(`Gemma primary model unavailable; used ${model}`);
        }
        return schema.parse(parseJsonObject(content));
      }
    }
  }
  throw new Error(lastError);
}
