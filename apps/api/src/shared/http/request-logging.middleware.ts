import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';

import type { UspaYaRequest } from './request-context';

interface LoggedResponse {
  readonly statusCode: number;
  once(event: 'finish', listener: () => void): void;
}

type NextFunction = () => void;

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(request: UspaYaRequest, response: LoggedResponse, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      Logger.log(
        {
          event: 'http_request',
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          correlationId: request.correlationId ?? 'unavailable',
          ...(request.actor === undefined ? {} : { actorId: request.actor.userId }),
        },
        'HttpRequest',
      );
    });
    next();
  }
}
