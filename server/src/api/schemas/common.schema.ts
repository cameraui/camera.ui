import * as zod from 'zod';

export const paginationQuerySchema = zod.object({
  start: zod.coerce.number().optional(),
  page: zod.coerce.number().optional(),
  pageSize: zod.coerce.number().optional(),
});

export type PaginationQueryInput = zod.output<typeof paginationQuerySchema>;
