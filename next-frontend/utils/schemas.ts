/**
 * MoodFit — Client-side Form Validation Schema (Zod)
 * next-frontend/utils/schemas.ts
 */

import { z } from "zod";

export const MoodPredictSchema = z.object({
  text: z
    .string()
    .min(1, { message: "Words field cannot be left empty." })
    .refine(
      (v) => v.trim().split(/\s+/).length >= 3,
      { message: "At least 3 words are required to extract a distinct aesthetic emotion." }
    )
    .refine(
      (v) => v.trim().split(/\s+/).length <= 512,
      { message: "Input exceeds maximum limit of 512 words." }
    ),
});

export type MoodPredictInput = z.infer<typeof MoodPredictSchema>;

export const LoginSchema = z.object({
  email: z.string().email({ message: "Invalid email address format." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters long." }),
});

export type LoginInput = z.infer<typeof LoginSchema>;
