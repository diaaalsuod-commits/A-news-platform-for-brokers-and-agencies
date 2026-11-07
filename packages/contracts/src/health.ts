import { z } from 'zod';

export const serviceStateSchema = z.enum(['up', 'down']);
export type ServiceState = z.infer<typeof serviceStateSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: serviceStateSchema,
  redis: serviceStateSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
