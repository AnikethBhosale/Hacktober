import { NextRequest, NextResponse } from "next/server";
import { incidentStore } from "@/src/lib/store";
import { runWorkflow } from "@/src/lib/workflow";
import type { Evidence, Incident } from "@/src/lib/types";

/** Telegram webhook/long-poll adapter. Configure grammY transport in production; this handler is safe for local simulator use. */
export async function POST(request: NextRequest) {
  const body = await request.json() as { message?: { message_id: number; text?: string; voice?: unknown; photo?: unknown; document?: unknown; location?: { latitude: number; longitude: number }; from?: { first_name?: string } } };
  const message = body.message; if (!message) return NextResponse.json({ ok: true });
  const command = message.text?.trim() || "";
  if (command === "/start") return NextResponse.json({ ok: true, driverReply: "Welcome to RouteSathi. By sending a report you consent to your incident evidence being reviewed by your dispatcher. Send voice, photo, document, text, or location." });
  if (command === "/report") return NextResponse.json({ ok: true, driverReply: "Send a voice note, photo, document, text, or location. Include what happened, your safe location, and whether goods are affected." });
  if (command === "/help") return NextResponse.json({ ok: true, driverReply: "Supported: voice notes, photos, documents, text, and live location. /status RS-102 checks a report." });
  if (command.startsWith("/status")) { const id = command.split(/\s+/)[1]; const incident = id && incidentStore.get(id); return NextResponse.json({ ok: true, driverReply: incident ? `${incident.id}: ${incident.status.replace("_", " ")}. ${incident.driverInstruction}` : "Incident not found. Use /status RS-102." }); }
  const text = message.text || "Voice/photo report received"; const id = `RS-${Math.floor(100 + Math.random() * 900)}`;
  const evidence: Evidence[] = [{ id: `tg-${message.message_id}`, kind: message.voice ? "voice" : message.photo ? "photo" : message.document ? "document" : message.location ? "location" : "text", label: "Telegram message", detail: text, source: "observed", messageId: String(message.message_id) }];
  const relevant = incidentStore.list().find((i) => i.correction && /tyre|carton/i.test(text));
  const workflow = runWorkflow({ id, driver: message.from?.first_name || "Telegram driver", transcript: text, language: /hai|ho gaya|karton/i.test(text) ? "Hinglish" : "English", evidence, memory: relevant?.correction ? `Prior correction on ${relevant.id}: ${relevant.correction.reason}` : undefined });
  const incident: Incident = { id, status: "PENDING_APPROVAL", createdAt: new Date().toISOString(), driver: message.from?.first_name || "Telegram driver", language: /hai|ho gaya|karton/i.test(text) ? "Hinglish" : "English", transcript: text, evidence, ...workflow };
  incidentStore.save(incident); return NextResponse.json({ ok: true, incidentId: id, driverReply: `Incident ${id} created. ${workflow.driverInstruction}` });
}
