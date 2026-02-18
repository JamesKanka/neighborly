# Neighborly — Product Requirements Document (MVP)

## 1) Summary
Neighborly is a mobile-first neighborhood sharing app where residents can lend and borrow items. Each item has a unique URL and QR code (optionally linked to NFC) connecting the physical item to its digital record. Users can browse items, join waitlists, and transfer custody through validated acceptance handoffs.

## 2) Goals (MVP)
- Enable lending with a clear chain-of-custody (who had what, when).
- Make handoffs reliable using QR/NFC and receiver acceptance.
- Protect privacy with owner-only access to full borrower identity/history.
- Deliver fast mobile-first flows for scan-and-pass usage.

## 3) Non-goals (MVP)
- Payments, deposits, insurance, damage claims.
- Ratings and reviews.
- Verified neighborhood membership/invite code/address proof.
- SMS verification (collect phone now, verification later).

## 4) Core User Stories

### Accounts
1. As a user, I can sign in with Google.
2. As a user, I can set/update profile fields: name, phone, neighborhood.
3. As a user, I can browse without exposing full contact info publicly.

### Items
4. As an owner, I can create an item with info and photos.
5. As an owner, I receive a unique link and QR code after creation.
6. As a user, I can browse/search/filter by category.

### Waitlist / Requests
7. As a user, I can join a waitlist.
8. As a current holder, I can see who is next (limited info).
9. As an owner, I can view/manage full waitlist.

### Checkout / Pass / Return
10. As an owner, I can checkout to a selected user.
11. As a receiver, I must accept handoff to finalize transfer.
12. As a holder, I can pass to next and require acceptance.
13. As a holder, I can initiate return and owner confirms receipt.
14. As an owner, I can view full timestamped custody history.

## 5) Permissions & Privacy Rules

### Public (any logged-in user)
- Can browse item list and item detail.
- Can join waitlist.
- Can view: title, category, photos, description, general pickup area.
- Cannot view: exact address, borrower history, borrower contact info.

### Owner (item creator)
- Can view current holder identity/contact and full custody history.
- Can edit/deactivate item, manage waitlist, initiate checkout, reorder/override waitlist.

### Current holder
- Can view next waitlist recipient contact details for this item only.
- Can initiate pass to next and initiate return.

### Other waitlist members
- Can view only their own waitlist status (position optional).

### Data exposure principle
PII and borrower identity must only be returned to authorized actors (owner, and current holder for next-up recipient only).

## 6) Key Flows

### A) Create Item
1. User signs in with Google.
2. User creates item with title/category/description/photos/pickup area.
3. System generates item URL and QR PNG.
4. UI offers optional NFC-link guidance.

### B) Join Waitlist
1. Borrower opens item detail.
2. Borrower taps Join Waitlist.
3. Borrower confirms profile name/phone.
4. System creates waitlist entry with timestamp.

### C) Checkout (Owner -> Borrower)
1. Owner opens waitlist.
2. Owner selects a user (default next eligible).
3. Owner taps Offer/Checkout.
4. System creates pending transfer and sends acceptance link email.
5. Receiver accepts, transfer completes, holder updates.

### D) Pass to Next (Holder -> Waitlist)
1. Holder sees next-up user.
2. Holder taps Pass to Next.
3. System creates pending pass and emails accept link.
4. Receiver accepts, holder updates.

### E) Return (Holder -> Owner)
1. Holder taps Return to Owner.
2. System creates pending return and notifies owner.
3. Owner confirms receipt.
4. Item returns to available state.

## 7) MVP Screens
1. Auth: Google sign-in.
2. Browse: list, search, filters.
3. Item Detail: public info, status, role-based CTAs.
4. Add Item: create flow + QR output.
5. My Items: owner controls, waitlist, current holder, history.
6. Holding: items user currently holds, pass/return actions.
7. Profile: name, phone, neighborhood/pickup preference.

## 8) Data Model

### users
- id (uuid)
- email (unique, required)
- display_name
- phone (required in MVP collection)
- neighborhood (optional)
- created_at

### items
- id (uuid)
- owner_id (fk users.id)
- title
- description
- category
- pickup_area
- status (`available` | `checked_out` | `inactive`)
- current_holder_id (fk users.id, nullable)
- qr_code_url
- created_at
- updated_at

### waitlist_entries
- id (uuid)
- item_id (fk items.id)
- user_id (fk users.id)
- position (int, optional if derived)
- status (`waiting` | `skipped` | `fulfilled` | `removed`)
- created_at

### transfers
- id (uuid)
- item_id
- from_user_id (nullable)
- to_user_id (nullable)
- type (`create` | `checkout` | `pass` | `return`)
- status (`pending_accept` | `completed` | `cancelled` | `expired`)
- initiated_at
- accepted_at (nullable)
- metadata (jsonb optional)

### tokens
- id (uuid)
- item_id
- token_hash
- purpose (`item_view` | `handoff_accept`)
- expires_at (nullable)
- created_at

## 9) API Surface

### Items
- `POST /api/items`
- `GET /api/items`
- `GET /api/items/:id`
- `PATCH /api/items/:id`
- `POST /api/items/:id/deactivate`

### Waitlist
- `POST /api/items/:id/waitlist`
- `DELETE /api/items/:id/waitlist/me`
- `GET /api/items/:id/waitlist`

### Transfers
- `POST /api/items/:id/checkout`
- `POST /api/items/:id/pass`
- `POST /api/transfers/:transferId/accept`
- `POST /api/items/:id/return`
- `POST /api/items/:id/return/confirm`

### Notifications
Email events for acceptance links and return confirmation.

## 10) Acceptance Criteria
- Non-owner cannot access borrower identity/contact/history.
- Owner can access current holder + full transfer history.
- Holder can access only next recipient for handoff.
- Waitlist join creates one active entry per user/item.
- Pass chooses next eligible waiting user.
- Transfer completes only after acceptance.
- Tokens are single-use and expiration-aware.
- Item creation outputs shareable URL and QR image.

## 11) Edge Cases
- Pending transfer expiry leaves current holder unchanged.
- Owner/holder can skip next waitlist user.
- Owner can assign manually outside waitlist.
- Duplicate waitlist entries blocked.
- Owner can be holder; UI shows state clearly.
- Lost item handled by owner deactivation (MVP workaround).

## 12) Recommended Stack
- Next.js frontend + API routes/server actions.
- Google OAuth through NextAuth/Clerk/Supabase Auth.
- Postgres (Supabase recommended).
- Supabase Storage for images/QR assets.
- Resend for transactional email.
- Vercel hosting.

## 13) Milestones
1. Auth + profile + browse.
2. Item CRUD + QR generation.
3. Waitlist workflow.
4. Transfer workflow + email acceptance.
5. Permissions hardening + QA.
