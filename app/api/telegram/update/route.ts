import { NextRequest, NextResponse } from "next/server";
import { incidentStore } from "@/src/lib/store";
import { runWorkflow } from "@/src/lib/workflow";
import type { Evidence, Incident, MemoryReference } from "@/src/lib/types";

function incidentTypeFor(text: string) {
  return /tyre|puncture|burst/i.test(text) ? "tyre_failure" : "unknown";
}

function correctionMemoryFor(text: string): MemoryReference | undefined {
  const incidentType = incidentTypeFor(text);
  if (incidentType === "unknown") return undefined;
  const related = incidentStore.list().find((incident) => {
    const priorType = incident.agents.find((agent) => agent.agent === "Incident Analyst")?.output.incidentType;
    return incident.correction && priorType === incidentType;
  });
  if (!related?.correction) return undefined;
  return { sourceIncidentId: related.id, incidentType, correctionReason: related.correction.reason, replacementAction: related.correction.replacementAction, relationship: "same-incident-type" };
}

/** Telegram webhook/long-poll adapter. Configure grammY transport in production; this handler is safe for local simulator use. */
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Telegram webhook is not configured" }, { status: 503 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "Unauthorized Telegram webhook" }, { status: 401 });
  const body = await request.json() as { message?: { message_id: number; text?: string; voice?: unknown; photo?: unknown; document?: unknown; location?: { latitude: number; longitude: number }; from?: { first_name?: string } } };
  const message = body.message; if (!message) return NextResponse.json({ ok: true });
  const command = message.text?.trim() || "";
  if (command === "/start") return NextResponse.json({ ok: true, driverReply: "Welcome to RouteSathi. By sending a report you consent to your incident evidence being reviewed by your dispatcher. Send voice, photo, document, text, or location." });
  if (command === "/report") return NextResponse.json({ ok: true, driverReply: "Send a voice note, photo, document, text, or location. Include what happened, your safe location, and whether goods are affected." });
  if (command === "/help") return NextResponse.json({ ok: true, driverReply: "Supported: voice notes, photos, documents, text, and live location. /status RS-102 checks a report." });
  if (command.startsWith("/status")) { const id = command.split(/\s+/)[1]; const incident = id && incidentStore.get(id); return NextResponse.json({ ok: true, driverReply: incident ? `${incident.id}: ${incident.status.replace("_", " ")}. ${incident.driverInstruction}` : "Incident not found. Use /status RS-102." }); }
  const text = message.text || "Voice/photo report received"; const id = incidentStore.createId();
  const evidence: Evidence[] = [{ id: `tg-${message.message_id}`, kind: message.voice ? "voice" : message.photo ? "photo" : message.document ? "document" : message.location ? "location" : "text", label: "Telegram message", detail: text, source: "observed", messageId: String(message.message_id) }];
  const workflow = runWorkflow({ id, driver: message.from?.first_name || "Telegram driver", transcript: text, language: /hai|ho gaya|karton/i.test(text) ? "Hinglish" : "English", evidence, memory: correctionMemoryFor(text) });
  const incident: Incident = { id, status: "PENDING_APPROVAL", createdAt: new Date().toISOString(), driver: message.from?.first_name || "Telegram driver", language: /hai|ho gaya|karton/i.test(text) ? "Hinglish" : "English", transcript: text, evidence, ...workflow };
  incidentStore.save(incident); return NextResponse.json({ ok: true, incidentId: id, driverReply: `Incident ${id} created. ${workflow.driverInstruction}` });
}
