import type { LoggerService } from '@nestjs/common';

export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  private write(
    level: 'error' | 'info' | 'warn',
    message: unknown,
    context?: string,
    trace?: string,
  ) {
    const output = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'worker',
      ...(context === undefined ? {} : { context }),
      message: sanitize(message),
      ...(trace === undefined ? {} : { trace: sanitize(trace) }),
    })}\n`;
    if (level === 'error') {
      process.stderr.write(output);
      return;
    }
    process.stdout.write(output);
  }
}

function sanitize(value: unknown, key?: string): unknown {
  if (key !== undefined && /authorization|cookie|credential|password|pin|secret|token/i.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
      .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[REDACTED]@');
  }
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, entryKey),
      ]),
    );
  }
  return value;
}
