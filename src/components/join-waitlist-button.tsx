"use client";

import { useEffect, useMemo, useState } from "react";

export function JoinWaitlistButton({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [aheadCount, setAheadCount] = useState<number | null>(null);
  const [requiresProfile, setRequiresProfile] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");

  async function refreshWaitlist() {
    const res = await fetch(`/api/items/${itemId}/waitlist`);
    const data = await res.json();
    if (res.ok && data.role === "public") {
      setOnWaitlist(Boolean(data.on_waitlist));
      setAheadCount(typeof data.ahead_count === "number" ? data.ahead_count : null);
    }
  }

  async function refreshProfileRequirement() {
    const res = await fetch("/api/profile");
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.user) {
      return;
    }

    const name = data.user.display_name ?? "";
    const nextPhone = data.user.phone ?? "";
    setDisplayName(name);
    setPhone(nextPhone);
    setRequiresProfile(!(name && nextPhone));
  }

  useEffect(() => {
    void (async () => {
      await Promise.all([refreshWaitlist(), refreshProfileRequirement()]);
      setLoadingState(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const aheadLabel = useMemo(() => {
    if (aheadCount === null) {
      return "Position unavailable";
    }
    if (aheadCount === 0) {
      return "You are next";
    }
    if (aheadCount <= 2) {
      return "About 1-2 people ahead";
    }
    if (aheadCount <= 5) {
      return "About 3-5 people ahead";
    }
    return "5+ people ahead";
  }, [aheadCount]);

  async function join(payload?: { display_name?: string; phone?: string }) {
    setStatus("Joining...");
    const res = await fetch(`/api/items/${itemId}/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {})
    });

    const data = await res.json();
    if (!res.ok) {
      const message = String(data.error ?? "");
      if (message.toLowerCase().includes("requires name and phone")) {
        setRequiresProfile(true);
        setStatus("Please add name and phone to join this waitlist.");
        return;
      }
      setStatus(data.error ?? "Unable to join");
      return;
    }

    setStatus("Added to waitlist");
    setRequiresProfile(false);
    await refreshWaitlist();
  }

  async function joinWithProfile() {
    if (!displayName.trim() || !phone.trim()) {
      setStatus("Name and phone are required");
      return;
    }
    await join({
      display_name: displayName.trim(),
      phone: phone.trim()
    });
  }

  async function leave() {
    setStatus("Leaving...");
    const res = await fetch(`/api/items/${itemId}/waitlist/me`, {
      method: "DELETE"
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Unable to leave waitlist");
      return;
    }

    setStatus("Left waitlist");
    await refreshWaitlist();
  }

  return (
    <div className="card grid">
      <h3>Request this item</h3>
      {loadingState ? <p className="meta">Loading waitlist status...</p> : null}
      {!loadingState ? (
        <div className="list-row meta">
          {onWaitlist ? `You are on the waitlist. ${aheadLabel}.` : "You are not on the waitlist yet."}
        </div>
      ) : null}
      {!onWaitlist && requiresProfile ? (
        <div className="grid">
          <p className="meta">Quick profile step: add your name and phone, then we will join the waitlist.</p>
          <label>
            Name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <div className="row">
            <button onClick={joinWithProfile}>Save & Join Waitlist</button>
          </div>
        </div>
      ) : null}
      <div className="row">
        {!onWaitlist && !requiresProfile ? <button onClick={() => void join()}>Join Waitlist</button> : null}
        {onWaitlist ? (
          <button className="secondary" onClick={leave}>
            Leave Waitlist
          </button>
        ) : null}
        {status ? <span className="meta">{status}</span> : null}
      </div>
    </div>
  );
}
