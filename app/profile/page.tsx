import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserNeighborhood } from "@/lib/neighborhood";
import type { DbItem } from "@/lib/types";

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={done ? "checklist-item checklist-item-done" : "checklist-item checklist-item-todo"}>
      <span className="checklist-icon" aria-hidden="true">
        {done ? "✓" : "•"}
      </span>
      <span>{label}</span>
      <span className={done ? "checklist-state checklist-state-done" : "checklist-state checklist-state-todo"}>
        {done ? "Done" : "Needs update"}
      </span>
    </div>
  );
}

function formatHeldDuration(hours: number) {
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = hours / 24;
  if (days < 10) {
    return `${days.toFixed(1)}d`;
  }
  return `${Math.round(days)}d`;
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/profile")}`);
  }

  const borrowHistory = await query<{
    transfer_id: string;
    item_id: string;
    item_title: string;
    item_status: DbItem["status"];
    transfer_type: "checkout" | "pass";
    from_display_name: string | null;
    started_at: string;
    ended_at: string | null;
    held_hours: string;
    currently_holding: boolean;
  }>(
    `SELECT
      t.id AS transfer_id,
      t.item_id,
      i.title AS item_title,
      i.status AS item_status,
      t.type AS transfer_type,
      fu.display_name AS from_display_name,
      t.accepted_at AS started_at,
      end_t.ended_at,
      ROUND((EXTRACT(EPOCH FROM (COALESCE(end_t.ended_at, now()) - t.accepted_at)) / 3600.0)::numeric, 1)::text AS held_hours,
      (i.current_holder_id = $1 AND end_t.ended_at IS NULL) AS currently_holding
     FROM transfers t
     JOIN items i ON i.id = t.item_id
     LEFT JOIN users fu ON fu.id = t.from_user_id
     LEFT JOIN LATERAL (
       SELECT t2.accepted_at AS ended_at
       FROM transfers t2
       WHERE t2.item_id = t.item_id
         AND t2.status = 'completed'
         AND t2.accepted_at IS NOT NULL
         AND t2.accepted_at > t.accepted_at
         AND t2.type IN ('pass', 'return')
         AND t2.from_user_id = t.to_user_id
       ORDER BY t2.accepted_at ASC
       LIMIT 1
     ) end_t ON true
     WHERE t.to_user_id = $1
       AND t.status = 'completed'
       AND t.type IN ('checkout', 'pass')
       AND t.accepted_at IS NOT NULL
       AND i.pickup_area = $2
     ORDER BY t.accepted_at DESC
     LIMIT 60`,
    [user.id, getUserNeighborhood(user)]
  );
  const currentlyHoldingCount = borrowHistory.rows.filter((row) => row.currently_holding).length;
  const avgHeldHours =
    borrowHistory.rows.length > 0
      ? borrowHistory.rows.reduce((sum, row) => sum + Number(row.held_hours ?? "0"), 0) / borrowHistory.rows.length
      : 0;

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Account</p>
        <h1>Profile</h1>
        <p className="subtitle">Keep your details current so handoffs, offers, and return requests stay smooth.</p>
      </section>
      <div className="profile-layout">
        <ProfileForm
          initialName={user.display_name ?? ""}
          initialPhone={user.phone ?? ""}
          initialNeighborhood={user.neighborhood ?? ""}
          initialTipsEnabled={Boolean(user.tips_enabled)}
          initialTipUrl={user.tip_url ?? ""}
        />
        <aside className="card profile-side grid">
          <h3>Profile Checklist</h3>
          <div className="list-stack">
            <ChecklistItem done={Boolean(user.display_name)} label="Name on profile" />
            <ChecklistItem done={Boolean(user.phone)} label="Phone for handoffs" />
            <ChecklistItem done={Boolean(user.neighborhood ?? "Ladd Park")} label={`Neighborhood: ${user.neighborhood ?? "Ladd Park"}`} />
            <ChecklistItem done={Boolean(user.tips_enabled && user.tip_url)} label="Donation link configured" />
          </div>
        </aside>
      </div>
      <section className="card grid">
        <div className="history-head">
          <div className="grid">
            <h3>Borrow History</h3>
            <p className="meta">Every time you checked out or accepted an item handoff.</p>
          </div>
          <div className="row">
            <span className="meta-badge">{borrowHistory.rows.length} total</span>
            <span className="meta-badge">{currentlyHoldingCount} holding now</span>
            {borrowHistory.rows.length ? <span className="meta-badge">Avg hold {formatHeldDuration(avgHeldHours)}</span> : null}
          </div>
        </div>
        {borrowHistory.rows.length ? (
          <div className="history-list">
            {borrowHistory.rows.map((entry) => (
              <div key={entry.transfer_id} className="history-row">
                <div className="row between">
                  <Link href={`/items/${entry.item_id}`}>
                    <strong>{entry.item_title}</strong>
                  </Link>
                  <span className={`meta-badge ${entry.currently_holding ? "status-checked_out" : "transfer-completed"}`}>
                    {entry.currently_holding ? "Holding" : "Completed"}
                  </span>
                </div>
                <p className="meta">
                  {entry.transfer_type === "checkout"
                    ? "Checked out from owner"
                    : `Accepted handoff from ${entry.from_display_name ?? "Neighbor"}`}
                </p>
                <p className="meta">
                  Started {new Date(entry.started_at).toLocaleString()}
                  {entry.ended_at ? ` | Ended ${new Date(entry.ended_at).toLocaleString()}` : " | Still with you"}
                </p>
                <p className="meta">Held for {formatHeldDuration(Number(entry.held_hours ?? "0"))}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="list-row">
            <p className="meta">No borrowing history yet. Once you accept an item, it will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
