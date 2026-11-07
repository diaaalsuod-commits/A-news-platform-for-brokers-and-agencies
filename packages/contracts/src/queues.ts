import { z } from 'zod';

/** Shared by the API, which adds these jobs, and the PDF worker, which runs them. */
export const catalogPdfQueueName = 'catalog-pdf';

export const catalogPdfJobSchema = z.object({
  catalogVersionId: z.uuid(),
});
export type CatalogPdfJob = z.infer<typeof catalogPdfJobSchema>;
