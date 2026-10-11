# Verification report

Verified locally on October 10, 2026. Results describe this implementation, not successful live-provider operation.

| Check | Result | Scope |
| --- | --- | --- |
| Agent `npm test` | **34 passed** | Photon payload/stream adapter, Gemini schema/API boundary, full mocked pipeline, coordination, consent, deduplication, state transitions, API authentication, retry/restart/reminder behavior |
| Node 22 compatibility | **34 passed** | Same agent tests under Node 22.16.0 |
| Agent `npm run check` | **Passed** | Strict TypeScript compilation against installed SDK definitions |
| Agent `npm run build` | **Passed** | JavaScript build with rewritten relative import extensions |
| Web `npm run check` | **Passed** | Next.js routes, session code, pages and browser test fixture |
| Web `npm run build` | **Passed** | Next.js 15.5.27 production build; `/`, `/family`, session and data endpoints |
| Web `npm test` | **8 passed** | Four workflows on desktop and mobile Chromium against the production build and actual local coordinator/SQLite/API with synthetic fixture data |
| Agent live suite | **2 skipped** | No Photon or Gemini credentials available; zero live integrations passed |
| Production dependency audit | **0 vulnerabilities reported** | Both agent and web `npm audit --omit=dev`; explicit compatible-major overrides for OpenTelemetry core and PostCSS |
| GitHub Actions | **Check hosted run separately** | All feature branches and PR #1 are published. Local results above do not imply hosted CI passed. See [publication status](publication-status.md) |

## Browser verification

Desktop viewport: 1440 × 1000. Mobile viewport: 393 × 852. Tested: supporting evidence, Spanish/English toggle, approval → claim → reported completion walkthrough, restart, responsive width, wrong/correct password, real API-backed task display, active/completed filters, refresh, logout, HttpOnly/Secure/SameSite cookie settings, unauthorized/tampered sessions, cross-origin rejection, and offline errors without substituting demonstration letters. No uncaught page errors were observed in the main user flows.

The screenshots in `docs/screenshots/` use only synthetic data. The private-dashboard screenshots exercise the real API through `web/tests/browser-agent.ts`, which never imports the production entrypoint or contacts an external provider.

Default Playwright browser downloads failed in this environment with truncated/empty archives. A successfully downloaded **Chromium Headless Shell 134.0.6998.35** was selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for local checks. Matching-current-browser, Safari/WebKit, real-device iMessage and real phones remain unverified. CI is configured to install Playwright's matching Chromium.

## ZIP review and completed corrections

- Replaced inline attachment assumptions with the SDK's authenticated lazy stream; authorization happens before bytes are read. Oversize, unsupported and timed-out partial images are rejected.
- Removed arbitrary-group-as-DM assumptions, bound private conversations, gated parent approval, checked group membership and added source-line selection.
- Added actual Gemini response schema, bounded/strict output, Spanish purpose, valid-calendar/currency checks and evidence/transcription consistency gates. Full OCR is discarded after validation.
- Fixed hexadecimal completion-ID parsing and rejected malformed IDs instead of falling back to a different task.
- Replaced send-before-state mutations and dropped reminders with transactional event/task/outbox writes, leases, backoff and restart recovery. Escalation timing begins at handoff delivery acknowledgement.
- Added STOP, active-letter safeguards, task status commands, cancellation suppression and database-family binding.
- Added an actual protected read-only API/dashboard while retaining the honest fictional public preview. Type checks, builds, tests, lockfiles and workflow configuration were verified locally.

## Unresolved live gates and production boundaries

1. **Photon:** real project authentication, line provisioning/allowlisting, source number, incoming sender mapping, attachment MIME/stream behavior, participant delivery, group roster and group delivery require a provisioned account and real-phone testing. The credential-gated smoke test only authenticates; it does not send messages.
2. **Gemini:** actual model availability, quota, response shape and extraction accuracy require the credential-gated synthetic-image smoke test and manual factual comparison. Consistency checks do not independently verify OCR or semantic truth.
3. **Delivery:** retries are at least once. A crash between external acceptance and local acknowledgement, or a send exceeding its lease, can duplicate messages. Already in-flight messages can arrive after cancellation/opt-out. No exactly-once claim is made.
4. **Prototype operations:** one family/helper/active letter/process, local unencrypted SQLite, no automatic retention/erasure or backup policy, shared-password dashboard with per-process throttling. Production needs individual auth, durable operational controls and privacy policy work.
5. **Scheduling/media:** deadline reminders currently use UTC noon on the previous day; family-local scheduling and HEIC conversion are deferred. Unsupported content asks for JPEG/PNG/WebP.
6. **Roadmap:** voice explanations, rich iMessage cards and reaction claims are intentionally unimplemented.

## Reproduce

Install root/web dependencies with `npm ci` in each directory. Run the commands in the table. Build the web app before browser tests. For live tests, supply local `.env` credentials and run `npm run test:live`, then follow `docs/demo-script.md`. Do not treat skipped tests as live-provider success.
