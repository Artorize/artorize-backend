const { z } = require('zod');

/**
 * Validates a hex hash string with 0x prefix
 * @param {number} expectedLength - Expected hex string length (characters after 0x)
 */
const hexHashString = (expectedLength) =>
  z
    .string()
    .regex(
      new RegExp(`^0x[0-9a-fA-F]{${expectedLength}}$`),
      `Must be a hex string with 0x prefix and ${expectedLength} hex characters`
    );

// Hash field validators for each hash type
const hashSchemas = {
  perceptual_hash: hexHashString(16).optional(),
  average_hash: hexHashString(16).optional(),
  difference_hash: hexHashString(16).optional(),
  wavelet_hash: hexHashString(16).optional(),
  color_hash: hexHashString(16).optional(),
  blockhash8: hexHashString(16).optional(),
  blockhash16: hexHashString(32).optional(),
};

// Hash object with at least one hash type present
const hashesSchema = z
  .object(hashSchemas)
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one hash type must be provided',
  });

// Hash weights object
const hashWeightsSchema = z
  .object({
    perceptual_hash: z.number().min(0).max(1).optional(),
    average_hash: z.number().min(0).max(1).optional(),
    difference_hash: z.number().min(0).max(1).optional(),
    wavelet_hash: z.number().min(0).max(1).optional(),
    color_hash: z.number().min(0).max(1).optional(),
    blockhash8: z.number().min(0).max(1).optional(),
    blockhash16: z.number().min(0).max(1).optional(),
  })
  .optional();

// Find similar endpoint body schema
const findSimilarBodySchema = z.object({
  hashes: hashesSchema,
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.85),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10),
  hash_weights: hashWeightsSchema,
  use_optimization: z
    .boolean()
    .optional()
    .default(true),
});

// Batch hash lookup query schema
const batchQuerySchema = z.object({
  id: z.string().min(1),
  hashes: hashesSchema,
});

const batchHashLookupBodySchema = z.object({
  queries: z
    .array(batchQuerySchema)
    .min(1)
    .max(50),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.9),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(5),
  use_optimization: z
    .boolean()
    .optional()
    .default(true),
});

// Export validation schemas for middleware
module.exports = {
  findSimilarSchema: { body: findSimilarBodySchema },
  batchHashLookupSchema: { body: batchHashLookupBodySchema },
  hashesSchema,
  hashWeightsSchema,
};
