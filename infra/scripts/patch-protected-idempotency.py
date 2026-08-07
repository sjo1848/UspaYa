from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} not found')
    return text.replace(old, new, 1)


submit = Path('apps/api/src/modules/ordering/application/submit-order.service.ts')
text = submit.read_text()
text = replace_once(
    text,
    "import { createRequestHash, IdempotencyConflictError } from '../../shared/application/idempotency';",
    """import {
  createProtectedRequestHash,
  IdempotencyConflictError,
  protectedRequestHashMatches,
} from '../../shared/application/idempotency';""",
    'SubmitOrder import',
)
text = replace_once(
    text,
    """    const requestHash = createRequestHash({
      orderId: command.orderId,
      deliveryId: command.deliveryId,
      paymentId: command.paymentId,
      customerId: command.customerId,
      branchId: command.branchId,
      plainTextPin: command.plainTextPin,
      items: command.items,
    });""",
    '    const fingerprintInput = createFingerprintInput(command);',
    'SubmitOrder request hash block',
)
text = replace_once(
    text,
    'return await this.executeTransaction(command, key, requestHash);',
    'return await this.executeTransaction(command, key, fingerprintInput);',
    'SubmitOrder transaction call',
)
text = replace_once(
    text,
    'const recovered = await this.recoverConcurrentResult(key, requestHash);',
    """const recovered = await this.recoverConcurrentResult(
          key,
          fingerprintInput,
          command.plainTextPin,
        );""",
    'SubmitOrder recovery call',
)
text = replace_once(
    text,
    """    requestHash: string,
  ): Promise<SubmitOrderResult> {""",
    """    fingerprintInput: SubmitOrderFingerprintInput,
  ): Promise<SubmitOrderResult> {""",
    'SubmitOrder transaction signature',
)
text = replace_once(
    text,
    """        if (existing.requestHash !== requestHash) {
          throw new IdempotencyConflictError();
        }""",
    """        if (
          !protectedRequestHashMatches(
            existing.requestHash,
            fingerprintInput,
            command.plainTextPin,
          )
        ) {
          throw new IdempotencyConflictError();
        }""",
    'SubmitOrder existing fingerprint check',
)
text = replace_once(
    text,
    '        requestHash,\n        expiresAt:',
    '        requestHash: createProtectedRequestHash(fingerprintInput, command.plainTextPin),\n        expiresAt:',
    'SubmitOrder protected fingerprint create',
)
text = replace_once(
    text,
    """  private async recoverConcurrentResult(
    key: string,
    requestHash: string,
  ): Promise<SubmitOrderResult | undefined> {""",
    """  private async recoverConcurrentResult(
    key: string,
    fingerprintInput: SubmitOrderFingerprintInput,
    plainTextPin: string,
  ): Promise<SubmitOrderResult | undefined> {""",
    'SubmitOrder recovery signature',
)
if text.count('existing.requestHash !== requestHash') != 2:
    raise SystemExit('Unexpected SubmitOrder recovery comparison count')
text = text.replace(
    'existing.requestHash !== requestHash',
    '!protectedRequestHashMatches(existing.requestHash, fingerprintInput, plainTextPin)',
)
marker = '\nfunction delay(milliseconds: number): Promise<void> {'
addition = """
interface SubmitOrderFingerprintInput {
  readonly orderId: string;
  readonly deliveryId: string;
  readonly paymentId: string;
  readonly customerId: string;
  readonly branchId: string;
  readonly items: readonly SubmitOrderItemInput[];
}

function createFingerprintInput(command: SubmitOrderCommand): SubmitOrderFingerprintInput {
  return {
    orderId: command.orderId,
    deliveryId: command.deliveryId,
    paymentId: command.paymentId,
    customerId: command.customerId,
    branchId: command.branchId,
    items: command.items,
  };
}
"""
text = replace_once(text, marker, addition + marker, 'SubmitOrder helper insertion')
submit.write_text(text)


