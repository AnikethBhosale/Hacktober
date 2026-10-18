import { loadLocalEnv } from "../src/lib/env.ts";
import { handleTelegramUpdate, sendTelegramMessage, type TelegramUpdate } from "../src/lib/telegram.ts";

loadLocalEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required for long polling");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function causeCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const cause = "cause" in error ? (error as { cause?: { code?: string } }).cause : undefined;
  return cause?.code ?? ("code" in error ? String((error as { code?: string }).code) : "");
}

async function getUpdates(offset: number): Promise<TelegramUpdate[]> {
  const controller = new AbortController();
  const watchdog = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(["message"]))}`,
      { signal: controller.signal }
    );
    if (!response.ok) throw new Error(`Telegram getUpdates failed (${response.status})`);
    const payload = await response.json() as { ok: boolean; result: TelegramUpdate[] };
    return payload.result ?? [];
  } finally {
    clearTimeout(watchdog);
  }
}

const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

async function forwardToDashboard(update: TelegramUpdate): Promise<boolean> {
  const response = await fetch(`${appUrl}/api/telegram/update`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": webhookSecret,
    },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Dashboard intake failed (${response.status}): ${body}`);
  }
  return true;
}

await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).catch(() => undefined);

let offset = 0;
let backoffMs = 1000;
console.log(`RouteSathi Telegram long polling started. Forwarding incidents to ${appUrl}. Press Ctrl+C to stop.`);
while (true) {
  try {
    const updates = await getUpdates(offset);
    backoffMs = 1000;
    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        try {
          await forwardToDashboard(update);
        } catch (error) {
          console.warn("Dashboard was not reachable; storing this incident locally.", error);
          const result = await handleTelegramUpdate(update);
          if (result && update.message) await sendTelegramMessage(update.message.chat.id, result.driverReply);
        }
      } catch (error) {
        console.error("Failed to process Telegram update", error);
        if (update.message) {
          await sendTelegramMessage(update.message.chat.id, "We received your message. Please send the report again in a moment.").catch(() => undefined);
        }
      }
    }
  } catch (error) {
    const code = causeCode(error);
    console.warn(`Telegram poll interrupted (${code || (error instanceof Error ? error.message : "unknown")}). Retrying in ${backoffMs / 1000}s.`);
    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 15_000);
  }
}
