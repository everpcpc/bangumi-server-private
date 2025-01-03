import { createError } from '@fastify/error';
import type { Static } from '@sinclair/typebox';
import { Type as t } from '@sinclair/typebox';
import httpCodes from 'http-status-codes';

import { comparePassword, NeedLoginError } from '@app/lib/auth/index.ts';
import * as session from '@app/lib/auth/session.ts';
import { CookieKey } from '@app/lib/auth/session.ts';
import config, { redisPrefix } from '@app/lib/config.ts';
import { CaptchaError, UnexpectedNotFoundError } from '@app/lib/error.ts';
import { Security, Tag } from '@app/lib/openapi/index.ts';
import { fetchPermission, fetchUser, UserRepo } from '@app/lib/orm/index.ts';
import { avatar } from '@app/lib/response.ts';
import { createTurnstileDriver } from '@app/lib/services/turnstile.ts';
import * as convert from '@app/lib/types/convert.ts';
import * as res from '@app/lib/types/res.ts';
import { createLimiter } from '@app/lib/utils/rate-limit/index.ts';
import { requireLogin } from '@app/routes/hooks/pre-handler.ts';
import type { App } from '@app/routes/type.ts';

const TooManyRequestsError = createError(
  'TOO_MANY_REQUESTS',
  'too many failed login attempts',
  httpCodes.TOO_MANY_REQUESTS,
);

const EmailOrPasswordError = createError(
  'EMAIL_PASSWORD_ERROR',
  'email does not exists or email and password not match',
  httpCodes.UNAUTHORIZED,
);

const UserBannedError = createError('USER_BANNED', 'user is banned', httpCodes.UNAUTHORIZED);

const clientPermission = t.Object(
  {
    subjectWikiEdit: t.Boolean(),
  },
  { $id: 'Permission' },
);

const currentUser = t.Intersect([res.SlimUser, t.Object({ permission: clientPermission })], {
  $id: 'CurrentUser',
});

// eslint-disable-next-line @typescript-eslint/require-await
export async function setup(app: App) {
  // 10 calls per 600s
  const limiter = createLimiter();

  app.addSchema(clientPermission);
  app.addSchema(currentUser);

  app.get(
    '/me',
    {
      schema: {
        operationId: 'getCurrentUser',
        tags: [Tag.User],
        security: [{ [Security.CookiesSession]: [] }],
        response: {
          200: res.Ref(currentUser),
          401: res.Ref(res.Error, {
            examples: [res.formatError(new NeedLoginError('get current user'))],
          }),
        },
      },
    },
    async function ({ auth }): Promise<Static<typeof currentUser>> {
      if (!auth.login) {
        throw new NeedLoginError('getting current user');
      }

      const u = await fetchUser(auth.userID);

      if (!u) {
        throw new UnexpectedNotFoundError(`user ${auth.userID}`);
      }

      return {
        ...convert.oldToUser(u),
        permission: {
          subjectWikiEdit: auth.permission.subject_edit ?? false,
        },
      };
    },
  );

  app.post(
    '/logout',
    {
      schema: {
        description: '登出',
        operationId: 'logout',
        tags: [Tag.User],
        body: t.Object({}),
        response: {
          200: {},
          401: res.Ref(res.Error, {
            description: '未登录',
            'x-examples': {
              NeedLoginError: { value: res.formatError(new NeedLoginError('logout')) },
            },
          }),
        },
      },
      preHandler: [requireLogin('logout')],
    },
    async (req, res) => {
      if (!req.auth.login) {
        throw new NeedLoginError('logout');
      }

      const sessionKey = req.cookies[session.CookieKey];

      if (!sessionKey) {
        return;
      }

      await session.revoke(sessionKey);
      void res.clearCookie(CookieKey);
    },
  );

  const turnstile = createTurnstileDriver(config.turnstile.secretKey);

  const loginRequestBody = t.Object(
    {
      email: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 }),
      'cf-turnstile-response': t.String({ minLength: 1 }),
    },
    {
      $id: 'LoginRequestBody',
      examples: [
        {
          email: 'treeholechan@gmail.com',
          password: 'lovemeplease',
          'cf-turnstile-response': '10000000-aaaa-bbbb-cccc-000000000001',
        },
      ],
    },
  );

  app.addSchema(loginRequestBody);

  app.post(
    '/login',
    {
      schema: {
        description: `需要 [turnstile](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)

next.bgm.tv 域名对应的 site-key 为 \`0x4AAAAAAABkMYinukE8nzYS\`

dev.bgm38.com 域名使用测试用的 site-key \`1x00000000000000000000AA\``,
        operationId: 'login',
        tags: [Tag.User],
        response: {
          200: res.Ref(res.SlimUser, {
            headers: {
              'Set-Cookie': t.String({ description: `example: "${session.CookieKey}=12345abc"` }),
            },
          }),
          400: res.Ref(res.Error, { description: 'request validation error' }),
          401: res.Ref(res.Error, {
            description: '验证码错误/账号密码不匹配',
            headers: {
              'X-RateLimit-Remaining': t.Integer({ description: 'remaining rate limit' }),
              'X-RateLimit-Limit': t.Integer({ description: 'total limit per 10 minutes' }),
              'X-RateLimit-Reset': t.Integer({ description: 'seconds to reset rate limit' }),
            },
            'x-examples': res.formatErrors(new CaptchaError(), new EmailOrPasswordError()),
          }),
          429: res.Ref(res.Error, {
            description: '失败次数太多，需要过一段时间再重试',
            headers: {
              'X-RateLimit-Remaining': t.Integer({ description: 'remaining rate limit' }),
              'X-RateLimit-Limit': t.Integer({ description: 'limit per 10 minutes' }),
              'X-RateLimit-Reset': t.Integer({ description: 'seconds to reset rate limit' }),
            },
            examples: [res.formatError(new TooManyRequestsError())],
          }),
        },
        body: res.Ref(loginRequestBody),
      },
    },
    async function loginHandler(
      { body: { email, password, 'cf-turnstile-response': cfCaptchaResponse }, ip },
      reply,
    ): Promise<res.ISlimUser> {
      const limitKey = `${redisPrefix}-login-rate-limit-${ip}`;
      const { remain, reset, limit, limited } = await limiter.get(limitKey, 600, 10);
      void reply.headers({
        'X-RateLimit-Remaining': remain,
        'X-RateLimit-Limit': limit,
        'X-RateLimit-Reset': reset,
      });
      if (limited) {
        throw new TooManyRequestsError();
      }

      if (!(await turnstile.verify(cfCaptchaResponse))) {
        throw new CaptchaError();
      }

      const user = await UserRepo.findOne({ where: { email } });
      if (!user) {
        throw new EmailOrPasswordError();
      }
      if (!(await comparePassword(user.passwordCrypt, password))) {
        throw new EmailOrPasswordError();
      }

      const perms = await fetchPermission(user.groupid);
      if (perms.user_ban) {
        throw new UserBannedError();
      }

      const token = await session.create({
        id: user.id,
        regTime: user.regdate,
      });

      await limiter.reset(limitKey);

      void reply.cookie(CookieKey, token, { maxAge: 24 * 60 * 60 * 30 });

      return {
        ...user,
        avatar: avatar(user.avatar),
        joinedAt: user.regdate,
      };
    },
  );
}