delivery = Path('apps/api/src/modules/delivery/application/confirm-delivery.service.ts')
text = delivery.read_text()
text = replace_once(
    text,
    '  createRequestHash,\n  IdempotencyConflictError,\n',
    '',
    'ConfirmDelivery database imports',
)
text = replace_once(
    text,
    "import { Payment } from '../../payment/domain/payment';\n",
    """import { Payment } from '../../payment/domain/payment';
import {
  createProtectedRequestHash,
  IdempotencyConflictError,
  protectedRequestHashMatches,
} from '../../shared/application/idempotency';
""",
    'ConfirmDelivery app idempotency import',
)
text = replace_once(
    text,
    """    const requestHash = createRequestHash({
      deliveryId: command.deliveryId,
      actorId: command.actorId,
      expectedVersion: command.expectedVersion,
      pin: command.pin,
      receiver: command.receiver,
      cashReceivedCents: command.cashReceivedCents,
    });""",
    '    const fingerprintInput = createFingerprintInput(command);',
    'ConfirmDelivery request hash block',
)
text = replace_once(
    text,
    'return await this.executeTransaction(command, key, requestHash);',
    'return await this.executeTransaction(command, key, fingerprintInput);',
    'ConfirmDelivery transaction call',
)
text = replace_once(
    text,
    'const recovered = await this.recoverConcurrentResult(key, requestHash);',
    """const recovered = await this.recoverConcurrentResult(
          key,
          fingerprintInput,
          command.pin,
        );""",
    'ConfirmDelivery recovery call',
)
text = replace_once(
    text,
    """    requestHash: string,
  ): Promise<ConfirmDeliveryResult> {""",
    """    fingerprintInput: ConfirmDeliveryFingerprintInput,
  ): Promise<ConfirmDeliveryResult> {""",
    'ConfirmDelivery transaction signature',
)
text = replace_once(
    text,
    """          if (existing.requestHash !== requestHash) {
            throw new IdempotencyConflictError();
          }""",
    """          if (
            !protectedRequestHashMatches(existing.requestHash, fingerprintInput, command.pin)
          ) {
            throw new IdempotencyConflictError();
          }""",
    'ConfirmDelivery existing fingerprint check',
)
text = replace_once(
    text,
    '            requestHash,\n            status:',
    '            requestHash: createProtectedRequestHash(fingerprintInput, command.pin),\n            status:',
    'ConfirmDelivery protected fingerprint create',
)
text = replace_once(
    text,
    """  private async recoverConcurrentResult(
    key: string,
    requestHash: string,
  ): Promise<ConfirmDeliveryResult | undefined> {""",
    """  private async recoverConcurrentResult(
    key: string,
    fingerprintInput: ConfirmDeliveryFingerprintInput,
    pin: string,
  ): Promise<ConfirmDeliveryResult | undefined> {""",
    'ConfirmDelivery recovery signature',
)
if text.count('existing.requestHash !== requestHash') != 2:
    raise SystemExit('Unexpected ConfirmDelivery recovery comparison count')
text = text.replace(
    'existing.requestHash !== requestHash',
    '!protectedRequestHashMatches(existing.requestHash, fingerprintInput, pin)',
)
marker = '\nfunction eventRow('
addition = """
interface ConfirmDeliveryFingerprintInput {
  readonly deliveryId: string;
  readonly actorId: string;
  readonly expectedVersion: number;
  readonly receiver: string;
  readonly cashReceivedCents: number;
}

function createFingerprintInput(
  command: ConfirmDeliveryCommand,
): ConfirmDeliveryFingerprintInput {
  return {
    deliveryId: command.deliveryId,
    actorId: command.actorId,
    expectedVersion: command.expectedVersion,
    receiver: command.receiver,
    cashReceivedCents: command.cashReceivedCents,
  };
}
"""
text = replace_once(text, marker, addition + marker, 'ConfirmDelivery helper insertion')
delivery.write_text(text)
