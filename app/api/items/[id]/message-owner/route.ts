import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { messageOwnerSchema } from "@/lib/validators";
import type { DbItem, DbUser } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!item) {
      return notFound("Item not found");
    }

    if (item.current_holder_id !== user.id) {
      return forbidden("Only the current holder can message the owner");
    }

    const parsed = messageOwnerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid message payload");
    }

    const owner = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [item.owner_id])).rows[0];
    if (!owner) {
      return notFound("Owner not found");
    }

    await query(
      `INSERT INTO notifications (user_id, item_id, type, message, metadata)
       VALUES ($1, $2, 'holder_message', $3, $4::jsonb)`,
      [owner.id, item.id, parsed.data.message, JSON.stringify({ from_user_id: user.id })]
    );

    const link = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/items/${item.id}`;
    let emailWarning: string | null = null;
    try {
      await sendEmail({
        to: owner.email,
        subject: `Message about ${item.title}`,
        html:
          `<p>${escapeHtml(user.display_name ?? "Current holder")} sent a message:</p>` +
          `<blockquote>${escapeHtml(parsed.data.message)}</blockquote>` +
          `<p><a href="${link}">Open item</a></p>`,
        text:
          `${user.display_name ?? "Current holder"} sent a message:\n` +
          `${parsed.data.message}\n` +
          `${link}`
      });
    } catch (emailError) {
      console.error("Failed to send owner message email", emailError);
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
