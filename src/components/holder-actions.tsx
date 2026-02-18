"use client";

import { useState } from "react";

export function HolderActions({
  itemId,
  nextRecipient,
  pendingPassTransfer,
  pendingReturnTransfer,
  ownerRequestedReturn,
  ownerName,
  ownerEmail,
  ownerPhone
}: {
  itemId: string;
  nextRecipient?: {
    id: string;
    display_name: string | null;
    email: string;
    phone: string | null;
  } | null;
  pendingPassTransfer?: {
    transfer_id: string;
    to_display_name: string | null;
    to_email: string | null;
    to_phone: string | null;
  } | null;
  pendingReturnTransfer?: {
    transfer_id: string;
  } | null;
  ownerRequestedReturn?: boolean;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [dismissedPendingPassId, setDismissedPendingPassId] = useState<string | null>(null);
  const [localPendingPass, setLocalPendingPass] = useState<{
    transfer_id: string;
    to_display_name: string | null;
    to_email: string | null;
    to_phone: string | null;
  } | null>(null);
  const [localReturnPending, setLocalReturnPending] = useState(false);
  const serverPendingPass =
    pendingPassTransfer && pendingPassTransfer.transfer_id !== dismissedPendingPassId
      ? pendingPassTransfer
      : null;
  const activePendingPass = localPendingPass ?? serverPendingPass ?? null;
  const passPending = Boolean(activePendingPass);
  const returnPending = localReturnPending || Boolean(pendingReturnTransfer);
  const transferPending = passPending || returnPending;

  async function passToNext() {
    setStatus("Creating pass request...");
    const res = await fetch(`/api/items/${itemId}/pass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextRecipient?.id ? { to_user_id: nextRecipient.id } : {})
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Pass failed");
      return;
    }
    setDismissedPendingPassId(null);
    setLocalPendingPass({
      transfer_id: data.transfer_id,
      to_display_name: nextRecipient?.display_name ?? null,
      to_email: nextRecipient?.email ?? null,
      to_phone: nextRecipient?.phone ?? null
    });
    setStatus(typeof data?.email_warning === "string" ? data.email_warning : "Waiting for next recipient to accept");
  }

  async function returnToOwner() {
    setStatus("Requesting return confirmation...");
    const res = await fetch(`/api/items/${itemId}/return`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Return failed");
      return;
    }
    setLocalReturnPending(true);
    setStatus(typeof data?.email_warning === "string" ? data.email_warning : `Return pending (${data.transfer_id})`);
  }

  async function cancelPendingPass() {
    if (!activePendingPass) {
      setStatus("No pending pass found");
      return;
    }

    const recipient = activePendingPass.to_display_name ?? activePendingPass.to_email ?? "next recipient";
    const confirmed = window.confirm(
      `Cancel pending pass to ${recipient}? This will set the item back to checked out with you as holder.`
    );
    if (!confirmed) {
      return;
    }

    setStatus("Cancelling pending pass...");
    try {
      const res = await fetch(`/api/transfers/${activePendingPass.transfer_id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : `Unable to cancel pass (${res.status})`;
        if (res.status === 400 && message.toLowerCase().includes("no longer pending")) {
          setDismissedPendingPassId(activePendingPass.transfer_id);
          setLocalPendingPass(null);
          setStatus("Pass is no longer pending");
          return;
        }
        setStatus(message);
        return;
      }

      setDismissedPendingPassId(activePendingPass.transfer_id);
      setLocalPendingPass(null);
      setStatus("Pass cancelled");
    } catch (error) {
      setStatus("Unable to cancel pass right now");
    }
  }

  async function sendMessageToOwner() {
    if (!message.trim()) {
      setStatus("Enter a message first");
      return;
    }
    setStatus("Sending message to owner...");
    const res = await fetch(`/api/items/${itemId}/message-owner`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Unable to send message");
      return;
    }
    setMessage("");
    setStatus(typeof data?.email_warning === "string" ? data.email_warning : "Message sent to owner");
  }

  return (
    <div className="card grid">
      <h3>Holder Actions</h3>
      {passPending ? (
        <p className="meta">Pass pending: waiting for next recipient to confirm.</p>
      ) : null}
      {returnPending ? (
        <p className="meta">Return pending: waiting for owner confirmation.</p>
      ) : null}
      <div className="waitlist-row holder-box">
        <div className="row between">
          <div className="row">
            <span className="position-pill">{ownerRequestedReturn ? "Owner Requested" : "Next Up"}</span>
            <strong>
              {passPending
                ? activePendingPass?.to_display_name ?? activePendingPass?.to_email ?? "Recipient pending"
                : nextRecipient
                  ? (nextRecipient.display_name ?? nextRecipient.email)
                  : "No one waiting yet"}
            </strong>
          </div>
          <div className="holder-box-actions">
            {passPending ? (
              <>
                <button type="button" disabled>
                  Waiting
                </button>
                {activePendingPass ? (
                  <button type="button" className="secondary" onClick={cancelPendingPass}>
                    Cancel Pass
                  </button>
                ) : null}
              </>
            ) : nextRecipient ? (
              <button type="button" onClick={passToNext} disabled={transferPending}>
                {ownerRequestedReturn ? "Pass to Owner" : "Pass to Next"}
              </button>
            ) : null}
          </div>
        </div>
        {passPending ? (
          <div className="row">
            {activePendingPass?.to_email ? <span className="meta-badge">{activePendingPass.to_email}</span> : null}
            {activePendingPass?.to_phone ? <span className="meta-badge">{activePendingPass.to_phone}</span> : null}
            <span className="meta-badge transfer-pending_accept">Waiting for acceptance</span>
          </div>
        ) : nextRecipient ? (
          <div className="row">
            <span className="meta-badge">{nextRecipient.email}</span>
            {nextRecipient.phone ? <span className="meta-badge">{nextRecipient.phone}</span> : null}
          </div>
        ) : (
          <p className="meta">When someone joins the waitlist, they will appear here.</p>
        )}
      </div>
      <div className="waitlist-row holder-box">
        <div className="row between">
          <div className="row">
            <span className="position-pill">Message Owner</span>
            <strong>Message {ownerName ?? "Owner"}</strong>
          </div>
          <div className="holder-box-actions">
            <button type="button" className="secondary" onClick={returnToOwner} disabled={transferPending}>
              Return to Owner
            </button>
          </div>
        </div>
        <label>
          Message
          <textarea
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Hi, I can return this tomorrow evening..."
          />
        </label>
        <div className="row">
          <button type="button" className="secondary" onClick={sendMessageToOwner}>
            Send Message
          </button>
          {ownerEmail ? (
            <a href={`mailto:${ownerEmail}`} className="button-link">
              Email Owner
            </a>
          ) : null}
          {ownerPhone ? (
            <a href={`tel:${ownerPhone}`} className="button-link">
              Call Owner
            </a>
          ) : null}
        </div>
      </div>
      {status ? <p className="meta">{status}</p> : null}
    </div>
  );
}
