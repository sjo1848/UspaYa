import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RoleCode } from '@uspaya/database';

import { ApiError } from '../../shared/http/api-error';
import { PrismaService } from '../../shared/database/prisma.service';
import type { RequestActor } from '../../shared/http/request-context';
import {
  hashPassword,
  hashRefreshToken,
  randomRefreshToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from './auth-crypto';

export interface AuthTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresIn: number;
  readonly refreshToken: string;
  readonly refreshTokenMaxAge: number;
}

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const DUMMY_PASSWORD_HASH =
  'scrypt$32768$8$1$dGVzdC1kdW1teS1zYWx0ISE$D9EF_MZAunId-vVpgN6Osl2ObiKN64IA469q48P8swg';

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async login(
    email: string,
    password: string,
    source: string,
  ): Promise<{ actor: RequestActor; tokens: AuthTokens }> {
    const sourceHash = hashRefreshToken(source);
    await this.assertLoginAllowed(sourceHash);
    const user = await this.prisma.client.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { roleAssignments: true },
    });
    const passwordIsValid = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (user === null || !user.active || user.passwordHash === null || !passwordIsValid) {
      await this.recordFailedLogin(sourceHash);
      throw invalidCredentials();
    }
    await this.clearLoginFailures(sourceHash);
    return this.issueSession(user);
  }

  async createPasswordHash(password: string): Promise<string> {
    return hashPassword(password);
  }

  async refresh(refreshToken: string): Promise<{ actor: RequestActor; tokens: AuthTokens }> {
    const session = await this.prisma.client.authSession.findUnique({
      where: { refreshHash: hashRefreshToken(refreshToken) },
      include: { user: { include: { roleAssignments: true } } },
    });
    const now = new Date();
    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      !session.user.active ||
      session.user.passwordHash === null
    ) {
      throw invalidCredentials();
    }

    const nextRefreshToken = randomRefreshToken();
    const nextSession = await this.prisma.client.$transaction(async (transaction) => {
      await transaction.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now, lastUsedAt: now },
      });
      return transaction.authSession.create({
        data: {
          id: randomUUID(),
          userId: session.userId,
          refreshHash: hashRefreshToken(nextRefreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000),
        },
      });
    });
    return {
      actor: this.toActor(session.user, nextSession.id),
      tokens: await this.toTokens(
        session.user.id,
        session.user.authVersion,
        nextSession.id,
        nextRefreshToken,
      ),
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.client.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async actorFromAccessToken(token: string): Promise<RequestActor> {
    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      throw invalidCredentials();
    }
    const session = await this.prisma.client.authSession.findUnique({
      where: { id: claims.sid },
      include: { user: { include: { roleAssignments: true } } },
    });
    const now = new Date();
    if (
      session === null ||
      session.userId !== claims.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.user.authVersion !== claims.ver ||
      !session.user.active
    ) {
      throw invalidCredentials();
    }
    return this.toActor(session.user, session.id);
  }

  private async issueSession(
    user: UserWithRoles,
  ): Promise<{ actor: RequestActor; tokens: AuthTokens }> {
    const refreshToken = randomRefreshToken();
    const session = await this.prisma.client.authSession.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        refreshHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    });
    return {
      actor: this.toActor(user, session.id),
      tokens: await this.toTokens(user.id, user.authVersion, session.id, refreshToken),
    };
  }

  private async assertLoginAllowed(sourceHash: string): Promise<void> {
    const throttle = await this.prisma.client.authLoginThrottle.findUnique({
      where: { sourceHash },
    });
    if (
      throttle !== null &&
      throttle.windowStartedAt > new Date(Date.now() - LOGIN_WINDOW_MS) &&
      throttle.attempts >= LOGIN_MAX_ATTEMPTS
    ) {
      throw loginRateLimited();
    }
  }

  private async recordFailedLogin(sourceHash: string): Promise<void> {
    const now = new Date();
    const windowStartedAt = new Date(now.getTime() - LOGIN_WINDOW_MS);
    const existing = await this.prisma.client.authLoginThrottle.findUnique({
      where: { sourceHash },
    });
    if (existing === null) {
      await this.prisma.client.authLoginThrottle.upsert({
        where: { sourceHash },
        create: { sourceHash, attempts: 1, windowStartedAt: now },
        update: { attempts: { increment: 1 } },
      });
      return;
    }
    if (existing.windowStartedAt <= windowStartedAt) {
      await this.prisma.client.authLoginThrottle.update({
        where: { sourceHash },
        data: { attempts: 1, windowStartedAt: now },
      });
      return;
    }
    await this.prisma.client.authLoginThrottle.update({
      where: { sourceHash },
      data: { attempts: { increment: 1 } },
    });
  }

  private async clearLoginFailures(sourceHash: string): Promise<void> {
    await this.prisma.client.authLoginThrottle.deleteMany({ where: { sourceHash } });
  }

  private async toTokens(
    userId: string,
    authVersion: number,
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const accessTokenExpiresIn = Number(process.env.AUTH_ACCESS_TTL_SECONDS ?? 900);
    return {
      accessToken: await signAccessToken({ sub: userId, sid: sessionId, ver: authVersion }),
      accessTokenExpiresIn,
      refreshToken,
      refreshTokenMaxAge: REFRESH_TTL_SECONDS,
    };
  }

  private toActor(user: UserWithRoles, sessionId?: string): RequestActor {
    return {
      userId: user.id,
      displayName: user.displayName,
      ...(sessionId === undefined ? {} : { sessionId }),
      roles: user.roleAssignments.map((assignment) => assignment.role),
      scopes: user.roleAssignments.map((assignment) => ({
        role: assignment.role,
        ...(assignment.merchantId === null ? {} : { merchantId: assignment.merchantId }),
        ...(assignment.branchId === null ? {} : { branchId: assignment.branchId }),
      })),
    };
  }
}

type UserWithRoles = {
  readonly id: string;
  readonly displayName: string;
  readonly passwordHash: string | null;
  readonly active: boolean;
  readonly authVersion: number;
  readonly roleAssignments: readonly {
    readonly role: RoleCode;
    readonly merchantId: string | null;
    readonly branchId: string | null;
  }[];
};

function invalidCredentials(): ApiError {
  return new ApiError(HttpStatus.UNAUTHORIZED, {
    code: 'INVALID_CREDENTIALS',
    message: 'The credentials are invalid.',
  });
}

function loginRateLimited(): ApiError {
  return new ApiError(HttpStatus.TOO_MANY_REQUESTS, {
    code: 'LOGIN_RATE_LIMITED',
    message: 'Too many login attempts. Try again later.',
  });
}
