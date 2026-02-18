# Neighborly — Technical Specification (MVP)

## Architecture
- Framework: Next.js App Router (mobile-first UI + server routes).
- Auth: Google OAuth with server session checks.
- Database: Postgres with row-level security (recommended with Supabase).
- Files: object storage for item photos and generated QR images.
- Email: transactional provider for handoff acceptance and return confirmation.

## Domain Invariants
- Every custody change creates a `transfers` record.
- `items.current_holder_id` and `items.status` reflect latest completed transfer.
- A transfer with status `pending_accept` does not change holder/state.
- Handoff tokens are hashed at rest, single-use, and invalid after expiry.
- One active waitlist entry per `(item_id, user_id)`.

## State Model
- Item statuses: `available`, `checked_out`, `inactive`.
- Waitlist statuses: `waiting`, `skipped`, `fulfilled`, `removed`.
- Transfer statuses: `pending_accept`, `completed`, `cancelled`, `expired`.

## Authorization Matrix
- Public logged-in user:
  - Read non-PII item list/detail.
  - Join/leave own waitlist entry.
- Owner:
  - CRUD item, manage waitlist, initiate checkout.
  - View full transfer history + current holder contact.
- Current holder:
  - Initiate pass and return.
  - View next eligible recipient contact only.

## API Contract Notes

### `GET /api/items`
Returns non-PII fields only:
- `id`, `title`, `description`, `category`, `pickup_area`, `status`, `photo_urls`, `owner_display_name` (optional pseudonymized).

### `GET /api/items/:id`
- Public response omits all borrower/contact/history PII.
- If requester is owner, include holder contact and full history.
- If requester is current holder, include only next-up recipient contact preview.

### `POST /api/items/:id/waitlist`
- Requires profile completeness (`display_name`, `phone`).
- Reject if active waitlist entry already exists.

### `POST /api/items/:id/checkout`
- Owner only.
- Input: `to_user_id`.
- Creates `transfers` row (`pending_accept`) + one-time token.
- Sends accept email to recipient.

### `POST /api/items/:id/pass`
- Current holder only.
- If `to_user_id` absent, server picks next eligible waiting entry.
- Creates `pending_accept` transfer + token + email.

### `POST /api/transfers/:transferId/accept`
- Validates token hash and expiry.
- Ensures transfer is still pending.
- In one transaction:
  - mark transfer completed,
  - set `accepted_at`,
  - update item holder/status,
  - mark recipient waitlist entry fulfilled if present,
  - invalidate token.

### `POST /api/items/:id/return`
- Current holder only.
- Creates pending return transfer to owner and notifies owner.

### `POST /api/items/:id/return/confirm`
- Owner only.
- Completes pending return and sets item available with no holder.

## Suggested Database Constraints
- `users.email` unique not null.
- `waitlist_entries` unique partial index on active entries:
  - unique `(item_id, user_id)` where status in (`waiting`).
- `items.owner_id` not null.
- `transfers.item_id` not null.
- Check constraints for enum-like status/type fields.

## Suggested SQL Indexes
- `items(owner_id)`
- `items(status, category)`
- `waitlist_entries(item_id, status, created_at)`
- `transfers(item_id, initiated_at desc)`
- `tokens(item_id, purpose, expires_at)`

## Transactional Flows

### Accept Handoff
- Lock transfer row (`FOR UPDATE`).
- Verify pending status and token validity.
- Lock item row.
- Apply transfer completion + item holder update atomically.

### Pass to Next
- Lock item.
- Select next waiting waitlist row ordered by position/created_at.
- Create pending transfer and token.

## Security Hardening
- Strip sensitive fields at serializer level in addition to DB policy checks.
- Use short-lived signed accept URLs; store only token hash.
- Add audit fields (`created_by`, `updated_by` optional).
- Apply rate limits on waitlist joins and token acceptance attempts.

## QR/NFC Behavior
- Generate QR PNG on item creation for canonical item URL.
- Scanning URL always resolves to item detail page.
- Server returns role-based data depending on current session.

## Failure Handling
- Expired token: show actionable error and re-offer flow for owner/holder.
- Pending transfer timeout job marks transfer `expired`.
- Email send failure: retain pending transfer with retry status in metadata.

## QA Checklist
- Privacy response snapshots per role for each endpoint.
- Waitlist ordering under concurrent joins.
- Duplicate waitlist protection.
- Token replay and expiry tests.
- Transfer acceptance concurrency tests.
- Owner/holder edge case when owner is also current holder.

## Delivery Plan
1. Bootstrap Next.js app + auth + DB schema migration.
2. Implement item CRUD and browse/detail serializers.
3. Implement waitlist APIs and UI actions.
4. Implement transfer engine (checkout/pass/return/accept).
5. Add QR generation + storage integration.
6. Add email notifications + retry path.
7. Harden authorization and add integration tests.
