import Link from "next/link";
import { BrowseControls } from "@/components/browse-controls";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserNeighborhood } from "@/lib/neighborhood";
import { serializePublicItem } from "@/lib/privacy";
import type { DbItem } from "@/lib/types";

type SortStatus = "newest" | "available_first" | "checked_out_first" | "inactive_first";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ search?: string; sort_status?: string }>;
}) {
  const user = await getCurrentUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const search = resolvedSearchParams?.search?.trim() ?? "";
  const sortStatus = (resolvedSearchParams?.sort_status as SortStatus | undefined) ?? "newest";

  const clauses: string[] = [];
  const values: string[] = [];

  if (search) {
    values.push(`%${search}%`);
    clauses.push(
      `(i.title ILIKE $${values.length} OR i.description ILIKE $${values.length} OR i.category ILIKE $${values.length})`
    );
  }

  if (user) {
    values.push(getUserNeighborhood(user));
    clauses.push(`i.pickup_area = $${values.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const statusOrder =
    sortStatus === "available_first"
      ? `CASE i.status WHEN 'available' THEN 0 WHEN 'checked_out' THEN 1 WHEN 'passing' THEN 2 WHEN 'returning' THEN 3 WHEN 'inactive' THEN 4 ELSE 5 END`
      : sortStatus === "checked_out_first"
        ? `CASE i.status WHEN 'checked_out' THEN 0 WHEN 'passing' THEN 1 WHEN 'returning' THEN 2 WHEN 'available' THEN 3 WHEN 'inactive' THEN 4 ELSE 5 END`
        : sortStatus === "inactive_first"
          ? `CASE i.status WHEN 'inactive' THEN 0 WHEN 'available' THEN 1 WHEN 'checked_out' THEN 2 WHEN 'passing' THEN 3 WHEN 'returning' THEN 4 ELSE 5 END`
          : "";
  const orderBy = statusOrder ? `${statusOrder}, i.created_at DESC` : "i.created_at DESC";

  const items = await query<
    DbItem & {
      owner_display_name: string | null;
      waitlist_count: string;
      avg_item_rating: string | null;
      checkout_count: string;
    }
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
     ${where}
     ORDER BY ${orderBy}`,
    values
  );

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Neighborly Network</p>
        <h1>Browse and borrow from nearby neighbors</h1>
        <p className="subtitle">
          Every handoff is tracked with acceptance, so each item has a clear custody trail.
        </p>
        <div className="row">
          <Link
            href={user ? "/items/new" : `/auth/signin?callbackUrl=${encodeURIComponent("/items/new")}`}
            className="button-link"
          >
            Add an Item
          </Link>
          <Link
            href={user ? "/my-items" : `/auth/signin?callbackUrl=${encodeURIComponent("/my-items")}`}
            className="button-link"
          >
            Manage My Items
          </Link>
          <span className="meta-badge">{items.rows.length} listings</span>
        </div>
        <BrowseControls initialSearch={search} initialSort={sortStatus} />
      </section>
      <div className="item-grid">
        {items.rows.map((item) => {
          const safe = serializePublicItem(item);
          const statusLabel = safe.status.replace("_", " ");
          const waitlistCount = Number(safe.waitlist_count ?? 0);
          return (
            <Link key={safe.id} href={`/items/${safe.id}`} className="card item-card grid">
              {safe.photo_url ? (
                <img src={safe.photo_url} alt={`${safe.title} photo`} className="item-photo" />
              ) : (
                <div className="item-photo item-photo-fallback" />
              )}
              <div className="row between">
                <strong>{safe.title}</strong>
                <span className={`meta-badge status-${safe.status}`}>{statusLabel}</span>
              </div>
              <p className="meta">
                {safe.category}
              </p>
              <p className="meta">
                Waitlist: {waitlistCount}
                {safe.avg_item_rating ? ` | Rating: ${safe.avg_item_rating}` : ""}
              </p>
              <p className="meta">Checked out: {safe.checkout_count} times</p>
              <p>{safe.description.slice(0, 118)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
