import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import { generateToken, hashToken, isExpired } from "@/lib/tokens";
import type { DbTransfer } from "@/lib/types";

export async function findNextEligibleWaitlistUser(itemId: string, client?: PoolClient) {
  const sql = `
    SELECT u.*
    FROM waitlist_entries w
    JOIN users u ON u.id = w.user_id
    WHERE w.item_id = $1 AND w.status = 'waiting'
    ORDER BY COALESCE(w.position, 2147483647), w.created_at ASC
    LIMIT 1
  `;

  const result = client ? await client.query(sql, [itemId]) : await query(sql, [itemId]);
  return result.rows[0] ?? null;
}

export async function createPendingTransfer(input: {
  itemId: string;
  fromUserId: string | null;
  toUserId: string | null;
  type: "checkout" | "pass" | "return";
  expiresInHours?: number;
  metadata?: Record<string, unknown>;
  createToken?: boolean;
}) {
  const createToken = input.createToken ?? true;
  const token = createToken ? generateToken() : null;
  const tokenHash = token ? hashToken(token) : null;
  const expiresInHours = input.expiresInHours ?? 72;

  const transfer = await withTransaction(async (client) => {
    const transferInsert = await client.query<DbTransfer>(
      `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, metadata)
       VALUES ($1, $2, $3, $4, 'pending_accept', $5::jsonb)
       RETURNING *`,
      [input.itemId, input.fromUserId, input.toUserId, input.type, JSON.stringify(input.metadata ?? {})]
    );

    const created = transferInsert.rows[0];
    if (tokenHash) {
      await client.query(
        `INSERT INTO tokens (item_id, transfer_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, $3, 'handoff_accept', now() + ($4 || ' hours')::interval)`,
        [input.itemId, created.id, tokenHash, String(expiresInHours)]
      );
    }

    return created;
  });

  return { transfer, token };
}

export async function acceptTransfer(input: { transferId: string; token: string; actingUserId: string }) {
  const incomingHash = hashToken(input.token);

  return withTransaction(async (client) => {
    const transferResult = await client.query<DbTransfer>(
      `SELECT * FROM transfers WHERE id = $1 FOR UPDATE`,
      [input.transferId]
    );
    const transfer = transferResult.rows[0];

    if (!transfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }

    if (transfer.status !== "pending_accept") {
      throw new Error("TRANSFER_NOT_PENDING");
    }

    if (transfer.to_user_id && transfer.to_user_id !== input.actingUserId) {
      throw new Error("NOT_TRANSFER_RECIPIENT");
    }

    const tokenResult = await client.query<{
      id: string;
      token_hash: string;
      expires_at: string | null;
      used_at: string | null;
    }>(
      `SELECT id, token_hash, expires_at, used_at
       FROM tokens
       WHERE transfer_id = $1 AND purpose = 'handoff_accept'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [input.transferId]
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow || tokenRow.token_hash !== incomingHash || tokenRow.used_at || isExpired(tokenRow.expires_at)) {
      throw new Error("INVALID_OR_EXPIRED_TOKEN");
    }

    await client.query(
      `UPDATE transfers
       SET status = 'completed', accepted_at = now()
       WHERE id = $1`,
      [transfer.id]
    );

    if (transfer.type === "return") {
      await client.query(
        `UPDATE items
         SET current_holder_id = NULL, status = 'available', owner_requested_return_at = NULL, updated_at = now()
         WHERE id = $1`,
        [transfer.item_id]
      );
    } else {
      await client.query(
        `UPDATE items
         SET current_holder_id = $1, status = 'checked_out', owner_requested_return_at = NULL, updated_at = now()
         WHERE id = $2`,
        [transfer.to_user_id, transfer.item_id]
      );

      if (transfer.to_user_id) {
        await client.query(
          `UPDATE waitlist_entries
           SET status = 'fulfilled'
           WHERE item_id = $1 AND user_id = $2 AND status = 'waiting'`,
          [transfer.item_id, transfer.to_user_id]
        );
      }
    }

    await client.query(`UPDATE tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);

    const refreshed = await client.query<DbTransfer>(`SELECT * FROM transfers WHERE id = $1`, [transfer.id]);
    return refreshed.rows[0];
  });
}

