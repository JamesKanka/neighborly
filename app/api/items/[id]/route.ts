import { NextRequest } from "next/server";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { getUserNeighborhood, isUserInItemNeighborhood } from "@/lib/neighborhood";
import { serializeHolderView, serializeOwnerView, serializePublicItem } from "@/lib/privacy";
import { findNextEligibleWaitlistUser } from "@/lib/transfers";
import { itemUpdateSchema } from "@/lib/validators";
import type { DbItem, DbTransfer, DbUser } from "@/lib/types";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const itemResult = await query<
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
       WHERE i.id = $1
       LIMIT 1`,
      [id]
    );

    const item = itemResult.rows[0];
    if (!item) {
      return notFound("Item not found");
    }

    if (user && !isUserInItemNeighborhood(user, item)) {
      return notFound("Item not found");
    }

    if (user && item.owner_id === user.id) {
      const holder = item.current_holder_id
        ? (
            await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [item.current_holder_id])
          ).rows[0] ?? null
        : null;

      const transfers = (
        await query<DbTransfer>(
          `SELECT * FROM transfers WHERE item_id = $1 ORDER BY initiated_at DESC`,
          [item.id]
        )
      ).rows;

      return ok({ item: serializeOwnerView(item, holder, transfers), role: "owner" });
    }

    if (user && item.current_holder_id === user.id) {
      const nextRecipient = item.owner_requested_return_at
        ? (
            await query<DbUser>(
              `SELECT * FROM users WHERE id = $1 LIMIT 1`,
              [item.owner_id]
            )
          ).rows[0] ?? null
        : await findNextEligibleWaitlistUser(item.id);
      const owner = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [item.owner_id])).rows[0] ?? null;
      return ok({
        item: serializeHolderView(item, nextRecipient),
        role: "holder",
        owner_contact: owner
          ? {
              id: owner.id,
              display_name: owner.display_name,
              email: owner.email,
              phone: owner.phone,
              tip_url: owner.tip_url,
              tips_enabled: owner.tips_enabled
            }
          : null
      });
    }

    return ok({ item: serializePublicItem(item), role: "public" });
  } catch (error) {
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id]);
    const item = existing.rows[0];

    if (!item) {
      return notFound("Item not found");
    }

    if (item.owner_id !== user.id) {
      return forbidden();
    }

    if (!isUserInItemNeighborhood(user, item)) {
      return forbidden("This item is outside your neighborhood");
    }

    const body = await request.json();
    const parsed = itemUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.flatten().formErrors.join(", ") || "Invalid payload");
    }

    const requestedNeighborhood = parsed.data.pickup_area;
    if (requestedNeighborhood && requestedNeighborhood !== getUserNeighborhood(user)) {
      return forbidden("You can only list items in your neighborhood");
    }

    const normalizedData: Record<string, unknown> = { ...parsed.data };
    if (typeof normalizedData.photo_data_url === "string" && normalizedData.photo_data_url.length > 0) {
      normalizedData.photo_url = normalizedData.photo_data_url;
    }
    delete normalizedData.photo_data_url;

    if (normalizedData.photo_url === "") {
      normalizedData.photo_url = null;
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(normalizedData)) {
      if (value === undefined) {
        continue;
      }

      if ((item as unknown as Record<string, unknown>)[key] === value) {
        continue;
      }

      values.push(value);
      fields.push(`${key} = $${values.length}`);
    }

    if (!fields.length) {
      return badRequest("No fields to update");
    }

    values.push(id);
    const updated = await query<DbItem>(
      `UPDATE items
       SET ${fields.join(", ")}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    return ok({ item: updated.rows[0] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
