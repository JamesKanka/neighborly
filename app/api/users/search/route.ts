import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserNeighborhood } from "@/lib/neighborhood";
import { ok, serverError, unauthorized } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!q) {
      return ok({ users: [] });
    }

    const users = await query<{ id: string; display_name: string | null; email: string }>(
      `SELECT id, display_name, email
       FROM users
       WHERE neighborhood = $1
         AND id <> $2
         AND (display_name ILIKE $3 OR email ILIKE $3)
       ORDER BY display_name NULLS LAST, email ASC
       LIMIT 8`,
      [getUserNeighborhood(user), user.id, `%${q}%`]
    );

    return ok({ users: users.rows });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
