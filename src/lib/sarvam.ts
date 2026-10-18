export const SARVAM_DEFAULT_MODEL = "saaras:v4";

export function sarvamModel() {
  return process.env.SARVAM_STT_MODEL ?? SARVAM_DEFAULT_MODEL;
}

export async function transcribeWithSarvam(
  audio: Blob,
  filename: string
): Promise<{ transcript: string; languageCode?: string }> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY is not configured");
  const body = new FormData();
  body.append("file", audio, filename);
  body.append("model", sarvamModel());
  body.append("mode", "codemix");
  body.append("language_code", "unknown");
  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": key },
    body,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Sarvam speech-to-text failed (${response.status}): ${raw}`);
  const payload = JSON.parse(raw) as { transcript?: string; language_code?: string };
  const transcript = payload.transcript?.trim();
  if (!transcript) throw new Error("Sarvam returned an empty transcript");
  return { transcript, languageCode: payload.language_code };
}
