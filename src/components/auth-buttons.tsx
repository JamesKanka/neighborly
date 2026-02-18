"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

export function AuthButtons({ callbackUrl }: { callbackUrl?: string }) {
  const { data } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPathWithQuery = (() => {
    if (!pathname || pathname === "/auth/signin") {
      return "/";
    }
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  })();

  const signInTarget = callbackUrl || currentPathWithQuery;

  if (data?.user?.email) {
    return (
      <button className="secondary" onClick={() => signOut({ callbackUrl: "/auth/signin" })}>
        Sign out
      </button>
    );
  }

  return <button onClick={() => signIn("google", { callbackUrl: signInTarget })}>Continue with Google</button>;
}
