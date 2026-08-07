import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestActor, UspaYaRequest } from '../http/request-context';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestActor => {
    const request = context.switchToHttp().getRequest<UspaYaRequest>();
    if (request.actor === undefined) {
      throw new Error('Request actor is not available after authentication guard.');
    }
    return request.actor;
  },
);
