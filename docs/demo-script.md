# Live integration and phone demo checklist

**Not yet executed against Photon/Gemini.** Use synthetic documents and your two configured/authorized test participants.

1. Provision the Photon project and serving line, allowlist participants if required, configure a Gemini key/model, and run `npm run test:live`. The Photon smoke check authenticates only; it does **not** verify message delivery or group/attachment behavior. The Gemini smoke check extracts `fixtures/utility-notice.png` and checks date/amount/currency/review status.
2. Start the agent with `DEMO_REMINDER_SECONDS=60`. For the group challenge, set an existing dedicated-line group with only the parent, helper and agent. The labeled DM fallback is acceptable for testing, not proof of group support.
3. Parent sends START privately; helper sends JOIN privately. Verify both receive the welcome messages. Confirm real sender IDs match the configured addresses and source-line routing.
4. Parent sends the synthetic notice photo as JPEG/PNG/WebP. Confirm authenticated SDK bytes are received; verify that the Spanish explanation cites the deadline, USD 86.40 and October 15, 2026 accurately. Check that nothing was forwarded to the helper/group before SÍ.
5. Parent sends `SÍ CC-<actual code>`. Verify the task offer reaches the configured group, or carries the DM-fallback label if that mode was selected. An unrelated member in the group should block handoff; remove them before retrying the authorized test.
6. Helper sends `CLAIM CC-<actual code>`. Verify one owner and the parent's private acknowledgement. Repeat CLAIM and confirm there is no second assignment.
7. Wait for the one-minute reminder. Verify exactly one reminder in an ordinary uninterrupted run. Temporarily stop/restart the agent to check persistence; provider acceptance/acknowledgement crashes can still duplicate sends.
8. After performing the fictional follow-up, helper sends `DONE CC-<actual code> — I contacted the company`. Verify the completion note and parent message state **helper reported**, not independently verified payment/resolution.
9. Start another synthetic task; cancel it privately with `CANCELAR CC-<code>`. Confirm no pending reminder/offer is sent later. Separately test STOP and verify later document uploads/claims require re-enrollment.
10. Configure the optional API and web dashboard. Sign in at `/family`, refresh, check status/evidence, then sign out. An unauthenticated dashboard request must return 401. Public `/` continues to display only fictional walkthrough data.

Record the serving line mode, model ID, observed attachment MIME, actual sender mapping, delivery/group/reminder result and any failures before claiming a live end-to-end demo. Do not paste credentials or personal letters into logs or the PR.
