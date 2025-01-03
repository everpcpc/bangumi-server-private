import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { IAuth } from '@app/lib/auth/index.ts';
import { emptyAuth, UserGroup } from '@app/lib/auth/index.ts';
import * as orm from '@app/lib/orm/index.ts';
import { fetchTopicDetail } from '@app/lib/topic/index.ts';
import { TopicParentType } from '@app/lib/topic/type.ts';
import { createTestServer } from '@app/tests/utils.ts';

import { setup } from './topic.ts';
import { join } from 'path';

const expectedGroupTopic = {
  createdAt: 1657885648,
  creator: {
    avatar: {
      large: 'https://lain.bgm.tv/pic/user/l/icon.jpg',
      medium: 'https://lain.bgm.tv/pic/user/m/icon.jpg',
      small: 'https://lain.bgm.tv/pic/user/s/icon.jpg',
    },
    id: 287622,
    joinedAt: 0,
    nickname: 'nickname 287622',
    sign: 'sing 287622',
    username: '287622',
  },
  id: 371602,
  parentID: 4215,
  title: 'tes',
};

describe('group topics', () => {
  test('should failed on not found group', async () => {
    const app = await createTestServer();
    await app.register(setup);

    const res = await app.inject({
      url: '/groups/non-existing/topics',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchSnapshot();
  });

  test('should return data', async () => {
    const app = await createTestServer();
    await app.register(setup);

    const res = await app.inject({
      url: '/groups/sandbox/topics',
    });
    const data = res.json();

    expect(res.statusCode).toBe(200);
    expect(data.data).toContainEqual(expect.objectContaining(expectedGroupTopic));
  });

  test('should fetch group profile', async () => {
    const app = await createTestServer();
    await app.register(setup);

    const res = await app.inject('/groups/sandbox/profile');
    const data = res.json();

    expect(res.statusCode).toBe(200);
    expect(data.group).toEqual({
      createdAt: 1531631310,
      description: '[s]非[/s]官方沙盒',
      icon: 'https://lain.bgm.tv/pic/icon/s/000/00/42/4215.jpg?r=1531631345',
      id: 4215,
      name: 'sandbox',
      nsfw: false,
      title: '沙盒',
      totalMembers: 3,
    });
    expect(data.topics).toContainEqual(expect.objectContaining(expectedGroupTopic));
  });

  test('should fetch topic details', async () => {
    const app = await createTestServer();
    await app.register(setup);

    const res = await app.inject('/groups/-/topics/379821');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchSnapshot();
  });
});

describe('create group post', () => {
  const createPostInGroup = vi.fn().mockResolvedValue({ id: 1 });
  vi.spyOn(orm, 'createPost').mockImplementation(createPostInGroup);

  test('should create group topic', async () => {
    const app = createTestServer();

    app.addHook('preHandler', (req, res, done) => {
      req.auth = {
        groupID: UserGroup.Normal,
        login: true,
        permission: {},
        allowNsfw: true,
        regTime: 0,
        userID: 100,
      } satisfies IAuth;
      done();
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/sandbox/topics',
      method: 'post',
      payload: {
        title: 'post title',
        text: 'post contents',
        'cf-turnstile-response': 'fake-response',
      },
    });

    expect(res.json()).toMatchObject({ id: 1 });
    expect(res.statusCode).toBe(200);
  });

  test('should not create with banned user', async () => {
    const app = createTestServer();

    app.addHook('preHandler', (req, res, done) => {
      req.auth = {
        groupID: UserGroup.Normal,
        login: true,
        permission: {
          ban_post: true,
        },
        allowNsfw: true,
        regTime: 0,
        userID: 1,
      } satisfies IAuth;
      done();
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/sandbox/topics',
      method: 'post',
      payload: {
        title: 'post title',
        text: 'post contents',
        'cf-turnstile-response': 'fake-response',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(createPostInGroup).toBeCalledTimes(1);
  });
});

describe('edit group topic', () => {
  test('should edit topic', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 287622,
      },
    });

    await app.register(setup);

    {
      const res = await app.inject({
        url: '/groups/-/topics/375793',
        method: 'put',
        payload: {
          title: 'new topic title',
          text: 'new contents',
          'cf-turnstile-response': 'fake-response',
        },
      });

      expect(res.statusCode).toBe(200);

      const topic = await fetchTopicDetail(emptyAuth(), TopicParentType.Group, 375793);

      expect(topic?.title).toBe('new topic title');
      expect(topic?.text).toBe('new contents');
    }

    {
      const res = await app.inject({
        url: '/groups/-/topics/375793',
        method: 'put',
        payload: {
          title: 'new topic title 2',
          text: 'new contents 2',
          'cf-turnstile-response': 'fake-response',
        },
      });

      expect(res.statusCode).toBe(200);

      const topic = await fetchTopicDetail(emptyAuth(), TopicParentType.Group, 375793);

      expect(topic?.title).toBe('new topic title 2');
      expect(topic?.text).toBe('new contents 2');
    }
  });

  test('should not edited topic by non-owner', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 1,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/topics/371602',
      method: 'put',
      payload: {
        title: 'new topic title',
        text: 'new contents',
        'cf-turnstile-response': 'fake-response',
      },
    });

    expect(res.json()).toMatchInlineSnapshot(`
      Object {
        "code": "NOT_ALLOWED",
        "error": "Unauthorized",
        "message": "you don't have permission to edit this topic",
        "statusCode": 401,
      }
    `);
    expect(res.statusCode).toBe(401);
  });
});
