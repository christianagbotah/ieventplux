import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_CODES, type ErrorCode } from '@ieventplux/contracts';
import { Prisma } from '@ieventplux/db';

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) { super(message); }
  get status() { return ERROR_CODES[this.code]; }
}
export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') => new AppError('FORBIDDEN', msg);
export const conflict = (msg: string, details?: unknown) => new AppError('STATE_CONFLICT', msg, details);
export const badRequest = (msg: string, details?: unknown) => new AppError('BAD_REQUEST', msg, details);

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(); const res = ctx.getResponse<Response>(); const req = ctx.getRequest<Request>();
    const correlationId = (req as Request & { id?: string }).id ?? res.getHeader('x-request-id')?.toString() ?? 'n/a';
    let status = 500; let code: ErrorCode = 'INTERNAL'; let message = 'Something went wrong'; let details: unknown;
    if (exception instanceof AppError) { status = exception.status; code = exception.code; message = exception.message; details = exception.details; }
    else if (exception instanceof HttpException) {
      status = exception.getStatus(); const body = exception.getResponse() as { message?: string | string[] };
      message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message ?? exception.message;
      code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') { status = 409; code = 'CONFLICT'; message = 'A record with those details already exists'; }
    else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Resource not found'; }
    if (status >= 500) this.logger.error({ correlationId, path: req.url, err: exception instanceof Error ? exception.stack : exception });
    res.status(status).json({ error: { code, message, details, correlationId } });
  }
}
