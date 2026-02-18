"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function ItemTagActions({
  itemId,
  token,
  canClaim,
  ownerName,
  previewMode = false,
  isAuthenticated = true,
  callbackUrl
}: {
  itemId: string;
  token: string;
  canClaim: boolean;
  ownerName: string;
  previewMode?: boolean;
  isAuthenticated?: boolean;
  callbackUrl?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [sending, setSending] = useState(false);
  const [claimed, setClaimed] = useState(false);

  async function requireLogin() {
    if (isAuthenticated) {
      return false;
    }
    setStatus("Sign in required. Redirecting...");
    await signIn("google", { callbackUrl: callbackUrl ?? `/items/${itemId}/tag?token=${encodeURIComponent(token)}` });
    return true;
  }

  async function claimHolder() {
    if (!canClaim || claiming || claimed) {
      return;
    }

    if (await requireLogin()) {
      return;
    }

    if (previewMode) {
      setClaimed(true);
      setStatus("Preview only: this is how claim feedback looks");
      return;
    }

    const confirmed = window.confirm("Mark yourself as the current holder for this item?");
    if (!confirmed) {
      return;
    }

    setClaiming(true);
    setStatus("Claiming holder status...");

    const res = await fetch(`/api/items/${itemId}/claim-holder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await res.json().catch(() => ({}));
    setClaiming(false);

    if (!res.ok) {
      setStatus(typeof data?.error === "string" ? data.error : "Unable to claim holder status");
      return;
    }

    if (data.status === "already_holder") {
      setStatus("You are already the current holder. Opening item...");
      router.push(`/items/${itemId}`);
      router.refresh();
      return;
    }

    setStatus("You are now marked as current holder. Opening item...");
    router.push(`/items/${itemId}`);
    router.refresh();
  }

  async function sendMessage() {
    if (sending) {
      return;
    }
    if (await requireLogin()) {
      return;
    }
    if (!message.trim()) {
      setStatus("Enter a message first");
      return;
    }

    if (previewMode) {
      setStatus(`Preview only: message to ${ownerName} would be sent`);
      setMessage("");
      return;
    }

    setSending(true);
    setStatus(`Sending message to ${ownerName}...`);

    const res = await fetch(`/api/items/${itemId}/tag-contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, message: message.trim() })
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);

    if (!res.ok) {
      setStatus(typeof data?.error === "string" ? data.error : "Unable to send message");
      return;
    }

    setMessage("");
    setStatus(typeof data?.email_warning === "string" ? data.email_warning : `Message sent to ${ownerName}`);
  }

  return (
    <div className="card grid">
      <h3>Item Tag Actions</h3>
      {previewMode ? <p className="meta">Preview mode for owner. Actions are disabled from making live changes.</p> : null}
      <p className="meta">Use this page when you physically have the item and need to coordinate with {ownerName}.</p>
      <div className="row">
        <button type="button" onClick={claimHolder} disabled={!canClaim || claiming || claimed}>
          {claimed ? "Claimed" : claiming ? "Claiming..." : "I Have This Item"}
        </button>
      </div>
      <label>
        Message {ownerName}
        <textarea
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="I picked this up and can return it Sunday afternoon."
        />
      </label>
      <div className="row">
        <button type="button" className="secondary" onClick={sendMessage} disabled={sending}>
          {sending ? "Sending..." : `Message ${ownerName}`}
        </button>
      </div>
      {status ? <p className="meta">{status}</p> : null}
    </div>
  );
}
