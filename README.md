# Neighborly MVP

Mobile-first web app for neighborhood item lending with waitlists, QR/NFC item links, and validated handoffs.

## Implemented
- Google auth wiring with NextAuth (`/api/auth/[...nextauth]`).
- Postgres schema migrations in `db/migrations/001_init.sql` and `db/migrations/002_feature_upgrades.sql`.
- Role-based API routes:
  - items browse/create/detail/edit/deactivate
  - owner request return + holder message owner
  - ratings for items and people with eligibility checks
  - waitlist join/leave/view
  - transfers checkout/pass/accept/skip/return/confirm
  - profile update
- Privacy enforcement in serializers and endpoint guards.
- Transfer token hashing and single-use acceptance.
- QR generation for each created item.
- Mobile-first pages:
  - browse, item detail, add item, my items, holding, profile, transfer accept

## Stack
- Next.js App Router + TypeScript
- Postgres (`pg`)
- NextAuth (Google provider)
- Zod validation

## Local Setup
1. Copy env file:
   - `cp .env.example .env.local`
2. Fill required values:
   - `DATABASE_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `APP_BASE_URL`
   - `EMAIL_FROM`
   - `POSTMARK_SERVER_TOKEN`
   - `POSTMARK_MESSAGE_STREAM` (optional, defaults to `outbound`)
3. Install dependencies:
   - `npm install`
4. Start dev server:
   - `npm run dev`
   - This now runs `db:init:dev` automatically before dev startup.
   - `db:init:dev` uses Drizzle to push schema changes to your local DB when `DATABASE_URL` is set.
   - It is skipped in `production` and `CI`.
5. Optional manual DB commands:
   - `npm run db:push` (sync schema directly)
   - `npm run db:generate` (generate SQL migrations)
   - `npm run db:migrate` (run generated migrations)
   - `npm run db:studio` (open Drizzle Studio)

## Generate Dummy Data
- Run:
  - `npm run seed`
- Optional environment variables:
  - `SEED_OWNER_EMAIL=you@example.com` to ensure seeded ownership centers around that account.
  - `SEED_USERS=12` to control additional generated users.
  - `SEED_ITEMS=16` to control generated items.
- The script creates:
  - users with realistic profiles,
  - items across `available`, `checked_out`, and `inactive`,
  - waitlists with mixed statuses,
  - transfer history (including some `pending_accept` handoffs + tokens).

## Repair Existing QR Data
- If old rows have non-image `qr_code_url` values:
  - `npm run repair:qr`

## Notes
- Email delivery is wired through Postmark in `src/lib/email.ts`.
- QR code is currently stored as a data URL on `items.qr_code_url`.
- Acceptance links are generated as `/transfers/:id/accept?token=...`.
- Pass handoff emails include both Accept and Skip links and expire in 48 hours.

## API Summary
- `POST /api/items`
- `GET /api/items`
- `GET /api/items/:id`
- `PATCH /api/items/:id`
- `POST /api/items/:id/deactivate`
- `POST /api/items/:id/waitlist`
- `GET /api/items/:id/waitlist`
- `DELETE /api/items/:id/waitlist/me`
- `POST /api/items/:id/checkout`
- `POST /api/items/:id/pass`
- `POST /api/items/:id/request-return`
- `POST /api/items/:id/message-owner`
- `GET /api/items/:id/ratings`
- `POST /api/items/:id/ratings`
- `POST /api/transfers/:transferId/accept`
- `POST /api/transfers/:transferId/skip`
- `POST /api/items/:id/return`
- `POST /api/items/:id/return/confirm`
- `PATCH /api/profile`
