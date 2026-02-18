import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import type { DbItem, DbTransfer } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { transfer_id?: string };
    const transferId = typeof body.transfer_id === "string" ? body.transfer_id : null;

    const cancelledTransfer = await withTransaction(async (client) => {
      const item = (await client.query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1 FOR UPDATE`, [id])).rows[0];
      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

      if (item.current_holder_id !== user.id) {
        throw new Error("FORBIDDEN");
      }

      if (!isUserInItemNeighborhood(user, item)) {
        throw new Error("OUTSIDE_NEIGHBORHOOD");
      }

      const transfer = transferId
        ? (
            await client.query<DbTransfer>(
              `SELECT *
               FROM transfers
               WHERE id = $1
                 AND item_id = $2
                 AND type = 'pass'
                 AND status = 'pending_accept'
                 AND from_user_id = $3
               LIMIT 1
               FOR UPDATE`,
              [transferId, item.id, user.id]
            )
          ).rows[0]
        : (
            await client.query<DbTransfer>(
              `SELECT *
               FROM transfers
               WHERE item_id = $1
                 AND type = 'pass'
                 AND status = 'pending_accept'
                 AND from_user_id = $2
               ORDER BY initiated_at DESC
               LIMIT 1
               FOR UPDATE`,
              [item.id, user.id]
            )
          ).rows[0];

      if (!transfer) {
        throw new Error("PASS_NOT_PENDING");
      }

      await client.query(`UPDATE transfers SET status = 'cancelled' WHERE id = $1`, [transfer.id]);
      await client.query(
        `UPDATE tokens
         SET used_at = COALESCE(used_at, now())
         WHERE transfer_id = $1
           AND purpose = 'handoff_accept'`,
        [transfer.id]
      );

      await client.query(
        `UPDATE items
         SET status = CASE
             WHEN EXISTS (
               SELECT 1 FROM transfers tr
               WHERE tr.item_id = items.id
                 AND tr.status = 'pending_accept'
                 AND tr.type = 'return'
             ) THEN 'returning'::item_status
             WHEN EXISTS (
               SELECT 1 FROM transfers tp
               WHERE tp.item_id = items.id
                 AND tp.status = 'pending_accept'
                 AND tp.type = 'pass'
             ) THEN 'passing'::item_status
             WHEN current_holder_id IS NULL THEN 'available'::item_status
             ELSE 'checked_out'::item_status
           END,
             updated_at = now()
         WHERE id = $1`,
        [item.id]
      );

      return transfer;
    });

    return ok({ transfer_id: cancelledTransfer.id, status: "cancelled" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return notFound("Item not found");
    }

    if (error instanceof Error && error.message === "PASS_NOT_PENDING") {
      return badRequest("No pending pass to cancel");
    }

    if (error instanceof Error && error.message === "OUTSIDE_NEIGHBORHOOD") {
      return forbidden("This item is outside your neighborhood");
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbidden("Only current holder can cancel this pass");
    }

    return serverError();
  }
}
