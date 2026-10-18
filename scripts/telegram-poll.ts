import { handleTelegramUpdate, sendTelegramMessage, type TelegramUpdate } from "../src/lib/telegram.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required for long polling");
let offset = 0;
console.log("RouteSathi Telegram long polling started. Press Ctrl+C to stop.");
while (true) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=30&offset=${offset}`);
  if (!response.ok) throw new Error(`Telegram getUpdates failed (${response.status})`);
  const payload = await response.json() as { ok: boolean; result: TelegramUpdate[] };
  for (const update of payload.result) {
    offset = update.update_id + 1;
    const result = handleTelegramUpdate(update);
    if (result && update.message) await sendTelegramMessage(update.message.chat.id, result.driverReply);
  }
}
