import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';

import type { UspaYaRequest } from './request-context';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

type NextFunction = () => void;

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: UspaYaRequest, response: HeaderResponse, next: NextFunction): void {
    const supplied = readHeader(request.headers['x-correlation-id']);
    const correlationId =
      supplied !== undefined && CORRELATION_ID_PATTERN.test(supplied) ? supplied : randomUUID();

    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    next();
  }
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
