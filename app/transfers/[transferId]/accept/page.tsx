import { redirect } from "next/navigation";
import { AcceptTransferForm } from "@/components/accept-transfer-form";
import { getCurrentUser } from "@/lib/auth";

export default async function TransferAcceptPage({
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
      ? `/transfers/${transferId}/accept?token=${encodeURIComponent(token)}`
      : `/transfers/${transferId}/accept`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Handoff</p>
        <h1>Accept Item Transfer</h1>
        <p className="subtitle">Confirm this handoff to finalize custody.</p>
      </section>
      {!token ? (
        <div className="card">
          <p>Missing token in link.</p>
        </div>
      ) : (
        <AcceptTransferForm transferId={transferId} token={token} />
      )}
    </div>
  );
}
