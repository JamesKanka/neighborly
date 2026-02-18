import Link from "next/link";
import { AuthButtons } from "@/components/auth-buttons";
import { getCurrentUser } from "@/lib/auth";

export async function Nav() {
  const user = await getCurrentUser();

  return (
    <header className="nav-shell">
      <div className="nav-top">
        <Link href="/" className="brand">
          Neighborly
        </Link>
        <div className="row">
          <span className="user-chip">{user?.display_name ?? user?.email ?? "Signed out"}</span>
          <AuthButtons />
        </div>
      </div>
      <nav className="tabs">
        <Link href="/">Browse</Link>
        <Link href="/my-items">My Items</Link>
        <Link href="/waitlist">Waitlist</Link>
        <Link href="/holding">Holding</Link>
        <Link href="/profile">Profile</Link>
      </nav>
    </header>
  );
}
