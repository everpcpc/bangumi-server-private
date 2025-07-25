import * as crypto from 'node:crypto';

import { createError } from '@fastify/error';
import { compare } from '@node-rs/bcrypt';
import { DateTime } from 'luxon';

import { db, op, schema } from '@app/drizzle';
import { TypedCache } from '@app/lib/cache.ts';
import type * as res from '@app/lib/types/res.ts';
import { fetchPermission, type Permission } from '@app/lib/user/perm';
import { fetchUserX } from '@app/lib/user/utils.ts';
import { intval } from '@app/lib/utils/index.ts';
import { getTimelineSourceFromAppID } from '@app/vendor';

const tokenPrefix = 'Bearer ';
const defaultSource = 6; // next

export const NeedLoginError = createError<[string]>(
  'NEED_LOGIN',
  'you need to login before %s',
  401,
);

export const HeaderInvalidError = createError<[string]>('AUTHORIZATION_INVALID', '%s', 401);

const TokenNotValidError = createError<[]>(
  'TOKEN_INVALID',
  "can't find access token or it has been expired",
  401,
);

export const NotAllowedError = createError<[string]>(
  'NOT_ALLOWED',
  `you don't have permission to %s`,
  403,
);

export const UserGroup = Object.freeze({
  Unknown: 0 as number,
  Admin: 1 as number,
  BangumiAdmin: 2 as number,
  WindowAdmin: 3 as number,
  Quite: 4 as number,
  Banned: 5 as number,
  // 不太清楚具体是什么
  _6: 6 as number,
  // 不太清楚具体是什么
  _7: 7 as number,
  CharacterAdmin: 8 as number,
  WikiAdmin: 9 as number,
  Normal: 10 as number,
  WikiEditor: 11 as number,
} as const);

const nsfwRestrictedUIDs = new Set([
  873244, // by @everpcpc
]);

export interface IAuth {
  userID: number;
  login: boolean;
  allowNsfw: boolean;
  permission: Readonly<Permission>;
  /** Unix time seconds */
  regTime: number;
  groupID: number;
  source: number;
}

export async function byHeader(key: string | string[] | undefined): Promise<IAuth | null> {
  if (!key) {
    return emptyAuth();
  }

  if (Array.isArray(key)) {
    throw new HeaderInvalidError("can't providing multiple access token");
  }

  if (!key.startsWith(tokenPrefix)) {
    throw new HeaderInvalidError('authorization header should have "Bearer ${TOKEN}" format');
  }

  const token = key.slice(tokenPrefix.length);
  if (!token) {
    throw new HeaderInvalidError('authorization header missing token');
  }

  return await byToken(token);
}

const tokenAuthCache = TypedCache<string, { user: res.ISlimUser; appID: string }>(
  (token) => `auth:v3:token:${token}`,
);

export async function byToken(accessToken: string): Promise<IAuth | null> {
  const cached = await tokenAuthCache.get(accessToken);
  if (cached) {
    return await userToAuth(cached.user, cached.appID);
  }

  const token = await db.query.chiiAccessToken.findFirst({
    where: op.and(
      op.sql`access_token = ${accessToken} collate utf8mb4_bin`,
      op.gt(schema.chiiAccessToken.expiredAt, new Date()),
    ),
  });

  if (!token) {
    throw new TokenNotValidError();
  }

  if (!token.userID) {
    throw new Error('access token without user id');
  }

  const u = await fetchUserX(intval(token.userID));

  await tokenAuthCache.set(accessToken, { user: u, appID: token.clientID }, 60 * 60 * 24);

  return await userToAuth(u, token.clientID);
}

const userCache = TypedCache<number, res.ISlimUser>((userID) => `auth:v2:user:${userID}`);

export async function byUserID(userID: number): Promise<IAuth> {
  const cached = await userCache.get(userID);
  if (cached) {
    return await userToAuth(cached);
  }

  const u = await fetchUserX(userID);

  await userCache.set(userID, u, 60 * 60);

  return await userToAuth(u);
}

export function emptyAuth(): IAuth {
  return {
    userID: 0,
    login: false,
    permission: {},
    allowNsfw: false,
    regTime: 0,
    groupID: 0,
    source: defaultSource,
  };
}

async function userToAuth(user: res.ISlimUser, appID?: string): Promise<IAuth> {
  const perms = await fetchPermission(user.group);
  return {
    userID: user.id,
    login: true,
    permission: perms,
    allowNsfw:
      !nsfwRestrictedUIDs.has(user.id) &&
      !perms.ban_visit &&
      !perms.user_ban &&
      DateTime.now().toUnixInteger() - user.joinedAt >= 60 * 60 * 24 * 90,
    regTime: user.joinedAt,
    groupID: user.group,
    source: getTimelineSourceFromAppID(appID ?? '') ?? defaultSource,
  };
}

function processPassword(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

export async function comparePassword(hashed: string, input: string): Promise<boolean> {
  return compare(processPassword(input), hashed);
}
