# Setup and team handoff

## Requirements

- Node.js 22.13+ and npm. Node 22.16 and 24.19 were tested locally.
- A Photon project and provisioned iMessage line. An existing group on a dedicated line is required for the group demo. Verify project user allowlisting/plan permissions with Photon.
- A Gemini API key with access to the configured model, image input and structured output. Current default: `gemini-3.8-flash`.
- A persistent writable disk for SQLite and a continuously running **single** agent process.

## Agent

All four feature branches are published. [Review PR #1](https://github.com/CinthiaOchoa/ClearCircle/pull/1) targets main and has not been merged. Clone and switch to the final feature branch below; see [publication status](publication-status.md).

```bash
git clone https://github.com/CinthiaOchoa/ClearCircle.git
cd ClearCircle
git switch feat/clearcircle-web
npm ci
cp .env.example .env
```

Edit `.env` locally. Do not commit it:

| Variable | Value / purpose |
| --- | --- |
| `PROJECT_ID`, `PROJECT_SECRET` | Photon project credentials |
| `PHOTON_LINE_NUMBER` | Optional source line in E.164 format; recommended if the project has multiple lines |
| `GEMINI_API_KEY` | Gemini credential |
| `GEMINI_MODEL` | Image-capable, structured-output model enabled for your key |
| `PARENT_ADDRESS`, `HELPER_ADDRESS` | Distinct verified E.164 phone numbers; mapped to exactly one configured family |
| `FAMILY_GROUP_ID` | Existing Photon group ID. Leave empty for labeled helper DM fallback |
| `DATABASE_PATH` | Defaults to `./data/clearcircle.sqlite`; preserve this directory across restarts |
| `DEMO_REMINDER_SECONDS` | `60` for the demo, `0` for deadline scheduling |
| `API_TOKEN` | Optional random 32+ character token; enables read-only dashboard API |
| `API_PORT` | Defaults to `8787`; listens only on `127.0.0.1` |

Generate the token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, then copy it into the local environment files. Use different values from the hardcoded, synthetic-only browser-test values.

```bash
npm run dev
```

For a compiled agent:

```bash
npm run build
node dist/index.js
```

Parent sends `START`, helper sends `JOIN`, each in their own private conversation with the agent. Test a **synthetic** photo from `fixtures/utility-notice.png`. If iMessage delivers HEIC, export/send as JPEG or PNG; HEIC conversion is not implemented. Downloads use Photon SDK streams after opt-in and are limited to 6 MB and 30 seconds. No arbitrary attachment URL is fetched.

## Frontend

Run in a separate terminal:

```bash
cd ClearCircle/web
npm ci
cp .env.example .env.local
npm run dev
```

The public walkthrough at `http://localhost:3000/` works without provider credentials. For the private dashboard:

| Web variable | Set to |
| --- | --- |
| `CLEARCIRCLE_API_URL` | `http://127.0.0.1:8787` when Next and agent share the host |
| `CLEARCIRCLE_API_TOKEN` | The agent's exact `API_TOKEN` |
| `DASHBOARD_PASSWORD` | A separate strong 12+ character family password |
| `DASHBOARD_ORIGIN` | Exact public origin, e.g. `https://clearcircle.example`; no trailing slash. Local development can leave it empty |

Then open `/family`. Sign-in creates an eight-hour HMAC-signed HttpOnly SameSite=Strict cookie (Secure for production builds). Password or API-token rotation invalidates existing sessions. Failed attempts are limited per process. Data fetches are authenticated server-to-server and never cached. The browser does not receive the API token, participant phone numbers, original images, full OCR, or completion notes.

The private page can refresh and filter tasks and show Spanish actions/evidence. Permission, claim and completion commands are performed through iMessage. It never creates a handoff through the dashboard.

For a production frontend build on the same host:

```bash
npm run build
npm run start
```

## Hosting

The agent is a long-running Node process, **not a serverless function**. Keep one instance under a process supervisor with a persistent volume. Protect the host and the database directory. Current file permissions are restricted for files created by the agent; imported databases may need permissions corrected by the operator.

Serve the Next.js site over HTTPS behind a trusted reverse proxy. Set `DASHBOARD_ORIGIN` to the external origin, and preserve the Host header. Keep the token-protected agent API private. If Next runs on a different host, its `127.0.0.1` points to that host, not the agent: provide a private network/reverse proxy path to the agent and set the web URL accordingly. Do not expose unencrypted bearer-token traffic over the public internet.

Changing configured family addresses requires a fresh database or an explicit migration; the agent refuses to attach a different family to existing records. The one-family shared-password dashboard is a prototype; individual auth, encrypted storage, retention rules and shared rate limiting must precede a production rollout.

## Tests

From the repo root: `npm test`, `npm run check`, `npm run build`, `npm run test:live`. From `web`: `npm run check`, `npm run build`, `npx playwright install chromium`, `npm test`. Root dependencies are needed by the browser fixture.

In restricted environments, `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/a/chromium-or-headless-shell npm test` can select an already installed browser. Local screenshots/checks used Chromium Headless Shell 134 after the default browser downloads failed. Default CI uses Playwright's matching browser. See `docs/test-results.md` for the distinction.

## Troubleshooting

- **Live tests skipped:** required credentials are absent. This is not a provider success.
- **No photo extraction:** verify START, the original private conversation, JPEG/PNG/WebP, file size, Photon attachment transfer, Gemini model/key/quota and a legible photo.
- **No family send:** verify JOIN, parent SÍ, the dedicated serving line and group ID. Only the two configured human members are allowed; any extra member blocks sharing. Pending sends retry with backoff and are counted by the dashboard.
- **Cannot sign in:** check both web secrets, minimum lengths, exact public origin and that the web server restarted after environment edits. Production cookies require a secure browser origin (HTTPS or localhost).
- **Dashboard cannot reach agent:** verify `API_TOKEN` matches, port, private connectivity and that the agent started successfully.
- **New letter blocked:** complete or cancel the active task before sending another; a review-needed image can be replaced.
- **Restart duplicates a delivered message:** external acceptance and local acknowledgement are not atomic. This is an at-least-once queue; true exactly-once delivery needs a verified provider idempotency contract.
