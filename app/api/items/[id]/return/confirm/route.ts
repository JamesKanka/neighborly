import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import type { DbItem, DbTransfer } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const completed = await withTransaction(async (client) => {
      const itemResult = await client.query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1 FOR UPDATE`, [id]);
      const item = itemResult.rows[0];

      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

      if (item.owner_id !== user.id) {
        throw new Error("FORBIDDEN");
      }

      const transferResult = await client.query<DbTransfer>(
        `SELECT * FROM transfers
         WHERE item_id = $1 AND type = 'return' AND status = 'pending_accept'
         ORDER BY initiated_at DESC
         LIMIT 1
         FOR UPDATE`,
        [item.id]
      );

      const transfer = transferResult.rows[0];
      if (!transfer) {
        throw new Error("PENDING_RETURN_NOT_FOUND");
      }

      await client.query(
        `UPDATE transfers
         SET status = 'completed', accepted_at = now()
         WHERE id = $1`,
        [transfer.id]
      );

      await client.query(
        `UPDATE items
         SET current_holder_id = NULL, status = 'available', owner_requested_return_at = NULL, updated_at = now()
         WHERE id = $1`,
        [item.id]
      );

      return transfer.id;
    });

    return ok({ transfer_id: completed, status: "completed" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return notFound("Item not found");
    }

    if (error instanceof Error && error.message === "PENDING_RETURN_NOT_FOUND") {
      return notFound("No pending return found");
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbidden();
    }

    return serverError();
  }
}
