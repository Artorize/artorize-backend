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

const hexHashString = (expectedLength) =>
  z
    .string()
    .regex(
      new RegExp(`^0x[0-9a-fA-F]{${expectedLength}}$`),
      `Must be a hex string with 0x prefix and ${expectedLength} hex characters`
    )
    .optional();

const hashesSchema = z
  .object({
    perceptual_hash: hexHashString(16),
    average_hash: hexHashString(16),
    difference_hash: hexHashString(16),
    wavelet_hash: hexHashString(16),
    color_hash: hexHashString(16),
    blockhash8: hexHashString(16),
    blockhash16: hexHashString(32),
  })
  .optional();

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
  hashes: hashesSchema,
});

const streamQuerySchema = z.object({
  variant: z
    .preprocess((value) => {
      if (typeof value === 'string') {
        return value.trim().toLowerCase();
      }
      return undefined;
    }, z.string().max(50))
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
      z.number().int().min(1).max(10000)
    )
    .optional(),
  skip: z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? undefined : Number(value)),
      z.number().int().min(0).max(5000)
    )
    .optional(),
});

const batchBodySchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  fields: optionalTrimmedString(500),
});

const downloadUrlQuerySchema = z.object({
  variant: z
    .preprocess((value) => {
      if (typeof value === 'string') {
        return value.trim().toLowerCase();
      }
      return undefined;
    }, z.string().max(50))
    .optional(),
  expires: z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? undefined : Number(value)),
      z.number().int().min(60).max(86400)
    )
    .optional(),
});

const maskQuerySchema = z.object({});

const checkExistsQuerySchema = z.object({
  id: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/u, 'id must be a 24 character hex string')
    .optional(),
  checksum: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/u, 'checksum must be a 64 character hex string (SHA256)')
    .optional(),
  title: optionalTrimmedString(200),
  artist: optionalTrimmedString(120),
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
}).refine(
  (data) => data.id || data.checksum || (data.title && data.artist) || (data.tags && data.tags.length > 0),
  {
    message: 'At least one search criteria must be provided: id, checksum, title+artist, or tags',
  }
);

module.exports = {
  uploadArtworkSchema: { body: uploadBodySchema },
  artworkStreamSchema: { params: idParamSchema, query: streamQuerySchema },
  artworkMetadataSchema: { params: idParamSchema },
  artworkSearchSchema: { query: searchQuerySchema },
  batchArtworksSchema: { body: batchBodySchema },
  downloadUrlSchema: { params: idParamSchema, query: downloadUrlQuerySchema },
  checkExistsSchema: { query: checkExistsQuerySchema },
  maskSchema: { params: idParamSchema, query: maskQuerySchema },
};
