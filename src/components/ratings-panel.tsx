"use client";

import { useEffect, useState } from "react";

interface RatingsPanelProps {
  itemId: string;
  personOptions: Array<{ id: string; name: string }>;
}

interface RatingRow {
  id: string;
  rating_type: "item" | "person";
  score: number;
  comment: string | null;
  reviewer_name: string | null;
  target_name: string | null;
}

export function RatingsPanel({ itemId, personOptions }: RatingsPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [score, setScore] = useState(5);
  const [ratingType, setRatingType] = useState<"item" | "person">("item");
  const [targetUserId, setTargetUserId] = useState(personOptions[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [avg, setAvg] = useState<number | null>(null);
  const [rows, setRows] = useState<RatingRow[]>([]);

  async function refresh() {
    const res = await fetch(`/api/items/${itemId}/ratings`);
    const data = await res.json();
    if (res.ok) {
      setAvg(data.avg_item_rating);
      setRows(data.ratings ?? []);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  async function submitRating() {
    setStatus("Submitting rating...");
    const payload = {
      rating_type: ratingType,
      score,
      comment: comment.trim() || undefined,
      target_user_id: ratingType === "person" ? targetUserId : undefined
    };

    const res = await fetch(`/api/items/${itemId}/ratings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Unable to submit rating");
      return;
    }

    setStatus("Rating submitted");
    setComment("");
    await refresh();
  }

  return (
    <div className="card grid">
      <h3>Ratings</h3>
      <p className="meta">Item average: {avg ?? "No ratings yet"}</p>
      <label>
        Type
        <select value={ratingType} onChange={(event) => setRatingType(event.target.value as "item" | "person")}>
          <option value="item">Rate item</option>
          <option value="person">Rate person</option>
        </select>
      </label>
      {ratingType === "person" ? (
        <label>
          Person
          <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
            <option value="">Select person</option>
            {personOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Score
        <input
          type="number"
          min={1}
          max={5}
          value={score}
          onChange={(event) => setScore(Number(event.target.value || 5))}
        />
      </label>
      <label>
        Comment (optional)
        <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      <button type="button" onClick={submitRating}>
        Submit Rating
      </button>
      {status ? <p className="meta">{status}</p> : null}
      <div className="list-stack">
        {rows.map((row) => (
          <div className="list-row meta" key={row.id}>
            {row.rating_type} | {row.score}/5 | by {row.reviewer_name ?? "User"}
            {row.target_name ? ` to ${row.target_name}` : ""}
            {row.comment ? ` | ${row.comment}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
