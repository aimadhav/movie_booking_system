import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const toPagination = ({ page, pageSize }: z.infer<typeof paginationSchema>) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});
