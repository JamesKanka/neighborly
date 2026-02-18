import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import type { DbItem, DbWaitlistEntry } from "@/lib/types";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const entry = await query<DbWaitlistEntry>(
      `UPDATE waitlist_entries
       SET status = 'removed'
       WHERE item_id = $1 AND user_id = $2 AND status = 'waiting'
       RETURNING *`,
      [id, user.id]
    );

    if (!entry.rows[0]) {
      return notFound("No active waitlist entry");
    }

    return ok({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
