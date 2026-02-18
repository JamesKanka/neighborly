import type { DbItem, DbTransfer, DbUser } from "@/lib/types";

interface JoinedItem extends DbItem {
  owner_display_name: string | null;
  waitlist_count?: string | number;
  avg_item_rating?: string | number | null;
  checkout_count?: string | number;
}

export function serializePublicItem(item: JoinedItem) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    photo_url: item.photo_url,
    borrow_duration_days: item.borrow_duration_days,
    waitlist_count: Number(item.waitlist_count ?? 0),
    checkout_count: Number(item.checkout_count ?? 0),
    avg_item_rating:
      item.avg_item_rating === null || item.avg_item_rating === undefined
        ? null
        : Number(item.avg_item_rating),
    status: item.status,
    qr_code_url: item.qr_code_url,
    owner_display_name: item.owner_display_name,
    created_at: item.created_at,
    updated_at: item.updated_at
  };
}

export function serializeOwnerView(item: JoinedItem, holder: DbUser | null, transfers: DbTransfer[]) {
  return {
    ...serializePublicItem(item),
    current_holder: holder
      ? {
          id: holder.id,
          display_name: holder.display_name,
          email: holder.email,
          phone: holder.phone,
          neighborhood: holder.neighborhood
        }
      : null,
    transfer_history: transfers
  };
}

export function serializeHolderView(item: JoinedItem, nextRecipient: DbUser | null) {
  return {
    ...serializePublicItem(item),
    next_up: nextRecipient
      ? {
          id: nextRecipient.id,
          display_name: nextRecipient.display_name,
          email: nextRecipient.email,
          phone: nextRecipient.phone
        }
      : null
  };
}
