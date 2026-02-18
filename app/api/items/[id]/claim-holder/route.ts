import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { verifyItemTagToken } from "@/lib/item-tag-link";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import { itemTagTokenSchema } from "@/lib/validators";
import type { DbItem, DbTransfer, DbUser } from "@/lib/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const parsed = itemTagTokenSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return badRequest("Invalid claim payload");
    }

    const result = await withTransaction(async (client) => {
      const item = (
        await client.query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1 FOR UPDATE`, [id])
      ).rows[0];
      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

      if (!verifyItemTagToken(parsed.data.token, id, item.item_tag_token_version)) {
        throw new Error("INVALID_TAG_TOKEN");
      }

      if (!isUserInItemNeighborhood(user, item)) {
        throw new Error("OUTSIDE_NEIGHBORHOOD");
      }

      if (item.status === "inactive") {
        throw new Error("INACTIVE_ITEM");
      }

      if (item.owner_id === user.id) {
        throw new Error("OWNER_CANNOT_CLAIM");
      }

      if (item.current_holder_id && item.current_holder_id !== user.id) {
        throw new Error("ALREADY_CHECKED_OUT");
      }

      const pendingTransfer = (
        await client.query<{ id: string }>(
          `SELECT id
           FROM transfers
           WHERE item_id = $1
             AND status = 'pending_accept'
           LIMIT 1`,
          [item.id]
        )
      ).rows[0];

      if (pendingTransfer) {
        throw new Error("PENDING_TRANSFER_EXISTS");
      }

      if (item.current_holder_id === user.id) {
        return {
          transferId: null as string | null,
          ownerId: item.owner_id,
          itemTitle: item.title,
          alreadyHolder: true
        };
      }

      const transfer = (
        await client.query<DbTransfer>(
          `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, accepted_at, metadata)
           VALUES ($1, $2, $3, $4, 'completed', now(), $5::jsonb)
           RETURNING *`,
          [
            item.id,
            item.owner_id,
            user.id,
            "checkout",
            JSON.stringify({
              manual_claim: true,
              claim_source: "item_tag_link"
            })
          ]
        )
      ).rows[0];

      await client.query(
        `UPDATE items
         SET current_holder_id = $1, status = 'checked_out', owner_requested_return_at = NULL, updated_at = now()
         WHERE id = $2`,
        [user.id, item.id]
      );

      await client.query(
        `UPDATE waitlist_entries
         SET status = 'fulfilled'
         WHERE item_id = $1 AND user_id = $2 AND status = 'waiting'`,
        [item.id, user.id]
      );

      await client.query(
        `INSERT INTO notifications (user_id, item_id, type, message, metadata)
         VALUES ($1, $2, 'item_claimed', $3, $4::jsonb)`,
        [item.owner_id, item.id, `${user.display_name ?? user.email} claimed current holder`, JSON.stringify({ from_user_id: user.id })]
      );

      return {
        transferId: transfer.id,
        ownerId: item.owner_id,
        itemTitle: item.title,
        alreadyHolder: false
      };
    });

    const owner = (await query<DbUser>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [result.ownerId])).rows[0] ?? null;
    let emailWarning: string | null = null;
    if (owner && !result.alreadyHolder) {
      const itemLink = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/items/${id}`;
      try {
        await sendEmail({
          to: owner.email,
          subject: `${user.display_name ?? "A neighbor"} claimed ${result.itemTitle}`,
          html:
            `<p>${escapeHtml(user.display_name ?? user.email)} marked themselves as the current holder for <strong>${escapeHtml(result.itemTitle)}</strong>.</p>` +
            `<p><a href="${itemLink}">Open item</a></p>`,
          text:
            `${user.display_name ?? user.email} marked themselves as the current holder for ${result.itemTitle}.\n` +
            `${itemLink}`
        });
      } catch (emailError) {
        console.error("Failed to send holder-claim email", emailError);
        emailWarning = "Claim succeeded, but owner email could not be sent.";
      }
    }

    return ok({
      transfer_id: result.transferId,
      status: result.alreadyHolder ? "already_holder" : "completed",
      email_warning: emailWarning
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return notFound("Item not found");
    }
    if (error instanceof Error && error.message === "INVALID_TAG_TOKEN") {
      return badRequest("Invalid or expired item tag link");
    }
    if (error instanceof Error && error.message === "OUTSIDE_NEIGHBORHOOD") {
      return forbidden("Item is outside your neighborhood");
    }
    if (error instanceof Error && error.message === "INACTIVE_ITEM") {
      return badRequest("Item is inactive");
    }
    if (error instanceof Error && error.message === "OWNER_CANNOT_CLAIM") {
      return badRequest("Owner cannot claim holder from this link");
    }
    if (error instanceof Error && error.message === "ALREADY_CHECKED_OUT") {
      return badRequest("Item is already checked out. Ask the owner or current holder to transfer it.");
    }
    if (error instanceof Error && error.message === "PENDING_TRANSFER_EXISTS") {
      return badRequest("A handoff is already pending for this item");
    }

    return serverError();
  }
}
