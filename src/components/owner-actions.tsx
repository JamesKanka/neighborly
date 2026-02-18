"use client";

import { useState } from "react";

export function OwnerActions({
  itemId,
  hasPendingReturn,
  hasCurrentHolder,
  itemStatus,
  initialTitle,
  initialDescription,
  initialCategory,
  initialBorrowDurationDays,
  initialPhotoUrl
}: {
  itemId: string;
  hasPendingReturn: boolean;
  hasCurrentHolder: boolean;
  itemStatus: "available" | "checked_out" | "passing" | "returning" | "inactive";
  initialTitle: string;
  initialDescription: string;
  initialCategory: string;
  initialBorrowDurationDays: number;
  initialPhotoUrl: string | null;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(initialCategory);
  const [borrowDurationDays, setBorrowDurationDays] = useState(initialBorrowDurationDays);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl ?? "");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const canDeactivate = itemStatus === "available";
  const normalizedInitialPhotoUrl = initialPhotoUrl ?? "";
  const normalizedPhotoUrl = photoUrl.trim();
  const hasEditChanges =
    title !== initialTitle ||
    description !== initialDescription ||
    category !== initialCategory ||
    borrowDurationDays !== initialBorrowDurationDays ||
    normalizedPhotoUrl !== normalizedInitialPhotoUrl ||
    Boolean(photoDataUrl);
  const hasValidBorrowDuration = Number.isInteger(borrowDurationDays) && borrowDurationDays > 0;

  async function deactivate() {
    setStatus("Deactivating...");
    const res = await fetch(`/api/items/${itemId}/deactivate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setStatus("Item deactivated");
      window.location.reload();
      return;
    }
    setStatus(data.error ?? "Failed");
  }

  async function activate() {
    setStatus("Re-activating...");
    const res = await fetch(`/api/items/${itemId}/activate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setStatus("Item is available again");
      window.location.reload();
      return;
    }
    setStatus(data.error ?? "Failed");
  }

  async function saveEdits() {
    if (!hasEditChanges) {
      setStatus("No changes to save");
      return;
    }

    if (!hasValidBorrowDuration) {
      setStatus("Borrow duration must be at least 1 day");
      return;
    }

    const payload: Record<string, unknown> = {};
    if (title !== initialTitle) {
      payload.title = title;
    }
    if (description !== initialDescription) {
      payload.description = description;
    }
    if (category !== initialCategory) {
      payload.category = category;
    }
    if (borrowDurationDays !== initialBorrowDurationDays) {
      payload.borrow_duration_days = borrowDurationDays;
    }
    if (photoDataUrl) {
      payload.photo_data_url = photoDataUrl;
    } else if (normalizedPhotoUrl !== normalizedInitialPhotoUrl) {
      payload.photo_url = normalizedPhotoUrl;
    }

    setSavingEdits(true);
    setStatus("Saving item edits...");
    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    setSavingEdits(false);
    if (res.ok) {
      setStatus("Item updated");
      window.location.reload();
      return;
    }
    setStatus(data.error ?? "Failed to update item");
  }

  async function confirmReturn() {
    setStatus("Confirming return...");
    const res = await fetch(`/api/items/${itemId}/return/confirm`, { method: "POST" });
    const data = await res.json();
    setStatus(res.ok ? `Return confirmed (${data.transfer_id})` : data.error ?? "Failed");
  }

  async function requestReturn() {
    setStatus("Requesting return from holder...");
    const res = await fetch(`/api/items/${itemId}/request-return`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Failed");
      return;
    }
    setStatus(typeof data?.email_warning === "string" ? data.email_warning : "Return request sent to current holder");
  }

  async function manualCheckIn() {
    setStatus("Checking item in...");
    const res = await fetch(`/api/items/${itemId}/checkin`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setStatus("Item checked in");
      window.location.reload();
      return;
    }
    setStatus(data.error ?? "Failed to check in");
  }

  return (
    <div className="card grid">
      <h3>Owner Actions</h3>
      <div className="owner-actions-line">
        <button type="button" className="secondary" onClick={() => setShowEdit((prev) => !prev)}>
          {showEdit ? "Hide Edit" : "Edit"}
        </button>
        {hasCurrentHolder ? (
          <button type="button" className="secondary" onClick={manualCheckIn}>
            Manual Check-in
          </button>
        ) : null}
        {hasCurrentHolder ? (
          <button type="button" className="secondary" onClick={requestReturn}>
            Request Item Back
          </button>
        ) : null}
        {itemStatus !== "inactive" ? (
          <button type="button" className="warn" onClick={deactivate} disabled={!canDeactivate}>
            Deactivate
          </button>
        ) : (
          <button type="button" className="secondary" onClick={activate}>
            Make Available
          </button>
        )}
        {hasPendingReturn ? (
          <button type="button" className="secondary" onClick={confirmReturn}>
            Confirm Return
          </button>
        ) : null}
      </div>
      {showEdit ? (
        <>
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Category
            <input value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
          <label>
            Description
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label>
            Borrow Duration (days)
            <input
              type="number"
              min={1}
              max={365}
              value={borrowDurationDays}
              onChange={(event) => setBorrowDurationDays(Number(event.target.value || 1))}
            />
          </label>
          <label>
            Photo URL
            <input
              value={photoUrl}
              onChange={(event) => {
                setPhotoUrl(event.target.value);
                setPhotoDataUrl(null);
              }}
              placeholder="https://... (leave blank to remove)"
            />
          </label>
          <label>
            Or upload a new photo
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setPhotoDataUrl(null);
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  setPhotoDataUrl(typeof reader.result === "string" ? reader.result : null);
                  setStatus(null);
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {photoDataUrl ? <img src={photoDataUrl} alt="New photo preview" className="item-photo" /> : null}
          <div className="row">
            <button
              type="button"
              onClick={saveEdits}
              disabled={!hasEditChanges || !hasValidBorrowDuration || savingEdits}
            >
              {savingEdits ? "Saving..." : "Save Edits"}
            </button>
          </div>
        </>
      ) : null}
      {!canDeactivate && itemStatus !== "inactive" ? (
        <p className="meta">Item can only be deactivated when it is available.</p>
      ) : null}
      {status ? <p className="meta">{status}</p> : null}
    </div>
  );
}
