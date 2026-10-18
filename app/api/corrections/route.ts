import { NextResponse } from "next/server";
import { correctionMemory } from "@/src/lib/memory";

/** GET /api/corrections — returns all stored dispatcher corrections, newest first. */
export function GET() {
    return NextResponse.json({
        corrections: correctionMemory.list(),
        count: correctionMemory.list().length,
    });
}
