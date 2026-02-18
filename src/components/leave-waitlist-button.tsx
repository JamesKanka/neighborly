"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeaveWaitlistButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function leaveWaitlist() {
    if (leaving) {
      return;
    }

    setLeaving(true);
    setStatus("Removing...");

    const res = await fetch(`/api/items/${itemId}/waitlist/me`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLeaving(false);
      setStatus(typeof data?.error === "string" ? data.error : "Unable to leave waitlist");
      return;
    }

    setStatus("Removed");
    router.refresh();
  }

  return (
    <div className="row">
      <button type="button" className="secondary" onClick={leaveWaitlist} disabled={leaving}>
        {leaving ? "Removing..." : "Leave Waitlist"}
      </button>
      {status ? <span className="meta">{status}</span> : null}
    </div>
  );
}
