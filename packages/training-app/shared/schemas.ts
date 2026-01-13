import { z } from "zod";

export const userSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
  createdAt: z.coerce.date(),
});

export const createUserSchema = userSchema.omit({ id: true, createdAt: true });

export const updateUserSchema = createUserSchema.partial();

export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  });
