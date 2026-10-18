import { NextRequest, NextResponse } from "next/server";
import { incidentStore } from "@/src/lib/store";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const incident = incidentStore.get(id);
  if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  const body = await request.json() as { decision: "approve" | "escalate" | "correct"; reason?: string; replacementAction?: string };
  const at = new Date().toISOString();
  if (body.decision === "approve") { incident.status = "APPROVED"; incident.driverInstruction = "Dispatcher approved the recovery plan. Please follow the coordinator's instructions and do not move until the backup arrangement is confirmed."; }
  if (body.decision === "escalate") incident.status = "ESCALATED";
  if (body.decision === "correct") { incident.status = "CORRECTED"; incident.correction = { reason: body.reason || "Dispatcher correction", replacementAction: body.replacementAction || incident.recommendation.action, at }; }
  incident.timeline.push({ at, actor: "Dispatcher", message: `${body.decision}${body.reason ? `: ${body.reason}` : ""}`, kind: "human" });
  incidentStore.save(incident); return NextResponse.json({ incident });
}
