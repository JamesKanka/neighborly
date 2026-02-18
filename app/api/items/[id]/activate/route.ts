import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import type { DbItem } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!item) {
      return notFound("Item not found");
    }

    if (item.owner_id !== user.id) {
      return forbidden();
    }

    if (item.status !== "inactive") {
      return badRequest("Item is already active");
    }

    await query(
      `UPDATE items
       SET status = 'available', updated_at = now()
       WHERE id = $1`,
      [item.id]
    );

    return ok({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
