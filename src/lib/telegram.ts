import { incidentStore } from "./store";
import { runWorkflow } from "./workflow";
import type { Evidence, Incident, MemoryReference } from "./types";

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

function incidentTypeFor(text: string) { return /tyre|puncture|burst/i.test(text) ? "tyre_failure" : "unknown"; }
function languageFor(text: string) { return /hai|ho gaya|karton/i.test(text) ? "Hinglish" : "English"; }
function correctionMemoryFor(text: string): MemoryReference | undefined {
  const incidentType = incidentTypeFor(text);
  if (incidentType === "unknown") return undefined;
  const related = incidentStore.list().find((incident) => incident.correction && incident.agents.find((agent) => agent.agent === "Incident Analyst")?.output.incidentType === incidentType);
  if (!related?.correction) return undefined;
  return { sourceIncidentId: related.id, incidentType, correctionReason: related.correction.reason, replacementAction: related.correction.replacementAction, relationship: "same-incident-type" };
}
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

export function handleTelegramUpdate(update: TelegramUpdate): TelegramIntakeResult | null {
  const message = update.message;
  if (!message) return null;
  const command = message.text?.trim() || "";
  if (command === "/start") return { driverReply: "Welcome to RouteSathi. By sending a report you consent to your incident evidence being reviewed by your dispatcher. Send voice, photo, document, text, or location." };
  if (command === "/report") return { driverReply: "Send a voice note, photo, document, text, or location. Include what happened, your safe location, and whether goods are affected." };
  if (command === "/help") return { driverReply: "Supported: voice notes, photos, documents, text, and shared location. Use /status RS-102 to check a report." };
  if (command.startsWith("/status")) { const id = command.split(/\s+/)[1]; const incident = id && incidentStore.get(id); return { driverReply: incident ? `${incident.id}: ${incident.status.replace("_", " ")}. ${incident.driverInstruction}` : "Incident not found. Use /status <incident-id>." }; }

  const transcript = message.text ?? message.caption ?? "Voice/photo report received";
  const id = incidentStore.createId(); const evidence = evidenceFor(message); const language = languageFor(transcript);
  const workflow = runWorkflow({ id, driver: message.from?.first_name || "Telegram driver", transcript, language, evidence, memory: correctionMemoryFor(transcript) });
  const incident: Incident = { id, status: "PENDING_APPROVAL", createdAt: new Date().toISOString(), driver: message.from?.first_name || "Telegram driver", language, transcript, evidence, ...workflow };
  incidentStore.save(incident);
  return { incidentId: id, driverReply: `Incident ${id} created. ${workflow.driverInstruction}` };
}

export async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { delivered: false, reason: "TELEGRAM_BOT_TOKEN is not configured" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status})`);
  return { delivered: true };
}
