import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { rateItemSchema } from "@/lib/validators";
import type { DbItem, DbRating } from "@/lib/types";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const stats = await query<{ avg_score: string | null; total: string }>(
      `SELECT ROUND(AVG(score)::numeric, 2)::text AS avg_score, COUNT(*)::text AS total
       FROM ratings
       WHERE item_id = $1 AND rating_type = 'item'`,
      [id]
    );

    const recent = await query<DbRating & { reviewer_name: string | null; target_name: string | null }>(
      `SELECT r.*, ru.display_name AS reviewer_name, tu.display_name AS target_name
       FROM ratings r
       LEFT JOIN users ru ON ru.id = r.reviewer_user_id
       LEFT JOIN users tu ON tu.id = r.target_user_id
       WHERE r.item_id = $1
       ORDER BY r.created_at DESC
       LIMIT 12`,
      [id]
    );

    return ok({
      avg_item_rating: stats.rows[0]?.avg_score ? Number(stats.rows[0].avg_score) : null,
      total_ratings: Number(stats.rows[0]?.total ?? "0"),
      ratings: recent.rows
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const item = (await query<DbItem>(`SELECT * FROM items WHERE id = $1 LIMIT 1`, [id])).rows[0];
    if (!item) {
      return notFound("Item not found");
    }

    const parsed = rateItemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest("Invalid rating payload");
    }

    if (parsed.data.rating_type === "item") {
      const eligible = await query<{ ok: string }>(
        `SELECT '1' AS ok
         FROM transfers
         WHERE item_id = $1
           AND status = 'completed'
           AND (from_user_id = $2 OR to_user_id = $2)
         LIMIT 1`,
        [item.id, user.id]
      );

      if (!eligible.rows[0] && item.owner_id !== user.id) {
        return forbidden("You can rate an item only after a real handoff or ownership");
      }

      try {
        const inserted = await query<DbRating>(
          `INSERT INTO ratings (item_id, reviewer_user_id, rating_type, score, comment)
           VALUES ($1, $2, 'item', $3, $4)
           RETURNING *`,
          [item.id, user.id, parsed.data.score, parsed.data.comment ?? null]
        );
        return ok({ rating: inserted.rows[0] }, 201);
      } catch (error) {
        const isDuplicate =
          typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
        if (isDuplicate) {
          return badRequest("You already rated this item");
        }
        throw error;
      }
    }

    const targetUserId = parsed.data.target_user_id;
    if (!targetUserId) {
      return badRequest("target_user_id is required for person ratings");
    }

    if (targetUserId === user.id) {
      return badRequest("You cannot rate yourself");
    }

    const eligiblePeer = await query<{ ok: string }>(
      `SELECT '1' AS ok
       FROM transfers
       WHERE item_id = $1
         AND status = 'completed'
         AND (
           (from_user_id = $2 AND to_user_id = $3)
           OR (from_user_id = $3 AND to_user_id = $2)
         )
       LIMIT 1`,
      [item.id, user.id, targetUserId]
    );

    const ownerCanRate = await query<{ ok: string }>(
      `SELECT '1' AS ok
       FROM transfers
       WHERE item_id = $1
         AND status = 'completed'
         AND (from_user_id = $2 OR to_user_id = $2)
       LIMIT 1`,
      [item.id, targetUserId]
    );

    if (!eligiblePeer.rows[0] && !(item.owner_id === user.id && ownerCanRate.rows[0])) {
      return forbidden("You can rate this person only after a valid transfer context");
    }

    try {
      const inserted = await query<DbRating>(
        `INSERT INTO ratings (item_id, reviewer_user_id, target_user_id, rating_type, score, comment)
         VALUES ($1, $2, $3, 'person', $4, $5)
         RETURNING *`,
        [item.id, user.id, targetUserId, parsed.data.score, parsed.data.comment ?? null]
      );
      return ok({ rating: inserted.rows[0] }, 201);
    } catch (error) {
      const isDuplicate =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
      if (isDuplicate) {
        return badRequest("You already rated this person for this item");
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
