"use client";

import { useEffect, useState } from "react";

interface UserOption {
  id: string;
  display_name: string | null;
  email: string;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ManualTransferControl({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [results, setResults] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setResults([]);
      return;
    }

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const handle = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error ?? "Search failed");
          }
          setResults((data.users as UserOption[]) ?? []);
        })
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : "Search failed");
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 220);

    return () => clearTimeout(handle);
  }, [open, query]);

  async function submit() {
    const value = query.trim();
    if (!value) {
      setStatus("Enter a name or email");
      return;
    }

    const payload: Record<string, string> = {};
    if (selectedUserId) {
      payload.user_id = selectedUserId;
    } else if (isValidEmail(value)) {
      payload.email = value.toLowerCase();
    } else {
      setStatus("Select a suggested user or enter a valid email");
      return;
    }

    setSubmitting(true);
    setStatus("Transferring...");
    const res = await fetch(`/api/items/${itemId}/assign-holder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setStatus(data.error ?? "Unable to transfer");
      return;
    }

    setStatus(data.email_warning ?? "Manual transfer complete");
    window.location.reload();
  }

  return (
    <div className="manual-transfer">
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setOpen((prev) => !prev);
          setStatus(null);
        }}
      >
        Manually Transfer
      </button>
      {open ? (
        <div className="manual-transfer-panel">
          <label>
            Search neighbor or enter email
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedUserId(null);
                setStatus(null);
              }}
              placeholder="Name or email"
            />
          </label>
          {loading ? <p className="meta">Searching...</p> : null}
          {results.length ? (
            <div className="manual-transfer-results">
              {results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={selectedUserId === user.id ? "manual-transfer-option selected" : "manual-transfer-option"}
                  onClick={() => {
                    setSelectedUserId(user.id);
                    setQuery(user.email);
                    setStatus(null);
                  }}
                >
                  <strong>{user.display_name ?? "Neighbor"}</strong>
                  <span className="meta">{user.email}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Transferring..." : "Transfer Now"}
          </button>
          {status ? <p className="meta">{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
