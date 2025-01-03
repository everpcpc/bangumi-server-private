import * as crypto from 'node:crypto';

import { createError } from '@fastify/error';
import { compare } from '@node-rs/bcrypt';
import * as op from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { db } from '@app/drizzle/db.ts';
import { chiiAccessToken } from '@app/drizzle/schema.ts';
import { TypedCache } from '@app/lib/cache.ts';
import type { IUser, Permission } from '@app/lib/orm/index.ts';
import { fetchPermission, fetchUserX } from '@app/lib/orm/index.ts';
import { intval } from '@app/lib/utils/index.ts';
import NodeCache from '@app/vendor/node-cache.ts';

const tokenPrefix = 'Bearer ';
export const NeedLoginError = createError<[string]>(
  'NEED_LOGIN',
  'you need to login before %s',
  401,
);
export const NotAllowedError = createError<[string]>(
  'NOT_ALLOWED',
  `you don't have permission to %s`,
  401,
);
const HeaderInvalidError = createError<[string]>('AUTHORIZATION_INVALID', '%s', 401);

const TokenNotValidError = createError<[]>(
  'TOKEN_INVALID',
  "can't find access token or it has been expired",
  401,
);

export const enum UserGroup {
  Unknown = 0,
  Admin = 1,
  BangumiAdmin = 2,
  WindowAdmin = 3,
  Quite = 4,
  Banned = 5,
  // 不太清楚具体是什么
  _6 = 6,
  // 不太清楚具体是什么
  _7 = 7,
  CharacterAdmin = 8,
  WikiAdmin = 9,
  Normal = 10,
  WikiEditor = 11,
}

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
  groupID: UserGroup;
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

const tokenAuthCache = TypedCache<string, IUser>((token) => `auth:token:${token}`);

export async function byToken(accessToken: string): Promise<IAuth | null> {
  const cached = await tokenAuthCache.get(accessToken);
  if (cached) {
    return await userToAuth(cached);
  }

  const token = await db.query.chiiAccessToken.findFirst({
    where: op.and(
      sql`access_token = ${accessToken} collate utf8mb4_bin`,
      op.gt(chiiAccessToken.expiredAt, new Date()),
    ),
  });

  if (!token) {
    throw new TokenNotValidError();
  }

  if (!token.userID) {
    throw new Error('access token without user id');
  }

  const u = await fetchUserX(intval(token.userID));

  await tokenAuthCache.set(accessToken, u, 60 * 60 * 24);

  return await userToAuth(u);
}

const userCache = TypedCache<number, IUser>((userID) => `auth:user:${userID}`);

export async function byUserID(userID: number): Promise<IAuth> {
  const cached = await userCache.get(userID);
  if (cached) {
    return await userToAuth(cached);
  }

  const u = await fetchUserX(userID);

  await userCache.set(userID, u, 60 * 60);

  return await userToAuth(u);
}

const permissionCache = new NodeCache({ stdTTL: 60 * 10 });

async function getPermission(userGroup?: number): Promise<Readonly<Permission>> {
  if (!userGroup) {
    return Object.freeze({});
  }

  const cached = permissionCache.get(userGroup);
  if (cached) {
    return cached;
  }

  const p = await fetchPermission(userGroup);

  permissionCache.set(userGroup, p);

  return p;
}

export function emptyAuth(): IAuth {
  return {
    userID: 0,
    login: false,
    permission: {},
    allowNsfw: false,
    regTime: 0,
    groupID: 0,
  };
}

async function userToAuth(user: IUser): Promise<IAuth> {
  const perms = await getPermission(user.groupID);
  return {
    userID: user.id,
    login: true,
    permission: perms,
    allowNsfw:
      !nsfwRestrictedUIDs.has(user.id) &&
      !perms.ban_visit &&
      !perms.user_ban &&
      DateTime.now().toUnixInteger() - user.regTime >= 60 * 60 * 24 * 90,
    regTime: user.regTime,
    groupID: user.groupID,
  };
}

function processPassword(s: string): string {
  return crypto.createHash('md5').update(s).digest('hex');
}

export async function comparePassword(hashed: string, input: string): Promise<boolean> {
  return compare(processPassword(input), hashed);
}
