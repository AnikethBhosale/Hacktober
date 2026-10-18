import { NextRequest, NextResponse } from "next/server";
import { incidentStore } from "@/src/lib/store";

type DecisionRequest = { decision: "approve" | "escalate" | "correct"; reason?: string; replacementAction?: string };

function parseDecision(body: unknown): DecisionRequest | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (value.decision !== "approve" && value.decision !== "escalate" && value.decision !== "correct") return null;
  const reason = value.reason === undefined ? undefined : typeof value.reason === "string" ? value.reason.trim() : null;
  const replacementAction = value.replacementAction === undefined ? undefined : typeof value.replacementAction === "string" ? value.replacementAction.trim() : null;
  if (reason === null || replacementAction === null) return null;
  if (value.decision === "correct" && (!reason || !replacementAction)) return null;
  return { decision: value.decision, reason, replacementAction };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const decision = parseDecision(body);
  if (!decision) return NextResponse.json({ error: "Invalid decision request" }, { status: 400 });
  const incident = incidentStore.get(id);
  if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  const at = new Date().toISOString();
  if (decision.decision === "approve") { incident.status = "APPROVED"; incident.driverInstruction = "Dispatcher approved the recovery plan. Please follow the coordinator's instructions and do not move until the backup arrangement is confirmed."; }
  if (decision.decision === "escalate") incident.status = "ESCALATED";
  if (decision.decision === "correct") { incident.status = "CORRECTED"; incident.correction = { reason: decision.reason!, replacementAction: decision.replacementAction!, at }; }
  incident.timeline.push({ at, actor: "Dispatcher", message: `${decision.decision}${decision.reason ? `: ${decision.reason}` : ""}`, kind: "human" });
  incidentStore.save(incident); return NextResponse.json({ incident });
}
