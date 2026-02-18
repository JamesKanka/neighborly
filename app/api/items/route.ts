import { NextRequest } from "next/server";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { badRequest, ok, serverError, unauthorized } from "@/lib/http";
import { createItemTagToken } from "@/lib/item-tag-link";
import { getUserNeighborhood } from "@/lib/neighborhood";
import { generateQrDataUrl } from "@/lib/qr";
import { serializePublicItem } from "@/lib/privacy";
import { itemCreateSchema } from "@/lib/validators";
import type { DbItem } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const category = request.nextUrl.searchParams.get("category")?.trim();
    const availability = request.nextUrl.searchParams.get("availability")?.trim();

    const clauses: string[] = [];
    const values: string[] = [];

    if (search) {
      values.push(`%${search}%`);
      clauses.push(`(i.title ILIKE $${values.length} OR i.description ILIKE $${values.length})`);
    }

    if (category) {
      values.push(category);
      clauses.push(`i.category = $${values.length}`);
    }

    if (availability === "available") {
      clauses.push(`i.status = 'available'`);
    }

    if (user) {
      values.push(getUserNeighborhood(user));
      clauses.push(`i.pickup_area = $${values.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query<
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
       ORDER BY i.created_at DESC`,
      values
    );

    return ok({ items: result.rows.map(serializePublicItem) });
  } catch (error) {
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const userNeighborhood = getUserNeighborhood(user);
    const body = await request.json();
    const parsed = itemCreateSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten().formErrors.join(", ") || "Invalid payload");
    }

    const insert = await query<DbItem>(
      `INSERT INTO items (owner_id, title, description, category, pickup_area, borrow_duration_days, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        user.id,
        parsed.data.title,
        parsed.data.description,
        parsed.data.category,
        userNeighborhood,
        parsed.data.borrow_duration_days ?? 7,
        parsed.data.photo_data_url || parsed.data.photo_url || null
      ]
    );

    const item = insert.rows[0];
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const itemUrl = `${baseUrl}/items/${item.id}`;
    const itemTagToken = createItemTagToken(item.id, item.item_tag_token_version);
    const itemTagUrl = `${baseUrl}/items/${item.id}/tag?token=${encodeURIComponent(itemTagToken)}`;
    const qrCodeUrl = await generateQrDataUrl(itemUrl);
    const itemTagQrCodeUrl = await generateQrDataUrl(itemTagUrl);

    const updated = await query<DbItem>(
      `UPDATE items
       SET qr_code_url = $1, item_tag_qr_code_url = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [qrCodeUrl, itemTagQrCodeUrl, item.id]
    );

    await query(
      `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, accepted_at)
       VALUES ($1, NULL, $2, 'create', 'completed', now())`,
      [item.id, user.id]
    );

    return ok({ item: updated.rows[0], item_url: itemUrl }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
