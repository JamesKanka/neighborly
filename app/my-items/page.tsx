import Link from "next/link";
import { redirect } from "next/navigation";
import { BrowseControls } from "@/components/browse-controls";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserNeighborhood } from "@/lib/neighborhood";
import type { DbItem } from "@/lib/types";

type SortStatus = "newest" | "available_first" | "checked_out_first" | "inactive_first";

export default async function MyItemsPage({
  searchParams
}: {
  searchParams?: Promise<{ sort_status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/my-items")}`);
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const sortStatus = (resolvedSearchParams?.sort_status as SortStatus | undefined) ?? "newest";
  const statusOrder =
    sortStatus === "available_first"
      ? `CASE i.status WHEN 'available' THEN 0 WHEN 'checked_out' THEN 1 WHEN 'passing' THEN 2 WHEN 'returning' THEN 3 WHEN 'inactive' THEN 4 ELSE 5 END`
      : sortStatus === "checked_out_first"
        ? `CASE i.status WHEN 'checked_out' THEN 0 WHEN 'passing' THEN 1 WHEN 'returning' THEN 2 WHEN 'available' THEN 3 WHEN 'inactive' THEN 4 ELSE 5 END`
        : sortStatus === "inactive_first"
          ? `CASE i.status WHEN 'inactive' THEN 0 WHEN 'available' THEN 1 WHEN 'checked_out' THEN 2 WHEN 'passing' THEN 3 WHEN 'returning' THEN 4 ELSE 5 END`
          : "";
  const orderBy = statusOrder ? `${statusOrder}, i.created_at DESC` : "i.created_at DESC";

  const items = await query<DbItem & { waitlist_count: string; checkout_count: string }>(
    `SELECT i.*,
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
     WHERE i.owner_id = $1 AND i.pickup_area = $2
     ORDER BY ${orderBy}`,
    [user.id, getUserNeighborhood(user)]
  );

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Owner View</p>
        <h1>My Items</h1>
        <p className="subtitle">Edit listings, run checkouts, and view full transfer history.</p>
        <div className="row">
          <Link href="/items/new" className="button-link">
            Add an Item
          </Link>
        </div>
        <BrowseControls initialSearch="" initialSort={sortStatus} showSearch={false} />
      </section>
      {items.rows.length ? (
        <div className="item-grid">
          {items.rows.map((item) => (
            <Link key={item.id} href={`/items/${item.id}`} className="card item-card grid">
              <div className="row between">
                <strong>{item.title}</strong>
                <span className={`meta-badge status-${item.status}`}>{item.status.replace("_", " ")}</span>
              </div>
              <p className="meta">
                {item.category} | waitlist {Number(item.waitlist_count)}
              </p>
              <p className="meta">Checked out {Number(item.checkout_count)} times</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty-state grid">
          <h3>No items yet</h3>
          <p className="meta">Create your first listing to start lending in your neighborhood.</p>
          <Link href="/items/new" className="button-link">
            Add an Item
          </Link>
        </div>
      )}
    </div>
  );
}
