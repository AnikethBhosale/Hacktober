# RouteSathi

RouteSathi is a voice-first dispatcher-control MVP for small Indian fleets. It accepts driver incident evidence, runs independent typed agent assessments, and presents an approval-gated recommendation with a traceable audit trail.

## What is included

- Dispatcher dashboard: incident list, evidence, structured agent handoffs, alternatives, audit provenance, and Approve / Escalate / Correct controls.
- Telegram-ready intake endpoint for text, voice, photo, document, and location updates. `/start`, `/report`, `/status <incident-id>`, and `/help` are the intended bot commands (wire the chosen grammY long-poll adapter to `POST /api/telegram/update`).
- Explicit four-stage workflow: Incident Analyst, Route Planner, Audit & Verification, and Gemma Orchestrator.
- Deterministic `MOCK_AI=true` mode with three seeded incidents, five drivers, eight vehicles, ten shipments, three backups, and two routes.
- A provider abstraction which records the provider/model for every agent result and fails loudly when live capabilities are unconfigured. It does not silently fall back.

## Run locally

1. Copy `.env.example` to `.env.local`. Keep `MOCK_AI=true` for a zero-key demo.
2. Install dependencies with `npm install`.
3. Run `npm run dev`, then open `http://localhost:3000`.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before shipping.

The local dashboard starts with **RS-102**, a Hinglish tyre-burst / damaged-carton example. Click **Approve**, **Escalate**, or enter a reason under **Correct recommendation**. Corrections are rendered as a human decision; a future matching Telegram update retrieves the correction as advisory memory, never as evidence or an automatic override.

## Provider configuration

`MOCK_AI=true` is deliberately the default and all seed outputs visibly say “Deterministic demo.” For live use, set `MOCK_AI=false` and configure the required provider keys in `.env.local`:

- `SARVAM_API_KEY`: Hindi/Hinglish speech transcription (and optional TTS).
- `GEMMA_API_KEY`: primary multimodal analysis and orchestration. The provider adapter intentionally labels the requested **Gemma 4 E2B** identifier as runtime-verified: set the exact identifier only after confirming it with the selected Gemma runtime. This avoids inventing an endpoint or model ID.
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`: reserved explicit fallback adapters. Add an adapter and its UI provenance before enabling one; never silently switch.

`prisma/schema.prisma` defines the local SQLite persistence contract (`DATABASE_URL="file:./dev.db"`). The current development store is in-memory to keep the no-key demo instantly runnable; replace it with the Prisma adapter before multi-process deployment.

## Telegram local setup

1. In Telegram, open `@BotFather`, run `/newbot`, choose a name and a username ending in `bot`, and place the token in `TELEGRAM_BOT_TOKEN` locally. Generate a separate high-entropy value for `TELEGRAM_WEBHOOK_SECRET`; the webhook rejects every request without its matching `X-Telegram-Bot-Api-Secret-Token` header.
2. Use long polling locally with `npm run telegram:poll`; it calls the Telegram Bot API directly and does not require a public URL. Do not commit the token.
3. `/start` introduces privacy/consent; `/report` explains supported evidence; `/status <incident-id>` returns status; `/help` lists formats.
4. For production webhook testing, expose a public HTTPS URL and register it with `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<PUBLIC_HTTPS_URL>/api/telegram/update&secret_token=<TELEGRAM_WEBHOOK_SECRET>`. Keep the token and secret out of terminal history and source control.

## Trust model

The UI labels evidence as **observed** or **simulated**. Retrieved correction memory is separately labelled as advisory, carries its source incident ID and relationship, and is never evidence or an automatic override. Recommendations are model inference, values such as backup availability are simulated data, and dispatcher actions are human decisions. The driver only receives an instruction that approval is pending until a dispatcher approves.
