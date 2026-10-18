import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate, sendTelegramMessage, type TelegramUpdate } from "@/src/lib/telegram";

/** Secure webhook adapter. Use scripts/telegram-poll.ts for local long polling. */
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Telegram webhook is not configured" }, { status: 503 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ error: "Unauthorized Telegram webhook" }, { status: 401 });
  let update: TelegramUpdate;
  try { update = await request.json() as TelegramUpdate; } catch { return NextResponse.json({ error: "Invalid Telegram update" }, { status: 400 }); }
  const result = await handleTelegramUpdate(update);
  if (!result || !update.message) return NextResponse.json({ ok: true });
  const delivery = await sendTelegramMessage(update.message.chat.id, result.driverReply).catch((error: unknown) => ({ delivered: false, reason: error instanceof Error ? error.message : "Unable to send Telegram reply" }));
  return NextResponse.json({ ok: true, incidentId: result.incidentId, delivery });
}
