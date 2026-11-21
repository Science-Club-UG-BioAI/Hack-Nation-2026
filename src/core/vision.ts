import { z } from "zod";
import { imageContextSchema, verifyInputSchema } from "./contracts";

export const imageMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const imageDescriptionSchema = z.object({
  description: imageContextSchema,
  suggestedClaim: verifyInputSchema.shape.claim.nullable(),
});
export type ImageDescription = z.infer<typeof imageDescriptionSchema>;
export type ImageMime = z.infer<typeof imageMimeSchema>;
