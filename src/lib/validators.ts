import { z } from "zod";

const itemBaseSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(2).max(2000),
  category: z.string().min(2).max(80),
  borrow_duration_days: z.number().int().positive().max(365).default(7),
  photo_url: z.string().url().max(5000).optional().or(z.literal(""))
});

export const itemCreateSchema = itemBaseSchema.extend({
  photo_data_url: z.string().max(2000000).optional()
});

export const itemUpdateSchema = itemBaseSchema.partial().extend({
  pickup_area: z.string().min(2).max(120).optional(),
  photo_data_url: z.string().max(2000000).optional()
});

export const waitlistJoinSchema = z.object({
  phone: z.string().min(7).max(30).optional(),
  display_name: z.string().min(2).max(120).optional()
});

export const checkoutSchema = z.object({
  to_user_id: z.string().uuid()
});

export const passSchema = z.object({
  to_user_id: z.string().uuid().optional()
});

export const assignHolderSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    email: z.string().email().max(320).optional()
  })
  .refine((value) => Boolean(value.user_id || value.email), {
    message: "Provide user_id or email"
  });

export const transferAcceptSchema = z.object({
  token: z.string().min(10)
});

export const itemTagTokenSchema = z.object({
  token: z.string().min(20)
});

export const itemTagContactSchema = itemTagTokenSchema.extend({
  message: z.string().min(2).max(1000)
});

export const rateItemSchema = z.object({
  rating_type: z.enum(["item", "person"]),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  target_user_id: z.string().uuid().optional()
});

export const messageOwnerSchema = z.object({
  message: z.string().min(2).max(1000)
});
