import { NextRequest, NextResponse } from "next/server";
import { incidentStore } from "@/src/lib/store";

/** GET /api/incidents/[id] — individual incident lookup used by /status bot command and audit panel. */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const incident = incidentStore.get(id);
    if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    return NextResponse.json({ incident });
}
