import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import type { DbItem, DbTransfer } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const transferId = await withTransaction(async (client) => {
      const itemResult = await client.query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1 FOR UPDATE`, [id]);
      const item = itemResult.rows[0];

      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

      if (item.owner_id !== user.id) {
        throw new Error("FORBIDDEN");
      }

      if (!isUserInItemNeighborhood(user, item)) {
        throw new Error("OUTSIDE_NEIGHBORHOOD");
      }

      if (!item.current_holder_id || !["checked_out", "passing", "returning"].includes(item.status)) {
        throw new Error("NOT_CHECKED_OUT");
      }

      const pendingReturn = await client.query<DbTransfer>(
        `SELECT * FROM transfers
         WHERE item_id = $1 AND type = 'return' AND status = 'pending_accept'
         ORDER BY initiated_at DESC
         LIMIT 1
         FOR UPDATE`,
        [item.id]
      );

      let completedTransferId = pendingReturn.rows[0]?.id ?? null;

      if (pendingReturn.rows[0]) {
        await client.query(
          `UPDATE transfers
           SET status = 'completed', accepted_at = now()
           WHERE id = $1`,
          [pendingReturn.rows[0].id]
        );
      } else {
        const insertedTransfer = await client.query<DbTransfer>(
          `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, accepted_at, metadata)
           VALUES ($1, $2, $3, 'return', 'completed', now(), $4::jsonb)`,
          [item.id, item.current_holder_id, item.owner_id, JSON.stringify({ manual_checkin: true })]
        );
        completedTransferId = insertedTransfer.rows[0]?.id ?? null;
      }

      await client.query(
        `UPDATE items
         SET current_holder_id = NULL, status = 'available', owner_requested_return_at = NULL, updated_at = now()
         WHERE id = $1`,
        [item.id]
      );

      return completedTransferId;
    });

    return ok({ transfer_id: transferId, status: "completed" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return notFound("Item not found");
    }

    if (error instanceof Error && error.message === "NOT_CHECKED_OUT") {
      return badRequest("Item is not currently checked out");
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbidden();
    }

    if (error instanceof Error && error.message === "OUTSIDE_NEIGHBORHOOD") {
      return forbidden("This item is outside your neighborhood");
    }

    return serverError();
  }
}
