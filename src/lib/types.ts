export type ItemStatus = "available" | "checked_out" | "passing" | "returning" | "inactive";
export type WaitlistStatus = "waiting" | "skipped" | "fulfilled" | "removed";
export type TransferType = "create" | "checkout" | "pass" | "return";
export type TransferStatus = "pending_accept" | "completed" | "cancelled" | "expired";
export type RatingType = "item" | "person";

export interface DbUser {
  id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
  neighborhood: string | null;
  tips_enabled: boolean;
  tip_url: string | null;
  created_at: string;
}

export interface DbItem {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  pickup_area: string;
  photo_url: string | null;
  borrow_duration_days: number;
  owner_requested_return_at: string | null;
  item_tag_token_version: number;
  item_tag_qr_code_url: string | null;
  status: ItemStatus;
  current_holder_id: string | null;
  qr_code_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbWaitlistEntry {
  id: string;
  item_id: string;
  user_id: string;
  status: WaitlistStatus;
  position: number | null;
  created_at: string;
}

export interface DbTransfer {
  id: string;
  item_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  type: TransferType;
  status: TransferStatus;
  initiated_at: string;
  accepted_at: string | null;
  metadata: Record<string, unknown>;
}

export interface DbNotification {
  id: string;
  user_id: string;
  item_id: string | null;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface DbRating {
  id: string;
  item_id: string;
  reviewer_user_id: string;
  target_user_id: string | null;
  rating_type: RatingType;
  score: number;
  comment: string | null;
  transfer_id: string | null;
  created_at: string;
}
