import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { DbItem } from "@/lib/types";

export default async function HoldingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/holding")}`);
  }

  const items = await query<
    DbItem & { owner_display_name: string | null; waitlist_count: string; checkout_count: string }
  >(
    `SELECT
      i.*,
      u.display_name AS owner_display_name,
      (
        SELECT COUNT(*)::text
        FROM waitlist_entries w
        WHERE w.item_id = i.id AND w.status = 'waiting'
      ) AS waitlist_count,
      (
        SELECT COUNT(*)::text
        FROM transfers t
        WHERE t.item_id = i.id
          AND t.status = 'completed'
          AND t.type IN ('checkout', 'pass')
      ) AS checkout_count
     FROM items i
     JOIN users u ON u.id = i.owner_id
     WHERE i.current_holder_id = $1
     ORDER BY i.updated_at DESC`,
    [user.id]
  );

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Custody Actions</p>
        <h1>Items I’m Holding</h1>
        <p className="subtitle">Pass items to the next person in line or return them to the owner.</p>
      </section>
      {items.rows.length ? (
        <div className="item-grid">
          {items.rows.map((item) => (
            <Link key={item.id} href={`/items/${item.id}`} className="card item-card grid">
              <div className="row between">
                <strong>{item.title}</strong>
                <span className={`meta-badge status-${item.status}`}>{item.status.replace("_", " ")}</span>
              </div>
              <p className="meta">{item.category}</p>
              <p className="meta">Owner: {item.owner_display_name ?? "Neighbor"} | Waitlist: {item.waitlist_count}</p>
              <p className="meta">
                Borrow window: {item.borrow_duration_days} day{item.borrow_duration_days === 1 ? "" : "s"} | Checked
                out {item.checkout_count} times
              </p>
              {item.owner_requested_return_at ? (
                <p className="meta text-danger">Owner requested return. Please return soon.</p>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty-state grid">
          <h3>Nothing currently checked out</h3>
          <p className="meta">When you accept a handoff, it will appear here.</p>
        </div>
      )}
    </div>
  );
}
