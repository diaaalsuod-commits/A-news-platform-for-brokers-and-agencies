import { z } from 'zod';

/** Every list endpoint: ?page&pageSize, at most 100 a page (CLAUDE.md, API conventions). */
export const MAX_PAGE_SIZE = 100;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/** { items, total, page, pageSize } for any item schema. */
export const listResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
  });

/** FR-ACC-06, FR-ADM-05: a display currency the Platform Admin enabled. */
export const currencySchema = z.object({
  code: z.string().length(3),
  symbol: z.string(),
  nameAr: z.string(),
  nameEn: z.string(),
});
export type Currency = z.infer<typeof currencySchema>;

export const currencyListResponseSchema = listResponseSchema(currencySchema);
export type CurrencyListResponse = z.infer<typeof currencyListResponseSchema>;
