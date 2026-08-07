import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  IdempotencyConflictError as DatabaseIdempotencyConflictError,
  Prisma,
} from '@uspaya/database';

import {
  CourierNotAvailableError,
  DeliveryNotAssignableError,
  DeliveryNotFoundError,
  OperationsActorNotAuthorizedError,
} from '../../modules/delivery/application/assign-courier.service';
import {
  ConfirmDeliveryInProgressError,
  InvalidConfirmDeliveryIdempotencyKeyError,
} from '../../modules/delivery/application/confirm-delivery.service';
import { CourierActorNotAuthorizedError } from '../../modules/delivery/application/courier-pickup.service';
import { OrderNotCompletableError } from '../../modules/ordering/application/complete-order.service';
import { OrderNotFoundError } from '../../modules/ordering/application/merchant-order-transition.service';
import {
  IdempotencyInProgressError,
  InvalidOrderSubmissionError,
} from '../../modules/ordering/application/submit-order.service';
import { IdempotencyConflictError as ApplicationIdempotencyConflictError } from '../../modules/shared/application/idempotency';
import { DomainError } from '../../modules/shared/domain/domain-error';
import {
  ActiveCourierAssignmentConflictError,
  PersistenceConflictError,
} from '../../modules/shared/infrastructure/persistence-errors';
import type { UspaYaRequest } from './request-context';

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<UspaYaRequest>();
    const response = http.getResponse<JsonResponse>();
    const mapped = mapException(exception);

    response.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      correlationId: request.correlationId ?? 'unavailable',
      ...(mapped.details === undefined ? {} : { details: mapped.details }),
    });
  }
}

interface MappedException {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

function mapException(exception: unknown): MappedException {
  if (exception instanceof DomainError) {
    const statusByCode = {
      INVALID_VALUE: HttpStatus.UNPROCESSABLE_ENTITY,
      INVALID_STATE: HttpStatus.CONFLICT,
      VERSION_CONFLICT: HttpStatus.CONFLICT,
      FORBIDDEN: HttpStatus.FORBIDDEN,
      BUSINESS_RULE_VIOLATION: HttpStatus.CONFLICT,
    } as const;
    return {
      status: statusByCode[exception.code],
      code: exception.code,
      message: exception.message,
      details: exception.context,
    };
  }

  if (exception instanceof OrderNotFoundError || exception instanceof DeliveryNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: exception.code,
      message: exception.message,
    };
  }

  if (
    exception instanceof OperationsActorNotAuthorizedError ||
    exception instanceof CourierActorNotAuthorizedError
  ) {
    return {
      status: HttpStatus.FORBIDDEN,
      code: exception.code,
      message: exception.message,
    };
  }

  if (exception instanceof InvalidConfirmDeliveryIdempotencyKeyError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: exception.code,
      message: exception.message,
    };
  }

  if (
    exception instanceof DeliveryNotAssignableError ||
    exception instanceof CourierNotAvailableError ||
    exception instanceof ActiveCourierAssignmentConflictError ||
    exception instanceof OrderNotCompletableError
  ) {
    return {
      status: HttpStatus.CONFLICT,
      code: exception.code,
      message: exception.message,
    };
  }

  if (exception instanceof PersistenceConflictError) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'VERSION_CONFLICT',
      message: 'The aggregate version is stale.',
    };
  }

  if (exception instanceof InvalidOrderSubmissionError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: exception.code,
      message: exception.message,
    };
  }

  if (
    exception instanceof ApplicationIdempotencyConflictError ||
    exception instanceof DatabaseIdempotencyConflictError
  ) {
    return {
      status: HttpStatus.CONFLICT,
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      message: 'The idempotency key was already used with a different request.',
    };
  }

  if (
    exception instanceof IdempotencyInProgressError ||
    exception instanceof ConfirmDeliveryInProgressError
  ) {
    return {
      status: HttpStatus.CONFLICT,
      code: exception.code,
      message: exception.message,
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      };
    }
    if (exception.code === 'P2034') {
      return {
        status: HttpStatus.CONFLICT,
        code: 'TRANSACTION_CONFLICT',
        message: 'The operation conflicted with another concurrent request. Retry safely.',
      };
    }
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === 'object' && body !== null && 'code' in body && 'message' in body) {
      const record = body as Record<string, unknown>;
      return {
        status,
        code: typeof record.code === 'string' ? record.code : 'HTTP_ERROR',
        message: typeof record.message === 'string' ? record.message : exception.message,
        ...(isRecord(record.details) ? { details: record.details } : {}),
      };
    }
    return {
      status,
      code: status === HttpStatus.BAD_REQUEST ? 'VALIDATION_FAILED' : 'HTTP_ERROR',
      message: extractHttpMessage(body, exception.message),
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  };
}

function extractHttpMessage(body: string | object, fallback: string): string {
  if (typeof body === 'string') {
    return body;
  }
  if ('message' in body) {
    const value = (body as Record<string, unknown>).message;
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      return value.join('; ');
    }
  }
  return fallback;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
