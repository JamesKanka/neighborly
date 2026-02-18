import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { createItemTagToken } from "@/lib/item-tag-link";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import { generateQrDataUrl } from "@/lib/qr";
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
      return forbidden("Only owner can rotate item tag link");
    }

    if (!isUserInItemNeighborhood(user, item)) {
      return forbidden("This item is outside your neighborhood");
    }

    const nextVersion = item.item_tag_token_version + 1;
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const token = createItemTagToken(item.id, nextVersion);
    const link = `${baseUrl}/items/${item.id}/tag?token=${encodeURIComponent(token)}`;
    const itemTagQrCodeUrl = await generateQrDataUrl(link);

    const updated = await query<DbItem>(
      `UPDATE items
       SET item_tag_token_version = $1, item_tag_qr_code_url = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [nextVersion, itemTagQrCodeUrl, item.id]
    );

    return ok({
      item_id: item.id,
      version: nextVersion,
      item_tag_link: link,
      item_tag_qr_code_url: updated.rows[0]?.item_tag_qr_code_url ?? itemTagQrCodeUrl
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
