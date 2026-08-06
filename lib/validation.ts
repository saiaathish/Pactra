import { z } from "zod";

/**
 * Zod validation schemas at API boundaries. Every protected route validates
 * its input before touching MongoDB or Firebase Storage.
 */

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const bootstrapSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(100).optional(),
  photoUrl: z.string().url().optional().nullable(),
});

export const sessionCreateSchema = z.object({
  idToken: z.string().min(10),
});

export const sponsorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const sponsorUpdateSchema = sponsorCreateSchema.partial();

export const briefCreateSchema = z.object({
  sponsorId: objectIdSchema,
  name: z.string().min(1).max(200),
});

export const requirementPatchSchema = z.object({
  requirements: z
    .array(
      z.object({
        id: objectIdSchema.optional(), // present when editing an existing draft
        type: z.enum([
          "segment_placement",
          "segment_duration",
          "required_phrase",
          "required_meaning",
          "forbidden_claim",
          "spoken_disclosure",
          "description_disclosure",
          "description_url",
          "discount_code",
          "logo_visibility",
          "human_review",
        ]),
        description: z.string().min(1).max(500),
        parameters: z.record(z.unknown()).default({}),
        verificationMode: z.enum([
          "deterministic",
          "semantic_with_evidence",
          "visual_with_evidence",
          "human_required",
        ]),
        sourcePage: z.number().int().min(1).optional().nullable(),
        sourceQuote: z.string().max(1000).optional().nullable(),
      })
    )
    .min(1)
    .max(100),
  deletedIds: z.array(objectIdSchema).default([]),
});

export const campaignCreateSchema = z.object({
  sponsorId: objectIdSchema,
  briefVersionId: objectIdSchema,
  name: z.string().min(1).max(200),
  plannedTitle: z.string().max(300).optional().nullable(),
  plannedDescription: z.string().max(5000).optional().nullable(),
  assignedYoutubeVideoId: z.string().min(1).max(100).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

export const campaignUpdateSchema = campaignCreateSchema.partial();

export const videoAssetInitSchema = z.object({
  campaignId: objectIdSchema,
  originalFilename: z.string().min(1).max(300),
  contentType: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
});

export const videoAssetCompleteSchema = z.object({
  videoAssetId: objectIdSchema,
  storagePath: z.string().min(1).max(1000),
});

export const analyzeSchema = z.object({
  campaignId: objectIdSchema,
  videoAssetId: objectIdSchema,
  descriptionSnapshot: z.string().max(5000).optional().default(""),
});

export const syncSchema = z.object({});

export const youtubeVideosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
