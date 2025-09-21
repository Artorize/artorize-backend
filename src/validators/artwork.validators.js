const { z } = require('zod');

const optionalTrimmedString = (maxLength) =>
  z
    .preprocess((value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }, z.string().max(maxLength))
    .optional();

const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/u, 'id must be a 24 character hex string'),
});

const uploadBodySchema = z.object({
  title: optionalTrimmedString(200),
  artist: optionalTrimmedString(120),
  description: optionalTrimmedString(2000),
  createdAt: optionalTrimmedString(50),
  tags: z
    .preprocess((value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
      return [];
    }, z.array(z.string().min(1).max(50)).max(25))
    .optional(),
  extra: optionalTrimmedString(5000),
});

const streamQuerySchema = z.object({
  variant: z
    .preprocess((value) => {
      if (typeof value === 'string') {
        return value.trim().toLowerCase();
      }
      return undefined;
    }, z.enum(['original', 'webp', 'thumbnail']))
    .optional(),
});

const searchQuerySchema = z.object({
  artist: optionalTrimmedString(120),
  q: optionalTrimmedString(200),
  tags: z
    .preprocess((value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
      return [];
    }, z.array(z.string().min(1).max(50)).max(25))
    .optional(),
  limit: z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? undefined : Number(value)),
      z.number().int().min(1).max(100)
    )
    .optional(),
  skip: z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? undefined : Number(value)),
      z.number().int().min(0).max(5000)
    )
    .optional(),
});

module.exports = {
  uploadArtworkSchema: { body: uploadBodySchema },
  artworkStreamSchema: { params: idParamSchema, query: streamQuerySchema },
  artworkMetadataSchema: { params: idParamSchema },
  artworkSearchSchema: { query: searchQuerySchema },
};
