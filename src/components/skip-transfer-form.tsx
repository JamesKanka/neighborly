"use client";

import { useState } from "react";

export function SkipTransferForm({ transferId, token }: { transferId: string; token: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function skip() {
    setStatus("Skipping...");
    const res = await fetch(`/api/transfers/${transferId}/skip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });

    const data = await res.json();
    setStatus(res.ok ? "You skipped this handoff" : data.error ?? "Unable to skip");
  }

  return (
    <div className="card grid">
      <button onClick={skip} className="warn">
        Skip This Handoff
      </button>
      {status ? <p className="meta">{status}</p> : null}
    </div>
  );
}
