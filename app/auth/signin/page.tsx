import { AuthButtons } from "@/components/auth-buttons";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl;

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">Welcome</p>
        <h1>Sign in to Neighborly</h1>
        <p className="subtitle">Borrow, lend, and pass items with a validated chain-of-custody.</p>
      </section>
      <div className="card grid">
        <AuthButtons callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
