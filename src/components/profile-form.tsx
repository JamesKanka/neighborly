"use client";

import { useState, type FormEvent } from "react";
import { DEFAULT_NEIGHBORHOOD } from "@/lib/neighborhood";

interface ProfileFormProps {
  initialName: string;
  initialPhone: string;
  initialNeighborhood: string;
  initialTipsEnabled: boolean;
  initialTipUrl: string;
}

export function ProfileForm(props: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(props.initialName);
  const [phone, setPhone] = useState(props.initialPhone);
  const [tipsEnabled, setTipsEnabled] = useState(props.initialTipsEnabled);
  const [tipUrl, setTipUrl] = useState(props.initialTipUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasChanges =
    displayName !== props.initialName ||
    phone !== props.initialPhone ||
    tipsEnabled !== props.initialTipsEnabled ||
    tipUrl !== props.initialTipUrl;

  const canSave = Boolean(displayName.trim().length >= 2 && phone.trim().length >= 7 && hasChanges && !saving);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    setSaving(true);
    setStatus("Saving...");

    const payload = {
      display_name: displayName.trim(),
      phone: phone.trim(),
      tips_enabled: tipsEnabled,
      tip_url: tipUrl.trim()
    };

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Failed to save");
      setSaving(false);
      return;
    }

    setStatus("Saved");
    setSaving(false);
    window.location.reload();
  }

  return (
    <form className="profile-form card grid" onSubmit={onSubmit}>
      <section className="profile-section grid">
        <h3>Contact</h3>
        <p className="meta">Used for waitlists and coordinating handoffs.</p>
        <label>
          Name
          <input name="display_name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </label>
        <label>
          Phone
          <input name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        </label>
      </section>

      <section className="profile-section grid">
        <h3>Neighborhood</h3>
        <p className="meta">You are currently scoped to one neighborhood.</p>
        <label>
          Neighborhood
          <input value={props.initialNeighborhood || DEFAULT_NEIGHBORHOOD} readOnly />
        </label>
      </section>

      <section className="profile-section grid">
        <h3>Tips</h3>
        <label className="row profile-toggle">
          <input
            name="tips_enabled"
            type="checkbox"
            checked={tipsEnabled}
            onChange={(event) => setTipsEnabled(event.target.checked)}
          />
          <span>Allow neighbors to donate after a successful handoff</span>
        </label>
        <label>
          Donation link (Venmo/PayPal/Cash App URL)
          <input
            name="tip_url"
            value={tipUrl}
            onChange={(event) => setTipUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>
      </section>

      <div className="profile-form-footer row between">
        <span className="meta">{status ?? "Update details anytime."}</span>
        <button type="submit" disabled={!canSave}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
