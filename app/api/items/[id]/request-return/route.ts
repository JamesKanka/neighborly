import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import type { DbItem, DbUser } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!item) {
      return notFound("Item not found");
    }

    if (item.owner_id !== user.id) {
      return forbidden("Only the owner can request an item back");
    }

    if (!item.current_holder_id) {
      return forbidden("Item is not currently checked out");
    }

    const holder = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [item.current_holder_id])).rows[0];
    if (!holder) {
      return notFound("Current holder not found");
    }

    await query(`UPDATE items SET owner_requested_return_at = now(), updated_at = now() WHERE id = $1`, [item.id]);

    await query(
      `INSERT INTO notifications (user_id, item_id, type, message, metadata)
       VALUES ($1, $2, 'owner_return_request', $3, $4::jsonb)`,
      [
        holder.id,
        item.id,
        `${user.display_name ?? "Owner"} requested the return of ${item.title}.`,
        JSON.stringify({ item_id: item.id, owner_id: user.id })
      ]
    );

    const link = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/items/${item.id}`;
    let emailWarning: string | null = null;
    try {
      await sendEmail({
        to: holder.email,
        subject: `Return requested for ${item.title}`,
        html:
          `<p>${escapeHtml(user.display_name ?? "The owner")} has requested <strong>${escapeHtml(item.title)}</strong> back.</p>` +
          `<p><a href="${link}">Open item</a></p>`,
        text: `${user.display_name ?? "The owner"} has requested ${item.title} back.\n${link}`
      });
    } catch (emailError) {
      console.error("Failed to send owner return-request email", emailError);
      emailWarning = "Return request saved, but email could not be sent.";
    }

    return ok({ success: true, email_warning: emailWarning });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
