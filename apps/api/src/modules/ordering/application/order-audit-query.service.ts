import { Prisma, type PrismaClient } from '@uspaya/database';

import { OperationsActorNotAuthorizedError } from '../../delivery/application/assign-courier.service';
import { OrderNotFoundError } from './merchant-order-transition.service';

export interface OrderAuditEntry {
  readonly action: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number | null;
  readonly actorId: string | null;
  readonly metadata: Prisma.JsonValue;
  readonly createdAt: string;
}

export interface OrderAuditResult {
  readonly orderId: string;
  readonly entries: readonly OrderAuditEntry[];
}

const SENSITIVE_KEY =
  /(pin|hash|secret|password|token|credential|idempotency|request[_-]?hash|api[_-]?key)/i;

export class OrderAuditQueryService {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(orderId: string, actorId: string): Promise<OrderAuditResult> {
    const operationsRole = await this.prisma.roleAssignment.findFirst({
      where: {
        userId: actorId,
        role: 'OPERATIONS',
        user: { active: true },
      },
      select: { id: true },
    });
    if (operationsRole === null) {
      throw new OperationsActorNotAuthorizedError();
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        payment: { select: { id: true } },
        delivery: { select: { id: true } },
      },
    });
    if (order === null) {
      throw new OrderNotFoundError();
    }

    const aggregateIds = [
      order.id,
      ...(order.payment === null ? [] : [order.payment.id]),
      ...(order.delivery === null ? [] : [order.delivery.id]),
    ];

    const entries = await this.prisma.auditLog.findMany({
      where: { aggregateId: { in: aggregateIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      orderId: order.id,
      entries: entries.map((entry) => ({
        action: entry.action,
        aggregateType: entry.aggregateType,
        aggregateId: entry.aggregateId,
        aggregateVersion: entry.aggregateVersion,
        actorId: entry.actorId,
        metadata: sanitizeJson(entry.metadata),
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }
}

function sanitizeJson(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJson(entry));
  }
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, Prisma.JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!SENSITIVE_KEY.test(key)) {
        sanitized[key] = sanitizeJson(entry as Prisma.JsonValue);
      }
    }
    return sanitized;
  }
  return value;
}
