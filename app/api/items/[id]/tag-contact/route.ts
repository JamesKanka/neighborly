import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { verifyItemTagToken } from "@/lib/item-tag-link";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import { itemTagContactSchema } from "@/lib/validators";
import type { DbItem, DbUser } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = itemTagContactSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return badRequest("Invalid message payload");
    }

    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!item) {
      return notFound("Item not found");
    }

    if (!verifyItemTagToken(parsed.data.token, id, item.item_tag_token_version)) {
      return badRequest("Invalid or expired item tag link");
    }

    if (!isUserInItemNeighborhood(user, item)) {
      return forbidden("Item is outside your neighborhood");
    }

    if (item.owner_id === user.id) {
      return badRequest("Owners cannot use this message form");
    }

    const owner = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [item.owner_id])).rows[0];
    if (!owner) {
      return notFound("Owner not found");
    }

    await query(
      `INSERT INTO notifications (user_id, item_id, type, message, metadata)
       VALUES ($1, $2, 'tag_link_message', $3, $4::jsonb)`,
      [owner.id, item.id, parsed.data.message, JSON.stringify({ from_user_id: user.id })]
    );

    const itemLink = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/items/${item.id}`;
    let emailWarning: string | null = null;
    try {
      await sendEmail({
        to: owner.email,
        subject: `Message from item tag for ${item.title}`,
        html:
          `<p>${escapeHtml(user.display_name ?? user.email)} sent a message from the item tag page:</p>` +
          `<blockquote>${escapeHtml(parsed.data.message)}</blockquote>` +
          `<p><a href="${itemLink}">Open item</a></p>`,
        text:
          `${user.display_name ?? user.email} sent a message from the item tag page:\n` +
          `${parsed.data.message}\n` +
          `${itemLink}`
      });
    } catch (emailError) {
      console.error("Failed to send item tag contact email", emailError);
      emailWarning = "Message saved, but email could not be sent.";
    }

    return ok({ success: true, email_warning: emailWarning });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
