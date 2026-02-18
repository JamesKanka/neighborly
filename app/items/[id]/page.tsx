import { DirectGoogleSignIn } from "@/components/direct-google-signin";
import { HolderActions } from "@/components/holder-actions";
import { JoinWaitlistButton } from "@/components/join-waitlist-button";
import { ManualTransferControl } from "@/components/manual-transfer-control";
import { OwnerActions } from "@/components/owner-actions";
import { OwnerWaitlistActions } from "@/components/owner-waitlist-actions";
import { ShareActions } from "@/components/share-actions";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { createItemTagToken } from "@/lib/item-tag-link";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import { findNextEligibleWaitlistUser } from "@/lib/transfers";
import type { DbItem, DbTransfer } from "@/lib/types";

function formatItemStatus(status: DbItem["status"]) {
  if (status === "checked_out") {
    return "checked out";
  }
  if (status === "passing") {
    return "passing";
  }
  if (status === "returning") {
    return "returning";
  }
  return status.replace("_", " ");
}

function formatTransferType(type: DbTransfer["type"]) {
  if (type === "checkout") {
    return "Checkout";
  }
  if (type === "pass") {
    return "Pass";
  }
  if (type === "return") {
    return "Return";
  }
  return "Create";
}

function formatTransferStatus(status: DbTransfer["status"]) {
  if (status === "pending_accept") {
    return "Pending";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  return "Expired";
}

function formatHeldDuration(days: number) {
  if (days < 1) {
    return "<1 day";
  }
  if (days < 10) {
    return `${days.toFixed(1)} days`;
  }
  return `${Math.round(days)} days`;
}

function formatAverageCheckoutDuration(hoursText: string | null | undefined) {
  const hours = Number(hoursText ?? "0");
  if (!Number.isFinite(hours) || hours <= 0) {
    return null;
  }
  const days = hours / 24;
  if (days < 1) {
    return "<1 day";
  }
  if (days < 10) {
    return `${days.toFixed(1)} days`;
  }
  return `${Math.round(days)} days`;
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;

  const itemResult = await query<
    DbItem & {
      owner_display_name: string | null;
      owner_email: string;
      owner_phone: string | null;
      owner_tips_enabled: boolean;
      owner_tip_url: string | null;
      waitlist_count: string;
      avg_item_rating: string | null;
      checkout_count: string;
    }
  >(
    `SELECT
      i.*,
      u.display_name AS owner_display_name,
      u.email AS owner_email,
      u.phone AS owner_phone,
      u.tips_enabled AS owner_tips_enabled,
      u.tip_url AS owner_tip_url,
      (
        SELECT COUNT(*)::text
        FROM waitlist_entries w
        WHERE w.item_id = i.id AND w.status = 'waiting'
      ) AS waitlist_count,
      (
        SELECT ROUND(AVG(r.score)::numeric, 2)::text
        FROM ratings r
        WHERE r.item_id = i.id AND r.rating_type = 'item'
      ) AS avg_item_rating,
      (
        SELECT COUNT(*)::text
        FROM transfers t
        WHERE t.item_id = i.id
          AND t.status = 'completed'
          AND t.type IN ('checkout', 'pass')
      ) AS checkout_count
     FROM items i
     JOIN users u ON u.id = i.owner_id
     WHERE i.id = $1
     LIMIT 1`,
    [id]
  );

  const item = itemResult.rows[0];
  if (!item) {
    return (
      <div className="card">
        <p>Item not found.</p>
      </div>
    );
  }

  if (user && !isUserInItemNeighborhood(user, item)) {
    return (
      <div className="card">
        <p>Item not found.</p>
      </div>
    );
  }

  const isOwner = Boolean(user && item.owner_id === user.id);
  const isHolder = Boolean(user && item.current_holder_id === user.id);

  const waitlist = isOwner
    ? (
        await query<{
          id: string;
          user_id: string;
          display_name: string | null;
          created_at: string;
          phone: string | null;
          email: string;
          status: "waiting" | "fulfilled";
        }>(
          `WITH latest AS (
             SELECT w.*,
                    ROW_NUMBER() OVER (PARTITION BY w.user_id ORDER BY w.created_at DESC) AS row_num
             FROM waitlist_entries w
             WHERE w.item_id = $1 AND w.status IN ('waiting', 'fulfilled')
           )
           SELECT l.id, l.user_id, l.status, u.display_name, l.created_at, u.phone, u.email
           FROM latest l
           JOIN users u ON u.id = l.user_id
           WHERE l.row_num = 1
           ORDER BY
             CASE l.status WHEN 'waiting' THEN 0 ELSE 1 END,
             COALESCE(l.position, 2147483647),
             l.created_at ASC`,
          [item.id]
        )
      ).rows
    : [];

  const pendingCheckoutOffers = isOwner
    ? (
        await query<{ transfer_id: string; to_user_id: string; initiated_at: string }>(
          `SELECT id AS transfer_id, to_user_id, initiated_at
           FROM transfers
           WHERE item_id = $1
             AND type = 'checkout'
             AND status = 'pending_accept'
           ORDER BY initiated_at DESC`,
          [item.id]
        )
      ).rows
    : [];

  const pendingReturnCount = isOwner
    ? (
        await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM transfers
           WHERE item_id = $1 AND type = 'return' AND status = 'pending_accept'`,
          [item.id]
        )
      ).rows[0]
    : { count: "0" };

  const nextRecipient = isHolder
    ? item.owner_requested_return_at
      ? {
          id: item.owner_id,
          display_name: item.owner_display_name,
          email: item.owner_email,
          phone: item.owner_phone
        }
      : await findNextEligibleWaitlistUser(item.id)
    : null;
  const pendingPassTransfer = isHolder
    ? (
        await query<{
          transfer_id: string;
          to_display_name: string | null;
          to_email: string | null;
          to_phone: string | null;
        }>(
          `SELECT
             t.id AS transfer_id,
             u.display_name AS to_display_name,
             u.email AS to_email,
             u.phone AS to_phone
           FROM transfers t
           LEFT JOIN users u ON u.id = t.to_user_id
           WHERE t.item_id = $1
             AND t.type = 'pass'
             AND t.status = 'pending_accept'
             AND t.from_user_id = $2
           ORDER BY t.initiated_at DESC
           LIMIT 1`,
          [item.id, user!.id]
        )
      ).rows[0] ?? null
    : null;
  const pendingReturnTransfer = isHolder
    ? (
        await query<{ transfer_id: string }>(
          `SELECT id AS transfer_id
           FROM transfers
           WHERE item_id = $1
             AND type = 'return'
             AND status = 'pending_accept'
           ORDER BY initiated_at DESC
           LIMIT 1`,
          [item.id]
        )
      ).rows[0] ?? null
    : null;
  const currentHolder =
    isOwner && item.current_holder_id
      ? (
          await query<{ id: string; display_name: string | null; email: string; phone: string | null }>(
            `SELECT id, display_name, email, phone
             FROM users
             WHERE id = $1
             LIMIT 1`,
            [item.current_holder_id]
          )
        ).rows[0] ?? null
      : null;

  const transfers = isOwner
    ? (
        await query<DbTransfer & { from_name: string | null; to_name: string | null }>(
          `SELECT t.*, fu.display_name AS from_name, tu.display_name AS to_name
           FROM transfers t
           LEFT JOIN users fu ON fu.id = t.from_user_id
           LEFT JOIN users tu ON tu.id = t.to_user_id
           WHERE t.item_id = $1
           ORDER BY t.initiated_at DESC`,
          [item.id]
        )
      ).rows
    : [];

  const averageCheckout = (
    await query<{ avg_hours: string | null }>(
      `WITH handoffs AS (
         SELECT
           t.accepted_at,
           (
             SELECT t2.accepted_at
             FROM transfers t2
             WHERE t2.item_id = t.item_id
               AND t2.status = 'completed'
               AND t2.accepted_at > t.accepted_at
             ORDER BY t2.accepted_at ASC
             LIMIT 1
           ) AS next_accepted
         FROM transfers t
         WHERE t.item_id = $1
           AND t.status = 'completed'
           AND t.type IN ('checkout', 'pass')
           AND t.accepted_at IS NOT NULL
       )
       SELECT ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(next_accepted, now()) - accepted_at)) / 3600.0)::numeric, 2)::text AS avg_hours
       FROM handoffs`,
      [item.id]
    )
  ).rows[0]?.avg_hours;
  const averageCheckoutDuration = formatAverageCheckoutDuration(averageCheckout);
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const itemTagToken = isOwner ? createItemTagToken(item.id, item.item_tag_token_version) : null;
  const itemTagLink = itemTagToken
    ? `${baseUrl}/items/${item.id}/tag?token=${encodeURIComponent(itemTagToken)}`
    : null;
  const itemTagQrCodeUrl = isOwner ? item.item_tag_qr_code_url : null;

  const latestCheckoutAcceptedAt = (
    await query<{ accepted_at: string | null }>(
      `SELECT accepted_at
       FROM transfers
       WHERE item_id = $1
         AND status = 'completed'
         AND type IN ('checkout', 'pass')
         AND accepted_at IS NOT NULL
       ORDER BY accepted_at DESC
       LIMIT 1`,
      [item.id]
    )
  ).rows[0]?.accepted_at;

  const dueAt =
    ["checked_out", "passing", "returning"].includes(item.status) && latestCheckoutAcceptedAt
      ? new Date(new Date(latestCheckoutAcceptedAt).getTime() + item.borrow_duration_days * 24 * 3600 * 1000)
      : null;

  const currentHeldDays =
    currentHolder && latestCheckoutAcceptedAt
      ? (Date.now() - new Date(latestCheckoutAcceptedAt).getTime()) / (24 * 3600 * 1000)
      : null;

  const holdDaysByTransferId = new Map<string, number>();
  const completedCustodyTimeline = transfers
    .filter(
      (transfer) =>
        transfer.status === "completed" &&
        Boolean(transfer.accepted_at) &&
        (transfer.type === "checkout" || transfer.type === "pass" || transfer.type === "return")
    )
    .sort((a, b) => new Date(a.accepted_at as string).getTime() - new Date(b.accepted_at as string).getTime());

  for (let i = 0; i < completedCustodyTimeline.length; i += 1) {
    const transfer = completedCustodyTimeline[i];
    if (transfer.type !== "checkout" && transfer.type !== "pass") {
      continue;
    }

    const start = new Date(transfer.accepted_at as string).getTime();
    let end = Date.now();

    for (let j = i + 1; j < completedCustodyTimeline.length; j += 1) {
      const next = completedCustodyTimeline[j];
      if ((next.type === "pass" || next.type === "return") && next.from_user_id === transfer.to_user_id) {
        end = new Date(next.accepted_at as string).getTime();
        break;
      }
    }

    holdDaysByTransferId.set(transfer.id, Math.max(0, (end - start) / (24 * 3600 * 1000)));
  }

  return (
    <div className="grid">
      <div className="card grid">
        {item.photo_url ? <img src={item.photo_url} alt={`${item.title} photo`} className="item-photo" /> : null}
        <div className="row between">
          <h1>{item.title}</h1>
          <span className={`meta-badge status-${item.status}`}>{formatItemStatus(item.status)}</span>
        </div>
        <p className="subtitle">{item.description}</p>
        <div className="row">
          <span className="meta-badge">Category: {item.category}</span>
          <span className="meta-badge">Waitlist: {item.waitlist_count}</span>
          <span className="meta-badge">Borrow window: {item.borrow_duration_days}d</span>
          <span className="meta-badge">Checkouts: {item.checkout_count}</span>
          {item.avg_item_rating ? <span className="meta-badge">Rating: {item.avg_item_rating}</span> : null}
        </div>
        {averageCheckoutDuration ? <p className="meta">Average checkout duration: {averageCheckoutDuration}</p> : null}
        {dueAt ? <p className="meta">Current due date: {dueAt.toLocaleString()}</p> : null}
        {item.owner_requested_return_at ? (
          <p className="meta text-danger">Owner requested return at {new Date(item.owner_requested_return_at).toLocaleString()}.</p>
        ) : null}
        <ShareActions
          itemId={item.id}
          qrCodeUrl={item.qr_code_url}
          itemTagLink={itemTagLink}
          itemTagQrCodeUrl={itemTagQrCodeUrl}
          inline
        />
        {item.owner_tips_enabled && item.owner_tip_url ? (
          <a href={item.owner_tip_url} className="tip-link" target="_blank" rel="noreferrer">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2c-3.7 0-6.7 3-6.7 6.7 0 2.6 1.4 4.8 3.5 5.9v1.7h6.4v-1.7c2.1-1.1 3.5-3.3 3.5-5.9C18.7 5 15.7 2 12 2zm-2.1 17.3h4.2v1.2c0 .8-.7 1.5-1.5 1.5h-1.2c-.8 0-1.5-.7-1.5-1.5v-1.2z"
                fill="currentColor"
              />
            </svg>
            <span>Donate to Owner</span>
          </a>
        ) : null}
      </div>

      {isOwner ? (
        <>
          <OwnerActions
            itemId={item.id}
            hasPendingReturn={pendingReturnCount.count !== "0"}
            hasCurrentHolder={Boolean(item.current_holder_id)}
            itemStatus={item.status}
            initialTitle={item.title}
            initialDescription={item.description}
            initialCategory={item.category}
            initialBorrowDurationDays={item.borrow_duration_days}
            initialPhotoUrl={item.photo_url}
          />
          <OwnerWaitlistActions itemId={item.id} entries={waitlist} pendingOffers={pendingCheckoutOffers} />
          <div className="card grid">
            <div className="history-head">
              <h3>Transfer History</h3>
              <ManualTransferControl itemId={item.id} />
            </div>
            {currentHolder ? (
              <div className="history-current-holder">
                <div className="row between">
                  <strong>Current holder: {currentHolder.display_name ?? currentHolder.email}</strong>
                  <span className={`meta-badge status-${item.status}`}>{formatItemStatus(item.status)}</span>
                </div>
                <p className="meta">
                  Contact: {currentHolder.email}
                  {currentHolder.phone ? ` | ${currentHolder.phone}` : ""}
                </p>
                {currentHeldDays !== null ? (
                  <p className="meta">Held for {formatHeldDuration(currentHeldDays)} so far</p>
                ) : null}
              </div>
            ) : null}
            <div className="history-list">
              {transfers.map((transfer) => (
                <div key={transfer.id} className="history-row">
                  <div className="row between">
                    <strong>{formatTransferType(transfer.type)}</strong>
                    <span className={`meta-badge transfer-${transfer.status}`}>
                      {transfer.status === "completed" &&
                      (transfer.type === "checkout" || transfer.type === "pass") &&
                      holdDaysByTransferId.get(transfer.id) !== undefined
                        ? `Held ${formatHeldDuration(holdDaysByTransferId.get(transfer.id) as number)}`
                        : formatTransferStatus(transfer.status)}
                    </span>
                  </div>
                  <p className="meta">
                    From {transfer.from_name ?? "System"} to {transfer.to_name ?? "System"}
                  </p>
                  <p className="meta">
                    Started: {new Date(transfer.initiated_at).toLocaleString()}
                    {transfer.accepted_at ? ` | Confirmed: ${new Date(transfer.accepted_at).toLocaleString()}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {isHolder ? (
        <>
          <HolderActions
            itemId={item.id}
            nextRecipient={nextRecipient}
            pendingPassTransfer={pendingPassTransfer}
            pendingReturnTransfer={pendingReturnTransfer}
            ownerRequestedReturn={Boolean(item.owner_requested_return_at)}
            ownerName={item.owner_display_name}
            ownerEmail={item.owner_email}
            ownerPhone={item.owner_phone}
          />
        </>
      ) : null}

      {!isOwner && !isHolder && user ? <JoinWaitlistButton itemId={item.id} /> : null}

      {!user ? (
        <div className="card grid">
          <h3>Sign in to interact</h3>
          <p className="meta">You can browse items without an account, but requests and handoffs require sign-in.</p>
          <DirectGoogleSignIn callbackUrl={`/items/${item.id}`} label="Continue with Google" />
        </div>
      ) : null}
    </div>
  );
}
