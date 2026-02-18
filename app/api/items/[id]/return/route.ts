import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { createPendingTransfer } from "@/lib/transfers";
import type { DbItem, DbUser } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];

    if (!item) {
      return notFound("Item not found");
    }

    if (item.current_holder_id !== user.id) {
      return forbidden("Only current holder can initiate a return");
    }

    const pendingReturn = (
      await query<{ id: string }>(
        `SELECT id
         FROM transfers
         WHERE item_id = $1
           AND type = 'return'
           AND status = 'pending_accept'
         LIMIT 1`,
        [item.id]
      )
    ).rows[0];
    if (pendingReturn) {
      return badRequest("A return is already pending owner confirmation");
    }

    const pendingPass = (
      await query<{ id: string }>(
        `SELECT id
         FROM transfers
         WHERE item_id = $1
           AND type = 'pass'
           AND status = 'pending_accept'
         LIMIT 1`,
        [item.id]
      )
    ).rows[0];
    if (pendingPass) {
      return badRequest("This item is currently awaiting pass acceptance");
    }

    const owner = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [item.owner_id])).rows[0];
    if (!owner) {
      return badRequest("Owner not found");
    }

    const { transfer } = await createPendingTransfer({
      itemId: item.id,
      fromUserId: user.id,
      toUserId: owner.id,
      type: "return",
      createToken: false
    });

    await query(`UPDATE items SET status = 'returning', updated_at = now() WHERE id = $1`, [item.id]);

    const link = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/items/${item.id}`;
    let emailWarning: string | null = null;
    try {
      await sendEmail({
        to: owner.email,
        subject: `Return confirmation requested for ${item.title}`,
        html:
          `<p>${escapeHtml(user.display_name ?? "A holder")} marked <strong>${escapeHtml(item.title)}</strong> as returned.</p>` +
          `<p>Please confirm receipt in your item page: <a href="${link}">Open item</a></p>`,
        text:
          `${user.display_name ?? "A holder"} marked ${item.title} as returned.\n` +
          `Please confirm receipt in your item page: ${link}`
      });
    } catch (emailError) {
      console.error("Failed to send return confirmation email", emailError);
      emailWarning = "Return request created, but email could not be sent.";
    }

    return ok({ transfer_id: transfer.id, status: transfer.status, email_warning: emailWarning });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
