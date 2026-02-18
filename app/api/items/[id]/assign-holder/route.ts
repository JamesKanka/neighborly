import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { getUserNeighborhood, isUserInItemNeighborhood } from "@/lib/neighborhood";
import { assignHolderSchema } from "@/lib/validators";
import type { DbItem, DbTransfer, DbUser } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = assignHolderSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return badRequest("Invalid holder assignment payload");
    }

    const ownerNeighborhood = getUserNeighborhood(user);
    const requestedEmail = parsed.data.email?.trim().toLowerCase() ?? null;

    const result = await withTransaction(async (client) => {
      const itemResult = await client.query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1 FOR UPDATE`, [id]);
      const item = itemResult.rows[0];

      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

      if (item.owner_id !== user.id) {
        throw new Error("FORBIDDEN");
      }

      if (!isUserInItemNeighborhood(user, item)) {
        throw new Error("OUTSIDE_NEIGHBORHOOD");
      }

      let recipient: DbUser | null = null;
      let createdByInvite = false;

      if (parsed.data.user_id) {
        recipient =
          (
            await client.query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [parsed.data.user_id])
          ).rows[0] ?? null;
      } else if (requestedEmail) {
        recipient =
          (
            await client.query<DbUser>(`SELECT * FROM users WHERE lower(email) = $1 LIMIT 1`, [requestedEmail])
          ).rows[0] ?? null;

        if (!recipient) {
          const inserted = await client.query<DbUser>(
            `INSERT INTO users (email, neighborhood)
             VALUES ($1, $2)
             RETURNING *`,
            [requestedEmail, ownerNeighborhood]
          );
          recipient = inserted.rows[0] ?? null;
          createdByInvite = true;
        }
      }

      if (!recipient) {
        throw new Error("RECIPIENT_NOT_FOUND");
      }

      if (getUserNeighborhood(recipient) !== ownerNeighborhood) {
        throw new Error("RECIPIENT_OUTSIDE_NEIGHBORHOOD");
      }

      if (item.current_holder_id === recipient.id && ["checked_out", "passing", "returning"].includes(item.status)) {
        throw new Error("ALREADY_HOLDER");
      }

      const transferType = item.current_holder_id ? "pass" : "checkout";
      const fromUserId = item.current_holder_id ?? item.owner_id;

      const transfer = await client.query<DbTransfer>(
        `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, accepted_at, metadata)
         VALUES ($1, $2, $3, $4, 'completed', now(), $5::jsonb)
         RETURNING *`,
        [
          item.id,
          fromUserId,
          recipient.id,
          transferType,
          JSON.stringify({
            manual_assignment: true,
            invited_by_email: Boolean(requestedEmail),
            invited_new_user: createdByInvite
          })
        ]
      );

      await client.query(
        `UPDATE items
         SET current_holder_id = $1, status = 'checked_out', owner_requested_return_at = NULL, updated_at = now()
         WHERE id = $2`,
        [recipient.id, item.id]
      );

      await client.query(
        `UPDATE waitlist_entries
         SET status = 'fulfilled'
         WHERE item_id = $1 AND user_id = $2 AND status = 'waiting'`,
        [item.id, recipient.id]
      );

      return {
        transferId: transfer.rows[0].id,
        recipient,
        createdByInvite,
        itemTitle: item.title,
        borrowDurationDays: item.borrow_duration_days
      };
    });

    let emailWarning: string | null = null;
    if (requestedEmail) {
      const link = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/items/${id}`;
      try {
        await sendEmail({
          to: result.recipient.email,
          subject: `You were added as holder for ${result.itemTitle}`,
          html:
            `<p>You were added as the current holder for <strong>${result.itemTitle}</strong>.</p>` +
            `<p>Borrow window: ${result.borrowDurationDays} days.</p>` +
            `<p>Tracking started immediately. Open the item to coordinate handoff details:</p>` +
            `<p><a href="${link}">Open item</a></p>`,
          text:
            `You were added as the current holder for ${result.itemTitle}.\n` +
            `Borrow window: ${result.borrowDurationDays} days.\n` +
            `Tracking started immediately.\n${link}`
        });
      } catch (error) {
        console.error("Failed to send holder invite email", error);
        emailWarning = "Holder assigned, but invite email could not be sent.";
      }
    }

    return ok({
      transfer_id: result.transferId,
      status: "completed",
      holder_user_id: result.recipient.id,
      holder_email: result.recipient.email,
      invited: Boolean(requestedEmail),
      invited_new_user: result.createdByInvite,
      email_warning: emailWarning
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return notFound("Item not found");
    }

    if (error instanceof Error && error.message === "RECIPIENT_NOT_FOUND") {
      return notFound("Recipient not found");
    }

    if (error instanceof Error && error.message === "ALREADY_HOLDER") {
      return badRequest("That user is already the current holder");
    }

    if (error instanceof Error && error.message === "RECIPIENT_OUTSIDE_NEIGHBORHOOD") {
      return badRequest("Recipient must be in your neighborhood");
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbidden();
    }

    if (error instanceof Error && error.message === "OUTSIDE_NEIGHBORHOOD") {
      return forbidden("This item is outside your neighborhood");
    }

    return serverError();
  }
}
