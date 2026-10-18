import { incidentStore } from "./store.ts";
import { runWorkflow } from "./workflow.ts";
import { useMockAi } from "./ollama.ts";
import { transcribeWithSarvam } from "./sarvam.ts";
import type { Evidence, Incident } from "./types.ts";

export type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  voice?: { file_id: string; duration?: number };
  photo?: Array<{ file_id: string; width: number; height: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
  location?: { latitude: number; longitude: number };
  from?: { first_name?: string };
};
export type TelegramUpdate = { update_id: number; message?: TelegramMessage };
export type TelegramIntakeResult = { incidentId?: string; driverReply: string };

function languageFor(text: string) { return /hai|ho gaya|karton/i.test(text) ? "Hinglish" : "English"; }
function source(message: TelegramMessage, kind: Evidence["kind"], detail: string): Evidence {
  return { id: `tg-${message.message_id}-${kind}`, kind, label: `Telegram ${kind}`, detail, source: "observed", messageId: String(message.message_id) };
}
function evidenceFor(message: TelegramMessage): Evidence[] {
  const evidence: Evidence[] = [];
  if (message.voice) evidence.push(source(message, "voice", `Voice note (${message.voice.duration ?? 0}s), file ${message.voice.file_id}. Transcription pending.`));
  if (message.photo?.length) { const photo = message.photo.at(-1)!; evidence.push(source(message, "photo", `Photo ${photo.width}×${photo.height}, file ${photo.file_id}. Vision analysis pending.`)); }
  if (message.document) evidence.push(source(message, "document", `${message.document.file_name ?? "Document"} (${message.document.mime_type ?? "unknown type"}), file ${message.document.file_id}.`));
  if (message.location) evidence.push(source(message, "location", `Shared location: ${message.location.latitude.toFixed(5)}, ${message.location.longitude.toFixed(5)}.`));
  if (message.text || message.caption) evidence.push(source(message, "text", message.text ?? message.caption ?? ""));
  return evidence.length ? evidence : [source(message, "text", "Telegram incident message received without readable text.")];
}

async function downloadTelegramFile(fileId: string): Promise<{ blob: Blob; filename: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const metaResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!metaResponse.ok) throw new Error(`Telegram getFile failed (${metaResponse.status})`);
  const meta = (await metaResponse.json()) as { result?: { file_path?: string } };
  const filePath = meta.result?.file_path;
  if (!filePath) throw new Error("Telegram getFile did not return a file_path");
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileResponse.ok) throw new Error(`Telegram file download failed (${fileResponse.status})`);
  const bytes = await fileResponse.arrayBuffer();
  const filename = filePath.split("/").at(-1) || "voice.ogg";
  const mime = fileResponse.headers.get("content-type") || "audio/ogg";
  return { blob: new Blob([bytes], { type: mime }), filename };
}

async function withSarvamTranscript(
  message: TelegramMessage,
  evidence: Evidence[],
  transcript: string
): Promise<{ evidence: Evidence[]; transcript: string; languageHint?: string }> {
  if (!message.voice || useMockAi() || !process.env.SARVAM_API_KEY) {
    return { evidence, transcript };
  }
  try {
    const file = await downloadTelegramFile(message.voice.file_id);
    const spoken = await transcribeWithSarvam(file.blob, file.filename);
    const nextEvidence = evidence.map((item) =>
      item.kind === "voice"
        ? { ...item, detail: `Voice note (${message.voice?.duration ?? 0}s) transcribed by Sarvam${spoken.languageCode ? ` (${spoken.languageCode})` : ""}: ${spoken.transcript}` }
        : item
    );
    const merged = [transcript, spoken.transcript].filter(Boolean).join("\n");
    return { evidence: nextEvidence, transcript: merged, languageHint: spoken.languageCode };
  } catch (error) {
    console.error("Sarvam transcription failed", error);
    return { evidence, transcript };
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<TelegramIntakeResult | null> {
  const message = update.message;
  if (!message) return null;
  const command = message.text?.trim() || "";
  if (command === "/start") return { driverReply: "Welcome to RouteSathi. By sending a report you consent to your incident evidence being reviewed by your dispatcher. Send voice, photo, document, text, or location." };
  if (command === "/report") return { driverReply: "Send a voice note, photo, document, text, or location. Include what happened, your safe location, and whether goods are affected." };
  if (command === "/help") return { driverReply: "Supported: voice notes, photos, documents, text, and shared location. Use /status RS-102 to check a report." };
  if (command.startsWith("/status")) { const id = command.split(/\s+/)[1]; const incident = id && incidentStore.get(id); return { driverReply: incident ? `${incident.id}: ${incident.status.replace("_", " ")}. ${incident.driverInstruction}` : "Incident not found. Use /status <incident-id>." }; }

  const rawTranscript = message.text ?? message.caption ?? "";
  const id = incidentStore.createId();
  const prepared = await withSarvamTranscript(message, evidenceFor(message), rawTranscript);
  const transcript = prepared.transcript || "Voice/photo report received";
  const language = prepared.languageHint?.startsWith("hi") ? "Hinglish" : languageFor(transcript);
  try {
    const workflow = await runWorkflow({ id, driver: message.from?.first_name || "Telegram driver", transcript, language, evidence: prepared.evidence });
    const incident: Incident = { id, status: "PENDING_APPROVAL", createdAt: new Date().toISOString(), driver: message.from?.first_name || "Telegram driver", language, transcript, evidence: prepared.evidence, ...workflow };
    incidentStore.save(incident);
    return { incidentId: id, driverReply: `Incident ${id} created. ${workflow.driverInstruction}` };
  } catch (error) {
    console.error("Incident workflow failed", error);
    return { driverReply: "Report received. Gemma could not finish this pass. Dispatcher still has your message — please retry in a minute." };
  }
}

export async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { delivered: false, reason: "TELEGRAM_BOT_TOKEN is not configured" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status})`);
  return { delivered: true };
}
