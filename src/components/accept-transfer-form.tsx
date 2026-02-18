"use client";

import { useState } from "react";

export function AcceptTransferForm({ transferId, token }: { transferId: string; token: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function accept() {
    setStatus("Accepting...");
    const res = await fetch(`/api/transfers/${transferId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });

    const data = await res.json();
    setStatus(res.ok ? `Accepted (${data.transfer_id})` : data.error ?? "Unable to accept");
  }

  return (
    <div className="card grid">
      <button onClick={accept}>Accept Handoff</button>
      {status ? <p className="meta">{status}</p> : null}
    </div>
  );
}
