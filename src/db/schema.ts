import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const itemStatusEnum = pgEnum("item_status", ["available", "checked_out", "inactive", "passing", "returning"]);
export const waitlistStatusEnum = pgEnum("waitlist_status", ["waiting", "skipped", "fulfilled", "removed"]);
export const transferTypeEnum = pgEnum("transfer_type", ["create", "checkout", "pass", "return"]);
export const transferStatusEnum = pgEnum("transfer_status", ["pending_accept", "completed", "cancelled", "expired"]);
export const tokenPurposeEnum = pgEnum("token_purpose", ["item_view", "handoff_accept"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  phone: text("phone"),
  neighborhood: text("neighborhood").notNull().default("Ladd Park"),
  tipsEnabled: boolean("tips_enabled").notNull().default(false),
  tipUrl: text("tip_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    pickupArea: text("pickup_area").notNull().default("Ladd Park"),
    photoUrl: text("photo_url"),
    borrowDurationDays: integer("borrow_duration_days").notNull().default(7),
    ownerRequestedReturnAt: timestamp("owner_requested_return_at", { withTimezone: true }),
    itemTagTokenVersion: integer("item_tag_token_version").notNull().default(1),
    itemTagQrCodeUrl: text("item_tag_qr_code_url"),
    status: itemStatusEnum("status").notNull().default("available"),
    currentHolderId: uuid("current_holder_id").references(() => users.id),
    qrCodeUrl: text("qr_code_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("items_borrow_duration_positive", sql`${table.borrowDurationDays} > 0`),
    check("items_item_tag_token_version_positive", sql`${table.itemTagTokenVersion} > 0`),
    index("idx_items_owner").on(table.ownerId),
    index("idx_items_status_category").on(table.status, table.category)
  ]
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: waitlistStatusEnum("status").notNull().default("waiting"),
    position: integer("position"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("waitlist_unique_waiting")
      .on(table.itemId, table.userId)
      .where(sql`${table.status} = 'waiting'`),
    index("idx_waitlist_item_status_created").on(table.itemId, table.status, table.createdAt)
  ]
);

export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id").references(() => users.id),
    toUserId: uuid("to_user_id").references(() => users.id),
    type: transferTypeEnum("type").notNull(),
    status: transferStatusEnum("status").notNull(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`)
  },
  (table) => [index("idx_transfers_item_initiated").on(table.itemId, table.initiatedAt)]
);

export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    transferId: uuid("transfer_id").references(() => transfers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: tokenPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_tokens_item_purpose_expiry").on(table.itemId, table.purpose, table.expiresAt)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_notifications_user_created").on(table.userId, table.createdAt)]
);

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    ratingType: text("rating_type").notNull(),
    score: integer("score").notNull(),
    comment: text("comment"),
    transferId: uuid("transfer_id").references(() => transfers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("ratings_rating_type_check", sql`${table.ratingType} IN ('item', 'person')`),
    check("ratings_score_check", sql`${table.score} BETWEEN 1 AND 5`),
    uniqueIndex("uniq_item_rating_once")
      .on(table.itemId, table.reviewerUserId, table.ratingType)
      .where(sql`${table.ratingType} = 'item'`),
    uniqueIndex("uniq_person_rating_once")
      .on(table.itemId, table.reviewerUserId, table.targetUserId, table.ratingType)
      .where(sql`${table.ratingType} = 'person'`)
  ]
);
