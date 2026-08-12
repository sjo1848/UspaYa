import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { ApiExceptionFilter } from './shared/http/api-exception.filter';
import { assertInternalAuthConfiguration } from './modules/identity/auth-crypto';
import {
  assertDevelopmentIdentityConfiguration,
  isDevelopmentIdentityEnabled,
} from './shared/security/development-identity.guard';

export function configureApplication(app: INestApplication): void {
  assertDevelopmentIdentityConfiguration();
  if (!isDevelopmentIdentityEnabled()) {
    assertInternalAuthConfiguration();
    const trustedProxyHops = Number(process.env.AUTH_TRUST_PROXY_HOPS ?? 0);
    const httpServer = app.getHttpAdapter().getInstance() as {
      set(name: string, value: number): void;
    };
    httpServer.set('trust proxy', trustedProxyHops);
  }

  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('UspaYa API')
      .setDescription('First controlled vertical for UspaYa development and QA.')
      .setVersion('1.0.0')
      .addApiKey(
        {
          type: 'apiKey',
          name: 'x-dev-actor-id',
          in: 'header',
          description: 'Seeded actor identifier. Available only in development and test.',
        },
        'developmentActor',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'Idempotency-Key',
          in: 'header',
          description: 'Stable identifier for one logical mutation.',
        },
        'idempotencyKey',
      )
      .build(),
  );

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    customSiteTitle: 'UspaYa API',
  });
}
