import { redirect } from "next/navigation";
import { SkipTransferForm } from "@/components/skip-transfer-form";
import { getCurrentUser } from "@/lib/auth";

export default async function TransferSkipPage({
  params,
  searchParams
}: {
  params: Promise<{ transferId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { transferId } = await params;
  const resolvedSearch = await searchParams;
  const token = resolvedSearch.token;

  const user = await getCurrentUser();
  if (!user) {
    const callbackPath = token
      ? `/transfers/${transferId}/skip?token=${encodeURIComponent(token)}`
      : `/transfers/${transferId}/skip`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Handoff</p>
        <h1>Skip Handoff</h1>
        <p className="subtitle">You are skipping this turn. The current holder can pass to the next person.</p>
      </section>
      {!token ? (
        <div className="card">
          <p>Missing token in link.</p>
        </div>
      ) : (
        <SkipTransferForm transferId={transferId} token={token} />
      )}
    </div>
  );
}
