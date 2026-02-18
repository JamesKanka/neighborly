"use client";

import { useState } from "react";
import { DEFAULT_NEIGHBORHOOD } from "@/lib/neighborhood";

export function AddItemForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setMessage(null);

    const payload = {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      category: String(formData.get("category") ?? ""),
      borrow_duration_days: Number(formData.get("borrow_duration_days") ?? 7),
      photo_url: String(formData.get("photo_url") ?? ""),
      photo_data_url: photoDataUrl ?? undefined
    };

    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(data.error ?? "Failed to create item");
      return;
    }

    setMessage(`Created. Item link: ${data.item_url}`);
  }

  return (
    <form
      className="card grid"
      action={(formData) => {
        void onSubmit(formData);
      }}
    >
      <label>
        Title
        <input name="title" required />
      </label>
      <label>
        Category
        <input name="category" required />
      </label>
      <label>
        Description
        <textarea name="description" rows={4} required />
      </label>
      <label>
        Neighborhood
        <input value={DEFAULT_NEIGHBORHOOD} readOnly />
      </label>
      <label>
        Borrow Duration (days)
        <input name="borrow_duration_days" type="number" min={1} max={365} defaultValue={7} required />
      </label>
      <label>
        Photo URL (optional)
        <input name="photo_url" placeholder="https://..." />
      </label>
      <label>
        Or upload photo
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
            reader.onload = () => setPhotoDataUrl(typeof reader.result === "string" ? reader.result : null);
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {photoDataUrl ? <img src={photoDataUrl} alt="Preview" className="item-photo" /> : null}
      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create Item"}
      </button>
      {message ? <p className="meta">{message}</p> : null}
    </form>
  );
}
