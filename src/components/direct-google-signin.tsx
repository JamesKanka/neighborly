"use client";

import { signIn } from "next-auth/react";

export function DirectGoogleSignIn({ callbackUrl, label }: { callbackUrl: string; label?: string }) {
  return (
    <button
      type="button"
      className="button-link btn-like-link"
      onClick={() => {
        void signIn("google", { callbackUrl });
      }}
    >
      {label ?? "Sign in"}
    </button>
  );
}
