const { z } = require('zod');

const generateTokenSchema = z.object({
  body: z.object({
    artworkId: z.string().optional(),
    expiresIn: z.number().int().positive().max(24 * 60 * 60 * 1000).optional(), // Max 24 hours
    metadata: z.record(z.any()).optional(),
  }).optional(),
});

const revokeTokenSchema = z.object({
  params: z.object({
    token: z.string().min(1),
  }),
});

module.exports = {
  generateTokenSchema,
  revokeTokenSchema,
};
