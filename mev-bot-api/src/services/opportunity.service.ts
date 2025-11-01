import { prisma } from "../config/db";

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  pages: number;
  totalRows: number;
}

export const getOpportunityById = async (id: string) => {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
  });
  return opportunity;
};

export const getOpportunities = async (
  paginationParams: PaginationParams
): Promise<PaginatedResult<any>> => {
  const { page, pageSize } = paginationParams;

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // Get data and total count in parallel
  const [data, totalRows] = await Promise.all([
    prisma.opportunity.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.opportunity.count(),
  ]);

  const pages = Math.ceil(totalRows / pageSize);

  return {
    data,
    page,
    pageSize,
    pages,
    totalRows,
  };
};
