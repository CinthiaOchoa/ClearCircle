# ClearCircle

**Other apps explain the letter. ClearCircle helps your family handle what comes next.**

A one-family iMessage agent for Spanish-speaking parents and the family members who help them understand important mail. A parent sends a photo privately, gets a Spanish explanation with supporting quotes, approves a handoff, and an opted-in helper claims the follow-up. Reminders and a helper-reported completion update close the loop.

## Implemented

- Photon Spectrum iMessage transport using the installed SDK's authenticated attachment streams, bounded downloads, explicit source-line selection, private participant messages, and membership-checked family handoffs.
- Gemini multimodal extraction with JSON schema, strict Zod validation, Spanish explanations, calendar/currency validation and missing-evidence review gates.
- SQLite consent, deduplicated inbound processing, atomic claims, cancellation, opt-out, reminders, escalation and a transactional outgoing-message queue with retry and restart recovery.
- Responsive Next.js public walkthrough using fictional data, plus a password-protected private family dashboard backed by the real read-only API. Actions and permissions remain in iMessage.
- Automated agent/API tests, desktop/mobile browser tests, separate type checks/builds, lockfiles and CI.

**Live Photon/Gemini success is not claimed.** Credentials were unavailable during implementation. See [test results and unresolved issues](docs/test-results.md), [setup](docs/setup.md), and [live demo checks](docs/demo-script.md). Voice and rich iMessage cards remain on the [roadmap](docs/roadmap.md).

## Quick start

Use Node.js **22.13+** (tested with 22.16 and 24.19). Both SQLite and type stripping are experimental in Node 22.

```bash
npm ci
cp .env.example .env
```

Configure `PROJECT_ID`, `PROJECT_SECRET`, `GEMINI_API_KEY`, `PARENT_ADDRESS` and `HELPER_ADDRESS` in `.env`. The configured addresses must be distinct E.164 phone numbers. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; choose an image-capable structured-output model enabled for your key. Set `PHOTON_LINE_NUMBER` if your project serves multiple numbers.

```bash
npm run dev
```

For a dedicated Photon line, set an existing `FAMILY_GROUP_ID` containing **only the parent, helper and agent**. The adapter rechecks the two human members before every handoff. Leave it empty for an explicitly labeled helper DM fallback. A fallback does not demonstrate a family group. Provision/allowlist the test participants as required by your Photon plan.

1. Parent sends `START` privately; helper sends `JOIN` privately.
2. Parent sends a JPEG/PNG/WebP letter photo (up to 6 MB).
3. Parent replies `SÍ CC-<8 hex characters>` or `SÍ` when the single pending task is clear.
4. Helper replies `CLAIM CC-<code>`, then `DONE CC-<code> — I contacted the company` after actually following up.
5. `STATUS` lists tasks; parent can use `CANCELAR CC-<code>`. Either participant can send `STOP` privately to opt out.

The agent accepts one active letter at a time to keep permission unambiguous. A review-needed photo can be replaced with a clearer one. Approvals and photo processing are private; only the configured family group or bound private conversations accept task commands.

## Website

```bash
cd web
npm ci
npm run dev
```

Open `http://localhost:3000` for the fictional walkthrough. `/family` is a separate private dashboard. It does not show sample letters when the real agent is unavailable.

To enable `/family`, set a random 32+ character `API_TOKEN` in the **agent** `.env`, and configure `CLEARCIRCLE_API_TOKEN` (the same token), `CLEARCIRCLE_API_URL` and a separate 12+ character `DASHBOARD_PASSWORD` in `web/.env.local`, using `web/.env.example`. Never prefix secrets with `NEXT_PUBLIC_`. See [full setup and hosting instructions](docs/setup.md).

## Verification

```bash
npm test
npm run check
npm run build
npm run test:live
npm audit --omit=dev
cd web
npm run check
npm run build
npx playwright install chromium
npm test
npm audit --omit=dev
```

The browser suite starts the actual coordinator/SQLite/API with **synthetic fixture data** and the production Next.js build. It never contacts Photon or Gemini. Install root dependencies before running it. The live suite skips providers when their credentials are absent; skipped tests are not successful live integrations.

## Screenshots

All screenshots use fictional data. The private dashboard screenshots exercise the real API through a synthetic test agent.

- [Desktop walkthrough](docs/screenshots/desktop-walkthrough.png)
- [Desktop family preview](docs/screenshots/desktop-family-preview.png) · [Mobile family preview](docs/screenshots/mobile-family-preview.png)
- [Desktop private dashboard](docs/screenshots/desktop-private-dashboard.png) · [Mobile private dashboard](docs/screenshots/mobile-private-dashboard.png)

## Boundaries

This prototype supports **one configured parent and one helper**, one active letter, and one agent process on persistent local SQLite. The private dashboard uses a shared family password, not individual accounts, and is read-only. Use synthetic mail for the demo.

- Task metadata, evidence and pending outgoing text are stored locally; images and full OCR are not retained by this application. Stored evidence can contain sensitive text from the letter. Photon/Gemini have their own provider retention policies. SQLite is not encrypted and automated retention/purging is not implemented.
- Both participants opt in. The parent approves sharing. Untrusted document text cannot select recipients, authorize payments, or change permissions.
- Evidence is model-generated transcription with consistency checks, **not independent verification** of the image. Missing/ambiguous facts require review; plausible extraction errors still need human checking.
- Completion is **helper reported**. It does not verify payment, account resolution or external actions.
- Durable sends are **at least once**. A crash after provider acceptance but before local acknowledgement may duplicate a message. A send already in flight may arrive after cancellation/opt-out. These boundaries are explained in [architecture](docs/architecture.md).

## Review branches

The implementation is stacked across `feat/photon-integration`, `feat/document-ai`, `feat/family-coordination`, and `feat/clearcircle-web`. The final branch contains all work and is intended as the head of the single review PR into `main`. Publication is currently blocked by GitHub write access; see [publication status](docs/publication-status.md). No merge or direct push to `main` is part of this workflow.
