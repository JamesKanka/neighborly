import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import { createPendingTransfer } from "@/lib/transfers";
import { checkoutSchema } from "@/lib/validators";
import type { DbItem, DbUser } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (!isUserInItemNeighborhood(user, item)) {
      return forbidden("This item is outside your neighborhood");
    }

    const parsed = checkoutSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid payload");
    }

    const recipient = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [parsed.data.to_user_id])).rows[0];
    if (!recipient) {
      return notFound("Recipient not found");
    }

    if (!isUserInItemNeighborhood(recipient, item)) {
      return badRequest("Recipient is not in this neighborhood");
    }

    const existingPending = (
      await query<{ id: string }>(
        `SELECT id
         FROM transfers
         WHERE item_id = $1
           AND to_user_id = $2
           AND type = 'checkout'
           AND status = 'pending_accept'
         LIMIT 1`,
        [item.id, recipient.id]
      )
    ).rows[0];
    if (existingPending) {
      return badRequest("Offer already pending for this user");
    }

    const { transfer, token } = await createPendingTransfer({
      itemId: item.id,
      fromUserId: item.current_holder_id ?? item.owner_id,
      toUserId: recipient.id,
      type: "checkout",
      metadata: {
        borrow_duration_days: item.borrow_duration_days
      }
    });

    const link = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/transfers/${transfer.id}/accept?token=${token}`;
    let emailWarning: string | null = null;
    try {
      await sendEmail({
        to: recipient.email,
        subject: `Accept handoff for ${item.title}`,
        html:
          `<p>You have a handoff request for <strong>${escapeHtml(item.title)}</strong>.</p>` +
          `<p><a href="${link}">Accept handoff</a></p>`,
        text: `You have a handoff request for ${item.title}.\nAccept handoff: ${link}`
      });
    } catch (emailError) {
      console.error("Failed to send checkout offer email", emailError);
      emailWarning = "Offer created, but email could not be sent.";
    }

    return ok({ transfer_id: transfer.id, status: transfer.status, email_warning: emailWarning });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
