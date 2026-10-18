# RouteSathi

RouteSathi is a voice-first dispatcher-control MVP for small Indian fleets. It accepts driver incident evidence, runs independent typed agent assessments, and presents an approval-gated recommendation with a traceable audit trail.

## What is included

- Dispatcher dashboard: incident list, evidence, structured agent handoffs, alternatives, audit provenance, and Approve / Escalate / Correct controls.
- Telegram-ready intake endpoint for text, voice, photo, document, and location updates. `/start`, `/report`, `/status <incident-id>`, and `/help` are the intended bot commands (wire the chosen grammY long-poll adapter to `POST /api/telegram/update`).
- Explicit four-stage workflow: Incident Analyst, Route Planner, Audit & Verification, and Gemma Orchestrator.
- Deterministic `MOCK_AI=true` mode with three seeded incidents, five drivers, eight vehicles, ten shipments, three backups, and two routes.
- Live mode calls a local **Ollama `gemma4:e2b`** model for analysis, planning, audit, and orchestration. A provider abstraction records the provider/model for every agent result and fails loudly when Ollama is unreachable. It does not silently fall back.

## Run locally

1. Copy `.env.example` to `.env.local`. Set `MOCK_AI=true` for a zero-key demo, or keep `MOCK_AI=false` to use local Ollama.
2. Install dependencies with `npm install`.
3. Run `npm run dev`, then open `http://localhost:3000`.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before shipping.

The local dashboard starts with **RS-102**, a Hinglish tyre-burst / damaged-carton example. Click **Approve**, **Escalate**, or enter a reason under **Correct recommendation**. Corrections are rendered as a human decision; a future matching Telegram update retrieves the correction as advisory memory, never as evidence or an automatic override.

## Provider configuration

Seeded dashboard rows still say “Deterministic demo.” For live Telegram intake and new incidents, set `MOCK_AI=false`.

Live providers, in order:

1. **Google AI Studio Gemma** (`GEMINI_API_KEY`): analysis, planning, audit, and orchestration. Default model is hosted `gemma-4-26b-a4b-it`. If that model returns 500, the client retries then falls through `GEMMA_FALLBACK_MODELS` (`gemma-4-31b-it`, then `gemini-2.0-flash`). Gemma 4 E2B is an on-device/Ollama size and is not a Gemini API model id.
2. **Local Ollama** (`gemma4:e2b`) if no Google key is set. Keep `OLLAMA_NUM_CTX=2048` and `OLLAMA_NUM_GPU=0` on laptops to avoid CUDA host-buffer OOMs.
3. **Sarvam** (`SARVAM_API_KEY`): Hindi/Hinglish/code-mix **speech-to-text** on Telegram voice notes (`saaras:v4`, `mode=codemix`). Text captions still work without Sarvam.

- `GROQ_API_KEY`, `OPENAI_API_KEY`: reserved explicit fallback adapters. Add an adapter and its UI provenance before enabling one; never silently switch.

`prisma/schema.prisma` defines the local SQLite persistence contract (`DATABASE_URL="file:./dev.db"`). The current development store is in-memory to keep the no-key demo instantly runnable; replace it with the Prisma adapter before multi-process deployment.

## Telegram local setup

1. In Telegram, open `@BotFather`, run `/newbot`, choose a name and a username ending in `bot`, and place the token in `TELEGRAM_BOT_TOKEN` locally. Generate a separate high-entropy value for `TELEGRAM_WEBHOOK_SECRET`; the webhook rejects every request without its matching `X-Telegram-Bot-Api-Secret-Token` header.
2. Use long polling locally with `npm run telegram:poll` while `npm run dev` is running. The poller forwards updates to `http://127.0.0.1:3000/api/telegram/update` so new incidents land in the same store the dashboard reads (`data/incidents.json`). Do not commit the token.
3. `/start` introduces privacy/consent; `/report` explains supported evidence; `/status <incident-id>` returns status; `/help` lists formats.
4. For production webhook testing, expose a public HTTPS URL and register it with `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<PUBLIC_HTTPS_URL>/api/telegram/update&secret_token=<TELEGRAM_WEBHOOK_SECRET>`. Keep the token and secret out of terminal history and source control.

## Trust model

The UI labels evidence as **observed** or **simulated**. Retrieved correction memory is separately labelled as advisory, carries its source incident ID and relationship, and is never evidence or an automatic override. Recommendations are model inference, values such as backup availability are simulated data, and dispatcher actions are human decisions. The driver only receives an instruction that approval is pending until a dispatcher approves.