export async function skipTransfer(input: { transferId: string; token: string; actingUserId: string }) {
  const incomingHash = hashToken(input.token);

  return withTransaction(async (client) => {
    const transferResult = await client.query<DbTransfer>(
      `SELECT * FROM transfers WHERE id = $1 FOR UPDATE`,
      [input.transferId]
    );
    const transfer = transferResult.rows[0];

    if (!transfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }

    if (transfer.status !== "pending_accept") {
      throw new Error("TRANSFER_NOT_PENDING");
    }

    if (transfer.to_user_id && transfer.to_user_id !== input.actingUserId) {
      throw new Error("NOT_TRANSFER_RECIPIENT");
    }

    const tokenResult = await client.query<{
      id: string;
      token_hash: string;
      expires_at: string | null;
      used_at: string | null;
    }>(
      `SELECT id, token_hash, expires_at, used_at
       FROM tokens
       WHERE transfer_id = $1 AND purpose = 'handoff_accept'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [input.transferId]
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow || tokenRow.token_hash !== incomingHash || tokenRow.used_at || isExpired(tokenRow.expires_at)) {
      throw new Error("INVALID_OR_EXPIRED_TOKEN");
    }

    await client.query(`UPDATE transfers SET status = 'cancelled' WHERE id = $1`, [transfer.id]);

    const itemRow = (
      await client.query<{ current_holder_id: string | null }>(
        `SELECT current_holder_id
         FROM items
         WHERE id = $1
         FOR UPDATE`,
        [transfer.item_id]
      )
    ).rows[0];

    if (transfer.to_user_id) {
      await client.query(
        `UPDATE waitlist_entries
         SET status = 'skipped'
         WHERE item_id = $1 AND user_id = $2 AND status = 'waiting'`,
          [transfer.item_id, transfer.to_user_id]
      );
    }

    if (transfer.type === "pass" || transfer.type === "checkout") {
      await client.query(
        `UPDATE items
         SET status = CASE
             WHEN $1::uuid IS NULL THEN 'available'::item_status
             ELSE 'checked_out'::item_status
           END,
             updated_at = now()
         WHERE id = $2`,
        [itemRow?.current_holder_id ?? null, transfer.item_id]
      );
    }

    await client.query(`UPDATE tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);

    const refreshed = await client.query<DbTransfer>(`SELECT * FROM transfers WHERE id = $1`, [transfer.id]);
    return refreshed.rows[0];
  });
}

export async function expireStalePendingTransfers() {
  await query(
    `WITH expired AS (
       UPDATE transfers t
       SET status = 'expired'
       WHERE status = 'pending_accept'
         AND EXISTS (
           SELECT 1
           FROM tokens tok
           WHERE tok.transfer_id = t.id
             AND tok.purpose = 'handoff_accept'
             AND tok.expires_at IS NOT NULL
             AND tok.expires_at < now()
         )
       RETURNING t.item_id, t.to_user_id, t.type
     )
     , skipped AS (
       UPDATE waitlist_entries w
       SET status = 'skipped'
       FROM expired e
       WHERE e.type = 'pass'
         AND e.to_user_id IS NOT NULL
         AND w.item_id = e.item_id
         AND w.user_id = e.to_user_id
         AND w.status = 'waiting'
       RETURNING 1
     )
     , refreshed_items AS (
       UPDATE items i
       SET status = CASE
           WHEN i.current_holder_id IS NULL THEN 'available'::item_status
           ELSE 'checked_out'::item_status
         END,
           updated_at = now()
       FROM expired e
       WHERE i.id = e.item_id
         AND e.type IN ('pass', 'checkout')
       RETURNING 1
     )
     SELECT
       (SELECT COUNT(*) FROM skipped) AS skipped_count,
       (SELECT COUNT(*) FROM refreshed_items) AS refreshed_item_count`
  );
}
