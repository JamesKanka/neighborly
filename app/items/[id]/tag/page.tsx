import Link from "next/link";
import { DirectGoogleSignIn } from "@/components/direct-google-signin";
import { ItemTagActions } from "@/components/item-tag-actions";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { verifyItemTagToken } from "@/lib/item-tag-link";
import { isUserInItemNeighborhood } from "@/lib/neighborhood";
import type { DbItem } from "@/lib/types";

function formatStatus(status: DbItem["status"]) {
  if (status === "checked_out") {
    return "checked out";
  }
  return status.replace("_", " ");
}

export default async function ItemTagPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; preview?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const token = resolvedSearchParams.token;
  const preview = resolvedSearchParams.preview === "1";

  const item = (
    await query<
      DbItem & {
        owner_display_name: string | null;
      }
    >(
      `SELECT i.*, u.display_name AS owner_display_name
       FROM items i
       JOIN users u ON u.id = i.owner_id
       WHERE i.id = $1
       LIMIT 1`,
      [id]
    )
  ).rows[0];

  if (!item) {
    return (
      <div className="card">
        <p>Item not found.</p>
      </div>
    );
  }

  if (!token || !verifyItemTagToken(token, id, item.item_tag_token_version)) {
    return (
      <div className="card grid">
        <h3>Invalid item tag link</h3>
        <p className="meta">Ask the owner for a fresh NFC/QR link for this item.</p>
      </div>
    );
  }

  const user = await getCurrentUser();
  const isOwner = Boolean(user && user.id === item.owner_id);
  const ownerName = item.owner_display_name ?? "the owner";

  if (user && !isUserInItemNeighborhood(user, item)) {
    return (
      <div className="card grid">
        <h3>Link unavailable</h3>
        <p className="meta">This item is outside your neighborhood.</p>
      </div>
    );
  }

  const callbackPath = `/items/${item.id}/tag?token=${encodeURIComponent(token)}`;

  return (
    <div className="grid">
      <section className="page-head grid">
        <p className="eyebrow">NFC / QR Link</p>
        <h1>{item.title}</h1>
        <p className="subtitle">This link is for physical item scans so holders can claim or coordinate quickly.</p>
        <div className="row">
          <span className={`meta-badge status-${item.status}`}>{formatStatus(item.status)}</span>
          <span className="meta-badge">Owner: {ownerName}</span>
          <Link href={`/items/${item.id}`} className="button-link">
            Open Full Item Page
          </Link>
        </div>
      </section>

      {item.photo_url ? <img src={item.photo_url} alt={`${item.title} photo`} className="item-photo" /> : null}

      {!user ? (
        <div className="card grid">
          <h3>Quick Access</h3>
          <p className="meta">
            You can view this page without logging in. When you tap an action, we will ask you to sign in and bring you
            right back here.
          </p>
          <DirectGoogleSignIn callbackUrl={callbackPath} label="Sign in now (optional)" />
        </div>
      ) : null}

      {isOwner && !preview ? (
        <div className="card grid">
          <h3>Owner View</h3>
          <p className="meta">
            This is your tag page. Borrowers scanning your NFC/QR can mark themselves as holder or message you.
          </p>
          <div className="row">
            <Link href={`/items/${item.id}/tag?token=${encodeURIComponent(token)}&preview=1`} className="button-link">
              Preview Borrower View
            </Link>
          </div>
        </div>
      ) : (
        <ItemTagActions
          itemId={item.id}
          token={token}
          canClaim={item.status !== "inactive" && (!isOwner || preview)}
          ownerName={ownerName}
          previewMode={isOwner && preview}
          isAuthenticated={Boolean(user)}
          callbackUrl={callbackPath}
        />
      )}
    </div>
  );
}
