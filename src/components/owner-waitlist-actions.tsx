"use client";

import { useMemo, useState } from "react";

interface WaitlistEntry {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string;
  phone: string | null;
  email: string;
  status: "waiting" | "fulfilled";
}

interface PendingOffer {
  transfer_id: string;
  to_user_id: string;
}

export function OwnerWaitlistActions({
  itemId,
  entries,
  pendingOffers
}: {
  itemId: string;
  entries: WaitlistEntry[];
  pendingOffers: PendingOffer[];
}) {
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const pendingByUser = useMemo(() => {
    const mapping = new Map<string, string>();
    for (const offer of pendingOffers) {
      if (!mapping.has(offer.to_user_id)) {
        mapping.set(offer.to_user_id, offer.transfer_id);
      }
    }
    return mapping;
  }, [pendingOffers]);

  async function offerToUser(userId: string) {
    setBusyUserId(userId);
    setStatus("Sending offer...");

    const res = await fetch(`/api/items/${itemId}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to_user_id: userId })
    });
    const data = await res.json();
    setBusyUserId(null);

    if (!res.ok) {
      setStatus(data.error ?? "Unable to send offer");
      return;
    }

    setStatus(typeof data?.email_warning === "string" ? data.email_warning : "Offer sent");
    window.location.reload();
  }

  async function cancelOffer(transferId: string, userId: string) {
    setBusyUserId(userId);
    setStatus("Cancelling offer...");

    const res = await fetch(`/api/transfers/${transferId}/cancel`, { method: "POST" });
    const data = await res.json();
    setBusyUserId(null);

    if (!res.ok) {
      setStatus(data.error ?? "Unable to cancel");
      return;
    }

    setStatus("Offer cancelled");
    window.location.reload();
  }

  return (
    <div className="card grid">
      <h3>Waitlist</h3>
      {entries.length ? (
        <div className="waitlist-list">
          {(() => {
            let waitingPosition = 0;
            return entries.map((entry) => {
              const positionLabel = entry.status === "waiting" ? `#${(waitingPosition += 1)}` : "Accepted";
              const pendingTransferId = pendingByUser.get(entry.user_id) ?? null;
              return (
                <div key={entry.id} className="waitlist-row">
                  <div className="row between">
                    <div className="row">
                      <span className="position-pill">{positionLabel}</span>
                      <strong>{entry.display_name ?? entry.user_id.slice(0, 8)}</strong>
                    </div>
                    <span className="meta">Joined {new Date(entry.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="row between">
                    <div className="row">
                      <span className="meta-badge">{entry.email}</span>
                      <span className="meta-badge">{entry.phone ?? "No phone"}</span>
                    </div>
                    {entry.status === "fulfilled" ? (
                      <span className="meta-badge transfer-completed">Accepted</span>
                    ) : pendingTransferId ? (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyUserId === entry.user_id}
                        onClick={() => void cancelOffer(pendingTransferId, entry.user_id)}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyUserId === entry.user_id}
                        onClick={() => void offerToUser(entry.user_id)}
                      >
                        Offer
                      </button>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <p className="meta">No waiting users.</p>
      )}
      {status ? <p className="meta">{status}</p> : null}
    </div>
  );
}
