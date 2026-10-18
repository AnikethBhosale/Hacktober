import { describe, expect, it } from "vitest";
import { handleTelegramUpdate } from "../src/lib/telegram";

describe("Telegram intake", () => {
  it("creates a voice, photo, document, and location evidence trail", async () => {
    process.env.MOCK_AI = "true";
    const result = await handleTelegramUpdate({ update_id: 1, message: { message_id: 88, chat: { id: 22 }, from: { first_name: "Amit" }, caption: "Tyre burst ho gaya", voice: { file_id: "voice-1", duration: 9 }, photo: [{ file_id: "photo-1", width: 120, height: 80 }], document: { file_id: "doc-1", file_name: "challan.pdf", mime_type: "application/pdf" }, location: { latitude: 19.997, longitude: 73.79 } } });
    expect(result?.incidentId).toMatch(/^RS-/);
    expect(result?.driverReply).toContain("Incident");
  });
  it("answers supported commands without creating an incident", async () => {
    const result = await handleTelegramUpdate({ update_id: 2, message: { message_id: 89, chat: { id: 22 }, text: "/help" } });
    expect(result).toEqual({ driverReply: expect.stringContaining("Supported") });
  });
});
