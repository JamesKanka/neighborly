import type { DbUser } from "@/lib/types";

export const DEFAULT_NEIGHBORHOOD = "Ladd Park";

export function normalizeNeighborhood(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_NEIGHBORHOOD;
}

export function getUserNeighborhood(user: Pick<DbUser, "neighborhood">) {
  return normalizeNeighborhood(user.neighborhood);
}

export function isUserInItemNeighborhood(
  user: Pick<DbUser, "neighborhood">,
  item: { pickup_area: string | null | undefined }
) {
  return normalizeNeighborhood(item.pickup_area) === getUserNeighborhood(user);
}
