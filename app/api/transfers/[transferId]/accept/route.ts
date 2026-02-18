import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from "@/lib/http";
import { acceptTransfer } from "@/lib/transfers";
import { transferAcceptSchema } from "@/lib/validators";

export async function POST(request: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  try {
    const user = await requireUser();
    const { transferId } = await params;
    const parsed = transferAcceptSchema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest("Invalid payload");
    }

    const transfer = await acceptTransfer({
      transferId,
      token: parsed.data.token,
      actingUserId: user.id
    });

    return ok({ transfer_id: transfer.id, status: transfer.status });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    if (error instanceof Error && error.message === "TRANSFER_NOT_FOUND") {
      return notFound("Transfer not found");
    }

    if (error instanceof Error && error.message === "NOT_TRANSFER_RECIPIENT") {
      return forbidden("Only recipient can accept transfer");
    }

    if (error instanceof Error && error.message === "INVALID_OR_EXPIRED_TOKEN") {
      return badRequest("Token is invalid or expired");
    }

    if (error instanceof Error && error.message === "TRANSFER_NOT_PENDING") {
      return badRequest("Transfer is no longer pending");
    }

    return serverError();
  }
}
