import { Type as t } from '@sinclair/typebox';
import * as lo from 'lodash-es';
import { DateTime } from 'luxon';

import { db } from '@app/drizzle/db.ts';
import * as schema from '@app/drizzle/schema';
import { NotAllowedError } from '@app/lib/auth';
import { Dam } from '@app/lib/dam';
import { BadRequestError, CaptchaError } from '@app/lib/error';
import { Security, Tag } from '@app/lib/openapi/index.ts';
import { turnstile } from '@app/lib/services/turnstile';
import { getTimelineInbox } from '@app/lib/timeline/inbox';
import { fetchTimelineByIDs } from '@app/lib/timeline/item.ts';
import {
  TimelineCat,
  TimelineMode,
  TimelineSource,
  TimelineStatusType,
} from '@app/lib/timeline/type.ts';
import * as fetcher from '@app/lib/types/fetcher.ts';
import * as req from '@app/lib/types/req.ts';
import * as res from '@app/lib/types/res.ts';
import { LimitAction } from '@app/lib/utils/rate-limit';
import { requireLogin } from '@app/routes/hooks/pre-handler';
import { rateLimit } from '@app/routes/hooks/rate-limit';
import type { App } from '@app/routes/type.ts';

// eslint-disable-next-line @typescript-eslint/require-await
export async function setup(app: App) {
  app.get(
    '/timeline',
    {
      schema: {
        summary: '获取时间线',
        operationId: 'getTimeline',
        tags: [Tag.Timeline],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        querystring: t.Object({
          mode: t.Optional(
            req.Ref(req.FilterMode, {
              description: '登录时默认为 friends, 未登录或没有好友时始终为 all',
            }),
          ),
          limit: t.Optional(
            t.Integer({ default: 20, minimum: 1, maximum: 20, description: 'min 1, max 20' }),
          ),
          until: t.Optional(t.Integer({ description: 'max timeline id to fetch from' })),
        }),
        response: {
          200: t.Array(res.Ref(res.Timeline)),
        },
      },
    },
    async ({ auth, query: { mode = TimelineMode.Friends, limit = 20, until } }) => {
      const ids = [];
      switch (mode) {
        case TimelineMode.Friends: {
          const ret = await getTimelineInbox(auth.userID, limit, until);
          ids.push(...ret);
          break;
        }
        case TimelineMode.All: {
          const ret = await getTimelineInbox(0, limit, until);
          ids.push(...ret);
          break;
        }
      }
      const result = await fetchTimelineByIDs(ids, auth.allowNsfw);
      const items = [];
      for (const tid of ids) {
        const item = result[tid];
        if (item) {
          items.push(item);
        }
      }
      const uids = items.map((v) => v.uid);
      const users = await fetcher.fetchSlimUsersByIDs(uids);
      for (const item of items) {
        item.user = users[item.uid];
      }
      return items;
    },
  );

  app.post(
    '/timeline',
    {
      schema: {
        summary: '发送时间线吐槽',
        operationId: 'createTimelineSay',
        tags: [Tag.Timeline],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        body: req.Ref(req.CreateTimelineSay),
        response: {
          200: t.Object({ id: t.Integer() }),
        },
      },
      preHandler: [requireLogin('posting a say')],
    },
    async ({ auth, body: { content, turnstileToken } }) => {
      if (!(await turnstile.verify(turnstileToken))) {
        throw new CaptchaError();
      }
      if (!Dam.allCharacterPrintable(content)) {
        throw new BadRequestError('text contains invalid invisible character');
      }
      if (auth.permission.ban_post) {
        throw new NotAllowedError('post timeline say');
      }
      const text = lo.escape(content).normalize('NFC');
      if (text.length > 380) {
        throw new BadRequestError('content too long');
      }

      await rateLimit(LimitAction.Timeline, auth.userID);

      const [result] = await db.insert(schema.chiiTimeline).values({
        uid: auth.userID,
        cat: TimelineCat.Status,
        type: TimelineStatusType.Tsukkomi,
        related: '',
        memo: text,
        img: '',
        batch: false,
        source: TimelineSource.API,
        replies: 0,
        createdAt: DateTime.now().toUnixInteger(),
      });
      return { id: result.insertId };
    },
  );
}
