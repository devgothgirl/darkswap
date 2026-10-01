# Support report delivery operations

Support reports are persisted independently from marketing subscriptions and campaigns. A saved case is **not** proof of email delivery or inbox review. Reports contain private user-submitted details; restrict database access and do not paste case rows into logs or tickets.

## Before relying on the inbox

1. Configure a dedicated Resend webhook for `POST /api/support/webhook/resend`, subscribed to `email.delivered`, `email.bounced`, and `email.complained`. Store its signing secret as `SUPPORT_RESEND_WEBHOOK_SECRET` in server-side secrets. Do not reuse the marketing webhook or campaign health as a support monitor. The endpoint verifies signed raw requests and only processes events addressed solely to `support@darkswap.app`.
   Apply schema changes through the managed database workflow: make the safe additive change in development, then use Publish to apply the reviewed schema diff to production. Do not use migration scripts or direct production DDL; a development schema push does not update production.
2. Run `pnpm --filter @workspace/api-server test:support-delivery`. This uses a disposable local database and synthetic signed callbacks; it **does not** prove that the real mailbox receives messages.
3. From an address you control, send a synthetic report through `/help` with no real user, wallet, or transaction details. Confirm the message is visible in the actual `support@darkswap.app` inbox and the saved case changes from pending to delivered after the signed callback. Use a separate controlled bounce scenario to verify failed state and operator retrieval. Until the owner confirms both, treat support email delivery as unverified for time-sensitive fund issues.

### Live verification boundaries

- A Resend sending-only API key can send mail but cannot list or configure webhooks. If webhook management returns `restricted_api_key`, configure the dedicated support webhook in the authorized Resend dashboard; do not replace or reconnect a working sending integration just to manage webhooks.
- Resend's `bounced@resend.dev` simulator does not exercise support-case failure handling here: the application sends only to `support@darkswap.app`, and the support callback intentionally ignores any other recipient. Do not widen this recipient filter or disrupt the real support mailbox to force a bounce. A controlled live failure test needs an approved, isolated synthetic case and a callback addressed to the support recipient; record whether that callback was a test event or an actual provider bounce.
- Local signed fixtures, provider acceptance, provider delivery events, and Discord notifications are not proof of inbox receipt. Do not send the live synthetic report until the production schema and dedicated signing secret are ready, and do not close verification without the inbox operator's confirmation.

## Recover cases

If delivery fails or remains unconfirmed, an operator with restricted database access can review saved cases. Do not send another deposit or blindly retry an email whose outcome is unknown. Review cases with `status IN ('failed', 'unconfirmed')` and also `status = 'pending' AND created_at < now() - interval '15 minutes'`. Retrieve the report only in the restricted operator environment, determine an independently verified response channel, and record manual follow-up according to the retention runbook below. Webhook errors return 503 so Resend can retry; a missing signing secret means no callback is processed and pending cases become unconfirmed when the user checks status.

The browser stores only the private case-status token locally for reloads, not the report. The database stores the report for manual recovery; follow the approved retention and deletion procedure below.

## Approved retention runbook

Retention is an operator-reviewed lifecycle separate from delivery status. A case starts open with fund review unreviewed, regardless of whether delivery is pending, delivered, failed, or unconfirmed. Closing or reopening a case does not change its API delivery status. Deleted cases are no longer available through the case-status API and return `404`.

Use the restricted operator CLI only; there are no public retention endpoints and no automatic cleanup schedule. No case is deleted unless an operator explicitly runs cleanup with its confirmation flag.

### Review and close cases

Preview is the default, including when the command is run with no arguments:

```sh
pnpm --filter @workspace/api-server support:retention
pnpm --filter @workspace/api-server support:retention -- preview
```

To explicitly close a reviewed case, select a closure outcome and record the fund review:

```sh
pnpm --filter @workspace/api-server support:retention -- close --case-id ID --outcome resolved --fund-review resolved --confirm-reviewed
pnpm --filter @workspace/api-server support:retention -- close --case-id ID --outcome resolved --fund-review non-fund --confirm-reviewed
pnpm --filter @workspace/api-server support:retention -- close --case-id ID --outcome expired --fund-review non-fund --confirm-reviewed
```

An expired outcome is allowed only for a case reviewed as non-fund-related. A fund-related case must not be closed as expired. Reopen a case or set/remove a reviewed hold explicitly:

```sh
pnpm --filter @workspace/api-server support:retention -- reopen --case-id ID --confirm-reviewed
pnpm --filter @workspace/api-server support:retention -- hold --case-id ID --enabled true --confirm-reviewed
pnpm --filter @workspace/api-server support:retention -- hold --case-id ID --enabled false --confirm-reviewed
```

### Eligibility and preview

Resolved and expired cases are retained for 90 full days after operator closure. A case is eligible only when both `closedAt` and `updatedAt` are older than the 90-day cutoff, there is no linked delivery event within the last 90 days, it is not held, and any fund-related matter has been reviewed as resolved. Fund-unresolved cases are never deleted. Expired cases are eligible only when marked non-fund.

Orphan delivery events are retained for 30 full days. An event is eligible only when it is older than the 30-day cutoff and has no matching case. Orphan cleanup is globally blocked if any open case has no `providerMessageId`, because its unknown link may refer to an event that otherwise appears orphaned.

Preview and cleanup accept an optional `--limit 1..1000`; the default is 100. Preview and dry-run output contain aggregate counts and cutoffs only—never report content, email addresses, tokens, or IDs. Use preview to review the proposed aggregate scope before considering deletion.

### Explicit cleanup

Deletion is irreversible. Before proceeding, review all operator holds and the backup/recovery retention window. Do not export report content. Run cleanup only after the authorized operator has reviewed the preview and explicitly approved deletion:

```sh
pnpm --filter @workspace/api-server support:retention -- cleanup --confirm-delete-support-reports
pnpm --filter @workspace/api-server support:retention -- cleanup --limit 250 --confirm-delete-support-reports
```

Cleanup rechecks eligibility inside a transaction and locks `support_cases` before `support_delivery_events` using `SHARE ROW EXCLUSIVE` locks. Each batch removes at most the selected limit of cases and orphan events (100 of each by default, up to 1,000 of each); linked events are removed atomically with their case. Cleanup reports aggregate deletion counts only. Locks time out after five seconds and individual statements after 30 seconds; any failure rolls back the entire batch. These brief locks can delay support writes, so run bounded batches during a quiet period and review a fresh preview between batches.

Record the target database/environment, aggregate counts, and operator approval in the restricted operator ledger. Never record or export report content, email, tokens, or case/event IDs in that ledger. The runbook is manual and restricted: do not expose it through public endpoints or schedule it automatically.