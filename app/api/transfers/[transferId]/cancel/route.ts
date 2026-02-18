import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import type { DbItem, DbTransfer } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: Promise<{ transferId: string }> }) {
  try {
    const user = await requireUser();
    const { transferId } = await params;

    const transfer = await withTransaction(async (client) => {
      const transferResult = await client.query<DbTransfer>(
        `SELECT * FROM transfers WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [transferId]
      );
      const currentTransfer = transferResult.rows[0];
      if (!currentTransfer) {
        throw new Error("TRANSFER_NOT_FOUND");
      }

      if (currentTransfer.type !== "checkout" && currentTransfer.type !== "pass") {
        throw new Error("INVALID_TRANSFER_TYPE");
      }

      if (currentTransfer.status !== "pending_accept") {
        throw new Error("TRANSFER_NOT_PENDING");
      }

      const item = (
        await client.query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1 FOR UPDATE`, [currentTransfer.item_id])
      ).rows[0];
      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

      if (currentTransfer.type === "checkout") {
        if (item.owner_id !== user.id) {
          throw new Error("FORBIDDEN_CHECKOUT");
        }
      } else {
        if (item.current_holder_id !== user.id && currentTransfer.from_user_id !== user.id) {
          throw new Error("FORBIDDEN_PASS");
        }
        if (!isUserInItemNeighborhood(user, item)) {
          throw new Error("OUTSIDE_NEIGHBORHOOD");
        }
      }

      await client.query(`UPDATE transfers SET status = 'cancelled' WHERE id = $1`, [currentTransfer.id]);
      await client.query(
        `UPDATE tokens
         SET used_at = COALESCE(used_at, now())
         WHERE transfer_id = $1 AND purpose = 'handoff_accept'`,
        [currentTransfer.id]
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

      const updatedTransfer = await client.query<DbTransfer>(`SELECT * FROM transfers WHERE id = $1`, [currentTransfer.id]);
      return updatedTransfer.rows[0];
    });

    return ok({ transfer_id: transfer.id, status: transfer.status });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    if (error instanceof Error && error.message === "TRANSFER_NOT_FOUND") {
      return notFound("Transfer not found");
    }

    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return notFound("Item not found");
    }

    if (error instanceof Error && error.message === "TRANSFER_NOT_PENDING") {
      return badRequest("Offer is no longer pending");
    }

    if (error instanceof Error && error.message === "INVALID_TRANSFER_TYPE") {
      return badRequest("Only pending checkout/pass offers can be cancelled here");
    }

    if (error instanceof Error && error.message === "OUTSIDE_NEIGHBORHOOD") {
      return forbidden("This item is outside your neighborhood");
    }

    if (error instanceof Error && error.message === "FORBIDDEN_PASS") {
      return forbidden("Only current holder can cancel this pass");
    }

    if (error instanceof Error && error.message === "FORBIDDEN_CHECKOUT") {
      return forbidden("Only item owner can cancel this checkout offer");
    }

    return serverError();
  }
}
