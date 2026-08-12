import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';

import { CurrentActor } from '../../shared/security/current-actor.decorator';
import { PublicRoute, Roles } from '../../shared/security/security-metadata';
import type { RequestActor, UspaYaRequest } from '../../shared/http/request-context';
import { AuthService } from './auth.service';
import type { AuthTokens } from './auth.service';
// The runtime class is required by Nest ValidationPipe to preserve DTO metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LoginDto } from './auth.dto';

const REFRESH_COOKIE = 'uspaya_refresh';

interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @PublicRoute()
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() request: UspaYaRequest,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ) {
    const result = await this.auth.login(body.email, body.password, request.ip ?? 'unknown');
    setRefreshCookie(response, result.tokens);
    return publicAuthResponse(result.actor, result.tokens);
  }

  @Post('refresh')
  @PublicRoute()
  @HttpCode(200)
  async refresh(
    @Req() request: UspaYaRequest,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ) {
    const refreshToken = readCookie(request.headers.cookie, REFRESH_COOKIE);
    const result = await this.auth.refresh(refreshToken ?? '');
    setRefreshCookie(response, result.tokens);
    return publicAuthResponse(result.actor, result.tokens);
  }

  @Post('logout')
  @Roles('CUSTOMER', 'MERCHANT_OPERATOR', 'OPERATIONS', 'COURIER')
  @HttpCode(204)
  async logout(
    @CurrentActor() actor: RequestActor,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ): Promise<void> {
    if (actor.sessionId !== undefined) {
      await this.auth.revokeSession(actor.sessionId);
    }
    clearRefreshCookie(response);
  }
}

function publicAuthResponse(actor: RequestActor, tokens: AuthTokens) {
  return {
    accessToken: tokens.accessToken,
    accessTokenExpiresIn: tokens.accessTokenExpiresIn,
    actor: {
      userId: actor.userId,
      displayName: actor.displayName,
      roles: actor.roles,
      scopes: actor.scopes,
    },
  };
}

function setRefreshCookie(response: ResponseWithHeaders, tokens: AuthTokens): void {
  const secure = process.env.AUTH_COOKIE_SECURE === 'true' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${REFRESH_COOKIE}=${tokens.refreshToken}; Max-Age=${tokens.refreshTokenMaxAge}; Path=/api/v1/auth; HttpOnly; SameSite=Lax${secure}`,
  );
}

function clearRefreshCookie(response: ResponseWithHeaders): void {
  const secure = process.env.AUTH_COOKIE_SECURE === 'true' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${REFRESH_COOKIE}=; Max-Age=0; Path=/api/v1/auth; HttpOnly; SameSite=Lax${secure}`,
  );
}

function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) return undefined;
  for (const part of value.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}
