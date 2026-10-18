import { NextResponse } from "next/server";
import { incidentStore } from "@/src/lib/store";

export function GET() { return NextResponse.json({ incidents: incidentStore.list(), mockData: process.env.MOCK_AI !== "false" }); }
