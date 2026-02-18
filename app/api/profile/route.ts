import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { badRequest, ok, serverError, unauthorized } from "@/lib/http";
import { DEFAULT_NEIGHBORHOOD } from "@/lib/neighborhood";
import { z } from "zod";
import type { DbUser } from "@/lib/types";

const schema = z.object({
  display_name: z.string().min(2).max(120),
  phone: z.string().min(7).max(30),
  tips_enabled: z.boolean().optional().default(false),
  tip_url: z.string().url().max(500).optional().nullable().or(z.literal(""))
});

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ user });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest("Invalid profile payload");
    }

    const updated = await query<DbUser>(
      `UPDATE users
       SET display_name = $1, phone = $2, neighborhood = $3, tips_enabled = $4, tip_url = $5
       WHERE id = $6
       RETURNING *`,
      [
        parsed.data.display_name,
        parsed.data.phone,
        DEFAULT_NEIGHBORHOOD,
        parsed.data.tips_enabled ?? false,
        parsed.data.tip_url || null,
        user.id
      ]
    );

    return ok({ user: updated.rows[0] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError();
  }
}
