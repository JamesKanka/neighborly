import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import { findNextEligibleWaitlistUser } from "@/lib/transfers";
import { waitlistJoinSchema } from "@/lib/validators";
import type { DbItem, DbWaitlistEntry } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];

    if (!item) {
      return notFound("Item not found");
    }

    if (!isUserInItemNeighborhood(user, item)) {
      return forbidden("Item is outside your neighborhood");
    }

    const parsed = waitlistJoinSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return badRequest("Invalid waitlist payload");
    }

    const displayName = parsed.data.display_name ?? user.display_name;
    const phone = parsed.data.phone ?? user.phone;

    if (!displayName || !phone) {
      return badRequest("Profile requires name and phone to join waitlist");
    }

    await query(`UPDATE users SET display_name = $1, phone = $2 WHERE id = $3`, [displayName, phone, user.id]);

    try {
      const entry = await query<DbWaitlistEntry>(
        `INSERT INTO waitlist_entries (item_id, user_id, status)
         VALUES ($1, $2, 'waiting')
         RETURNING *`,
        [id, user.id]
      );

      return ok({ entry: entry.rows[0] }, 201);
    } catch (error) {
      const isDuplicate =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505";

      if (isDuplicate) {
        return badRequest("Already on waitlist");
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];

    if (!item) {
      return notFound("Item not found");
    }

    if (!isUserInItemNeighborhood(user, item)) {
      return forbidden("Item is outside your neighborhood");
    }

    if (item.owner_id === user.id) {
      const entries = await query<
        DbWaitlistEntry & {
          email: string;
          display_name: string | null;
          phone: string | null;
          neighborhood: string | null;
        }
      >(
        `SELECT w.*, u.email, u.display_name, u.phone, u.neighborhood
         FROM waitlist_entries w
         JOIN users u ON u.id = w.user_id
         WHERE w.item_id = $1 AND w.status = 'waiting'
         ORDER BY COALESCE(w.position, 2147483647), w.created_at ASC`,
        [item.id]
      );

      return ok({ role: "owner", waitlist: entries.rows });
    }

    if (item.current_holder_id === user.id) {
      const next = item.owner_requested_return_at
        ? (
            await query<{ id: string; display_name: string | null; email: string; phone: string | null }>(
              `SELECT id, display_name, email, phone
               FROM users
               WHERE id = $1
               LIMIT 1`,
              [item.owner_id]
            )
          ).rows[0] ?? null
        : await findNextEligibleWaitlistUser(item.id);
      return ok({ role: "holder", next_up: next });
    }

    const mine = await query<DbWaitlistEntry>(
      `SELECT * FROM waitlist_entries WHERE item_id = $1 AND user_id = $2 AND status = 'waiting' LIMIT 1`,
      [item.id, user.id]
    );

    const myEntry = mine.rows[0];
    if (!myEntry) {
      return ok({ role: "public", on_waitlist: false, ahead_count: null });
    }

    const ahead = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM waitlist_entries
       WHERE item_id = $1
         AND status = 'waiting'
         AND (
           COALESCE(position, 2147483647) < COALESCE($2, 2147483647)
           OR (
             COALESCE(position, 2147483647) = COALESCE($2, 2147483647)
             AND created_at < $3
           )
         )`,
      [item.id, myEntry.position, myEntry.created_at]
    );

    return ok({
      role: "public",
      on_waitlist: true,
      ahead_count: Number(ahead.rows[0]?.count ?? "0")
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
