import * as lo from 'lodash-es';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { db, op, schema } from '@app/drizzle';
import type { IAuth } from '@app/lib/auth/index.ts';
import { UserGroup } from '@app/lib/auth/index.ts';
import { LikeType } from '@app/lib/like.ts';
import { SubjectImageRepo } from '@app/lib/orm/index.ts';
import * as Subject from '@app/lib/subject/index.ts';
import { setup } from '@app/routes/private/routes/wiki/subject/index.ts';
import { createTestServer } from '@app/tests/utils.ts';

async function testApp(auth?: Partial<IAuth>) {
  const app = createTestServer({
    auth: lo.assign(
      {
        login: true,
        allowNsfw: true,
        regTime: DateTime.now().toUnixInteger(),
        userID: 1,
        groupID: UserGroup.BangumiAdmin,
        permission: { subject_edit: true },
      },
      auth ?? {},
    ),
  });

  await app.register(setup);

  return app;
}

vi.spyOn(Subject, 'onSubjectVote').mockImplementation(() => Promise.resolve());

describe('should vote for subject cover', () => {
  beforeAll(async () => {
    await db.delete(schema.chiiLikes).where(op.eq(schema.chiiLikes.type, LikeType.SubjectCover));
    await SubjectImageRepo.upsert(
      {
        ban: 0,
        target: 'testing target',
        subjectID: 184017,
        uid: 1,
        vote: 0,
        id: 100,
        createdAt: new Date(),
      },
      [],
    );
  });

  afterAll(async () => {
    await db.delete(schema.chiiLikes).where(op.eq(schema.chiiLikes.type, LikeType.SubjectCover));
    await SubjectImageRepo.delete({ id: 100 });
  });

  test('vote require permission', async () => {
    const app = await testApp();
    {
      const res = await app.inject({
        url: '/subjects/184017/covers/100/vote',
        method: 'POST',
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const likes = await db
        .select()
        .from(schema.chiiLikes)
        .where(op.eq(schema.chiiLikes.deleted, false));
      expect(likes).not.toHaveLength(0);
    }

    {
      const res = await app.inject({
        url: '/subjects/184017/covers/100/vote',
        method: 'DELETE',
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const likes = await db
        .select()
        .from(schema.chiiLikes)
        .where(op.eq(schema.chiiLikes.deleted, true));
      expect(likes).not.toHaveLength(0);
    }
  });
});
