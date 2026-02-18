"use client";

import { useState } from "react";

export function ShareActions({
  itemId,
  qrCodeUrl,
  itemTagLink,
  itemTagQrCodeUrl,
  inline = false
}: {
  itemId: string;
  qrCodeUrl: string | null;
  itemTagLink?: string | null;
  itemTagQrCodeUrl?: string | null;
  inline?: boolean;
}) {
  const [status, setStatus] = useState<string | null>(null);

  async function copyLink() {
    const link = `${window.location.origin}/items/${itemId}`;
    await navigator.clipboard.writeText(link);
    setStatus("Item link copied");
  }

  async function copyItemTagLink() {
    if (!itemTagLink) {
      setStatus("Item tag link is only available to owner");
      return;
    }
    await navigator.clipboard.writeText(itemTagLink);
    setStatus("Item tag link copied");
  }

  function downloadQr() {
    if (!qrCodeUrl) {
      setStatus("No QR image available");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = qrCodeUrl;
    anchor.download = `neighborly-item-${itemId}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setStatus("QR downloaded");
  }

  function downloadItemTagQr() {
    if (!itemTagQrCodeUrl) {
      setStatus("No item tag QR available");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = itemTagQrCodeUrl;
    anchor.download = `neighborly-item-tag-${itemId}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setStatus("Item tag QR downloaded");
  }

  if (inline) {
    return (
      <div className="share-inline">
        <div className="row">
          <button type="button" onClick={copyLink}>
            Copy Link
          </button>
          <button type="button" className="secondary" onClick={downloadQr}>
            Download QR
          </button>
        </div>
        {itemTagLink ? (
          <>
            <p className="meta">Owner-only NFC/QR link</p>
            <div className="row">
              <button type="button" className="secondary" onClick={copyItemTagLink}>
                Copy Item Tag Link
              </button>
              <button type="button" className="secondary" onClick={downloadItemTagQr}>
                Download Item Tag QR
              </button>
            </div>
          </>
        ) : null}
        {status ? <p className="meta">{status}</p> : null}
      </div>
    );
  }

  return (
    <div className="card grid">
      <h3>Share</h3>
      <div className="row">
        <button type="button" onClick={copyLink}>
          Copy Link
        </button>
        <button type="button" className="secondary" onClick={downloadQr}>
          Download QR
        </button>
      </div>
      {itemTagLink ? (
        <>
          <p className="meta">Owner-only NFC/QR link</p>
          <div className="row">
            <button type="button" className="secondary" onClick={copyItemTagLink}>
              Copy Item Tag Link
            </button>
            <button type="button" className="secondary" onClick={downloadItemTagQr}>
              Download Item Tag QR
            </button>
          </div>
        </>
      ) : null}
      {status ? <p className="meta">{status}</p> : null}
    </div>
  );
}
