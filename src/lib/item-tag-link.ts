import crypto from "crypto";

interface ItemTagPayload {
  item_id: string;
  purpose: "item_tag";
}

function getItemTagSecret() {
  const secret = process.env.ITEM_TAG_LINK_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("ITEM_TAG_LINK_SECRET or NEXTAUTH_SECRET is required");
  }
  return secret;
}

function encodeJson(value: ItemTagPayload) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(payload: string): ItemTagPayload | null {
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { item_id?: unknown; purpose?: unknown };
    if (parsed && typeof parsed.item_id === "string" && parsed.purpose === "item_tag") {
      return {
        item_id: parsed.item_id,
        purpose: "item_tag"
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getItemTagSecret()).update(payload).digest("base64url");
}

export function createItemTagToken(itemId: string, _version?: number) {
  const payload = encodeJson({
    item_id: itemId,
    purpose: "item_tag"
  });
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyItemTagToken(token: string, itemId: string, _version?: number) {
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) {
    return false;
  }

  const parsed = decodeJson(payload);
  if (!parsed || parsed.item_id !== itemId || parsed.purpose !== "item_tag") {
    return false;
  }

  const expectedSignature = signPayload(payload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}
