import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import { createPendingTransfer, expireStalePendingTransfers, findNextEligibleWaitlistUser } from "@/lib/transfers";
import { passSchema } from "@/lib/validators";
import type { DbItem, DbUser } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await expireStalePendingTransfers();
    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];

    if (!item) {
      return notFound("Item not found");
    }

    if (item.current_holder_id !== user.id) {
      return forbidden("Only current holder can pass this item");
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
      return badRequest("A pass is already pending for this item");
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
      return badRequest("This item is currently being returned to the owner");
    }

    if (!isUserInItemNeighborhood(user, item)) {
      return forbidden("This item is outside your neighborhood");
    }

    const parsed = passSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return badRequest("Invalid payload");
    }

    let recipient: DbUser | null = null;
    if (parsed.data.to_user_id) {
      recipient = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [parsed.data.to_user_id])).rows[0] ?? null;
    } else if (item.owner_requested_return_at) {
      recipient = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [item.owner_id])).rows[0] ?? null;
    } else {
      recipient = await findNextEligibleWaitlistUser(item.id);
    }

    if (!recipient) {
      return badRequest("No eligible recipient found");
    }

    if (!isUserInItemNeighborhood(recipient, item)) {
      return badRequest("Recipient is not in this neighborhood");
    }

    const { transfer, token } = await createPendingTransfer({
      itemId: item.id,
      fromUserId: user.id,
      toUserId: recipient.id,
      type: "pass",
      expiresInHours: 48,
      metadata: {
        borrow_duration_days: item.borrow_duration_days
      }
    });
    if (!token) {
      return serverError("Missing handoff token");
    }

    await query(`UPDATE items SET status = 'passing', updated_at = now() WHERE id = $1`, [item.id]);

    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const acceptLink = `${baseUrl}/transfers/${transfer.id}/accept?token=${token}`;
    const skipLink = `${baseUrl}/transfers/${transfer.id}/skip?token=${token}`;
    let emailWarning: string | null = null;
    try {
      await sendEmail({
        to: recipient.email,
        subject: `You're up next for ${item.title} (respond within 2 days)`,
        html:
          `<p>${escapeHtml(user.display_name ?? "A neighbor")} is ready to pass <strong>${escapeHtml(item.title)}</strong> to you.</p>` +
          `<p>Please respond within <strong>2 days</strong>:</p>` +
          `<p><a href="${acceptLink}">Accept and coordinate handoff</a></p>` +
          `<p><a href="${skipLink}">Skip this turn</a></p>`,
        text:
          `${user.display_name ?? "A neighbor"} is ready to pass ${item.title} to you.\n` +
          `Respond within 2 days:\n` +
          `Accept: ${acceptLink}\n` +
          `Skip: ${skipLink}`
      });
    } catch (emailError) {
      console.error("Failed to send pass email", emailError);
      emailWarning = "Pass created, but email could not be sent.";
    }

    return ok({ transfer_id: transfer.id, status: transfer.status, email_warning: emailWarning });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
