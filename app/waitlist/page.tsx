import Link from "next/link";
import { redirect } from "next/navigation";
import { LeaveWaitlistButton } from "@/components/leave-waitlist-button";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserNeighborhood } from "@/lib/neighborhood";
import type { DbItem } from "@/lib/types";

function describeAheadCount(aheadCount: number) {
  if (aheadCount <= 0) {
    return "You are up next";
  }
  if (aheadCount <= 2) {
    return "About 1-2 people ahead";
  }
  if (aheadCount <= 5) {
    return "About 3-5 people ahead";
  }
  return "5+ people ahead";
}

function formatEta(hours: number) {
  if (hours <= 0) {
    return "Up next";
  }
  if (hours < 24) {
    return `~${Math.ceil(hours)}h`;
  }
  const days = hours / 24;
  if (days < 10) {
    return `~${days.toFixed(1)}d`;
  }
  return `~${Math.round(days)}d`;
}

export default async function WaitlistPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/waitlist")}`);
  }

  const items = await query<{
    waitlist_entry_id: string;
    joined_at: string;
    ahead_count: string;
    waitlist_count: string;
    checkout_count: string;
    avg_hold_hours: string | null;
    item_id: string;
    item_title: string;
    item_category: string;
    item_status: DbItem["status"];
    item_photo_url: string | null;
    item_borrow_duration_days: number;
    owner_display_name: string | null;
  }>(
    `SELECT
      w.id AS waitlist_entry_id,
      w.created_at AS joined_at,
      (
        SELECT COUNT(*)::text
        FROM waitlist_entries w2
        WHERE w2.item_id = w.item_id
          AND w2.status = 'waiting'
          AND (
            COALESCE(w2.position, 2147483647) < COALESCE(w.position, 2147483647)
            OR (
              COALESCE(w2.position, 2147483647) = COALESCE(w.position, 2147483647)
              AND w2.created_at < w.created_at
            )
          )
      ) AS ahead_count,
      (
        SELECT COUNT(*)::text
        FROM waitlist_entries w3
        WHERE w3.item_id = w.item_id
          AND w3.status = 'waiting'
      ) AS waitlist_count,
      (
        SELECT COUNT(*)::text
        FROM transfers t
        WHERE t.item_id = i.id
          AND t.status = 'completed'
          AND t.type IN ('checkout', 'pass')
      ) AS checkout_count,
      (
        WITH handoffs AS (
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
          WHERE t.item_id = i.id
            AND t.status = 'completed'
            AND t.type IN ('checkout', 'pass')
            AND t.accepted_at IS NOT NULL
        )
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(next_accepted, now()) - accepted_at)) / 3600.0)::numeric, 1)::text
        FROM handoffs
      ) AS avg_hold_hours,
      i.id AS item_id,
      i.title AS item_title,
      i.category AS item_category,
      i.status AS item_status,
      i.photo_url AS item_photo_url,
      i.borrow_duration_days AS item_borrow_duration_days,
      u.display_name AS owner_display_name
     FROM waitlist_entries w
     JOIN items i ON i.id = w.item_id
     JOIN users u ON u.id = i.owner_id
     WHERE w.user_id = $1
       AND w.status = 'waiting'
       AND i.pickup_area = $2
     ORDER BY w.created_at ASC`,
    [user.id, getUserNeighborhood(user)]
  );

  const sortedItems = [...items.rows]
    .map((entry) => {
      const ahead = Number(entry.ahead_count ?? "0");
      const avgHoldHours = Number(entry.avg_hold_hours ?? `${entry.item_borrow_duration_days * 24}`);
      return {
        ...entry,
        ahead,
        avgHoldHours,
        etaHours: Math.max(0, ahead * avgHoldHours)
      };
    })
    .sort((a, b) => {
      if (a.ahead !== b.ahead) {
        return a.ahead - b.ahead;
      }
      if (a.etaHours !== b.etaHours) {
        return a.etaHours - b.etaHours;
      }
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Queue</p>
        <h1>My Waitlisted Items</h1>
        <p className="subtitle">Track where you are in line and leave any waitlist when plans change.</p>
        <span className="meta-badge">{sortedItems.length} active waitlist item{sortedItems.length === 1 ? "" : "s"}</span>
      </section>
      {sortedItems.length ? (
        <div className="item-grid">
          {sortedItems.map((entry) => {
            const aheadCount = entry.ahead;
            return (
              <div key={entry.waitlist_entry_id} className="card item-card grid">
                <Link href={`/items/${entry.item_id}`} className="grid waitlist-card-link">
                  {entry.item_photo_url ? (
                    <img src={entry.item_photo_url} alt={`${entry.item_title} photo`} className="item-photo" />
                  ) : (
                    <div className="item-photo item-photo-fallback" />
                  )}
                  <div className="row between">
                    <strong>{entry.item_title}</strong>
                    <span className={`meta-badge status-${entry.item_status}`}>{entry.item_status.replace("_", " ")}</span>
                  </div>
                </Link>
                <p className="meta">{entry.item_category}</p>
                <p className="meta">Owner: {entry.owner_display_name ?? "Neighbor"}</p>
                <div className="row">
                  <span className="meta-badge">{describeAheadCount(aheadCount)}</span>
                  <span className="meta-badge">Est. wait {formatEta(entry.etaHours)}</span>
                  <span className="meta-badge">Waitlist: {Number(entry.waitlist_count)}</span>
                </div>
                <p className="meta">
                  Joined {new Date(entry.joined_at).toLocaleString()} | Borrow window: {entry.item_borrow_duration_days}d |
                  Checked out {Number(entry.checkout_count)} times
                </p>
                <p className="meta">Avg hold time: {formatEta(entry.avgHoldHours)}</p>
                <LeaveWaitlistButton itemId={entry.item_id} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state grid">
          <h3>No active waitlists</h3>
          <p className="meta">Join an item waitlist from the item page and it will show up here.</p>
          <Link href="/" className="button-link">
            Browse Items
          </Link>
        </div>
      )}
    </div>
  );
}
