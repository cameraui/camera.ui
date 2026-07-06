import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthLoginRequest, Pagination, PaginationQuery, PaginationRequest, PaginationResponse } from '../types/index.js';

const PAGINATION_DEFAULTS = {
  START: 0,
  PAGE: 1,
  PAGE_SIZE: -1,
};

const validateQuery = (query: Required<PaginationQuery>, totalItems: number) => {
  return {
    start: Math.max(0, Math.min(query.start, totalItems - 1)),
    page: Math.max(1, query.page),
    pageSize: query.pageSize === -1 ? -1 : Math.max(1, query.pageSize),
  };
};

export async function pages(req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply, payload: any): Promise<PaginationResponse | void> {
  if (reply.statusCode >= 400) {
    return;
  }

  const items = payload ?? [];
  const rawQuery = {
    start: req.query.start ?? PAGINATION_DEFAULTS.START,
    page: req.query.page ?? PAGINATION_DEFAULTS.PAGE,
    pageSize: req.query.pageSize ?? PAGINATION_DEFAULTS.PAGE_SIZE,
  };

  const query = validateQuery(rawQuery, items.length);

  if (query.pageSize === -1) {
    return {
      pagination: {
        currentPage: 1,
        pageSize: -1,
        totalPages: 1,
        startIndex: query.start,
        endIndex: items.length - 1,
        totalItems: items.length,
      },
      result: items.slice(query.start),
    };
  }

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / query.pageSize);
  const currentPage = query.start !== PAGINATION_DEFAULTS.START ? Math.ceil((query.start + 1) / query.pageSize) : Math.min(query.page, totalPages);
  const startIndex = query.start !== PAGINATION_DEFAULTS.START ? query.start : (currentPage - 1) * query.pageSize;
  const endIndex = Math.min(startIndex + query.pageSize - 1, totalItems - 1);

  const pagination: Pagination = {
    currentPage,
    pageSize: query.pageSize,
    totalPages,
    startIndex,
    endIndex,
    totalItems,
    nextPageQuery: currentPage < totalPages ? `?page=${currentPage + 1}&start=${startIndex + query.pageSize}` : null,
    prevPageQuery: currentPage > 1 ? `?page=${currentPage - 1}&start=${Math.max(0, startIndex - query.pageSize)}` : null,
  };

  return {
    pagination,
    result: items.slice(startIndex, endIndex + 1),
  };
}
