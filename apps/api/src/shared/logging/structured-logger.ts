import type { LoggerService } from '@nestjs/common';

type LogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'warn';

const SENSITIVE_KEY = /authorization|cookie|credential|password|pin|secret|token/i;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9._~-]+/gi;
const URI_CREDENTIALS = /(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi;

export class StructuredLogger implements LoggerService {
  constructor(private readonly service: string) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, trace?: string): void {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      ...(context === undefined ? {} : { context }),
      message: sanitizeLogValue(message),
      ...(trace === undefined ? {} : { trace: sanitizeString(trace) }),
    };
    const output = JSON.stringify(record);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${output}\n`);
      return;
    }
    process.stdout.write(`${output}\n`);
  }
}

export function sanitizeLogValue(value: unknown, key?: string): unknown {
  if (key !== undefined && SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeLogValue(entry));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeLogValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function sanitizeString(value: string): string {
  return value.replace(BEARER_VALUE, 'Bearer [REDACTED]').replace(URI_CREDENTIALS, '$1[REDACTED]@');
}
