import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { IAuth } from '@app/lib/auth/index.ts';
import { emptyAuth, UserGroup } from '@app/lib/auth/index.ts';
import * as Notify from '@app/lib/notify.ts';
import * as orm from '@app/lib/orm/index.ts';
import type { ITopicDetails } from '@app/lib/topic/index.ts';
import { CommentState, TopicDisplay, TopicParentType } from '@app/lib/topic/type.ts';
import * as Topic from '@app/lib/topic/index.ts';
import { createTestServer } from '@app/tests/utils.ts';

import { setup } from './post.ts';

/**
 * Topic 375793
 *
 * Reply 2177419 (287622)
 *
 * - Sub-reply 2177420 (287622)
 */

beforeEach(async () => {
  await orm.GroupPostRepo.update(
    {
      id: 2177420,
    },
    {
      state: 0,
      content: 'before-test',
    },
  );
  await orm.SubjectPostRepo.update(
    {
      id: 3,
    },
    {
      state: 0,
      content: 'before-test',
    },
  );
});

describe('get group post', () => {
  test('ok', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 2,
      },
    });

    await app.register(setup);

    const res = await app.inject({ method: 'get', url: '/groups/-/posts/2092074' });
    expect(res.json()).toMatchInlineSnapshot(`
      Object {
        "createdAt": 1662283112,
        "creator": Object {
          "avatar": Object {
            "large": "https://lain.bgm.tv/pic/user/l/icon.jpg",
            "medium": "https://lain.bgm.tv/pic/user/m/icon.jpg",
            "small": "https://lain.bgm.tv/pic/user/s/icon.jpg",
          },
          "id": 287622,
          "joinedAt": 0,
          "nickname": "nickname 287622",
          "sign": "sing 287622",
          "username": "287622",
        },
        "id": 2092074,
        "reactions": Array [],
        "replies": Array [],
        "state": 0,
        "text": "sub",
      }
    `);
  });

  test('not found', async () => {
    const app = createTestServer({});
    await app.register(setup);

    const res = await app.inject({ method: 'get', url: '/groups/-/posts/209207400' });
    expect(res.statusCode).toBe(404);
  });
});

describe('get subject post', () => {
  test('ok', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 2,
      },
    });

    await app.register(setup);

    const res = await app.inject({ method: 'get', url: '/subjects/-/posts/3' });
    expect(res.json()).toMatchInlineSnapshot(`
      Object {
        "createdAt": 1216021295,
        "creator": Object {
          "avatar": Object {
            "large": "https://lain.bgm.tv/pic/user/l/icon.jpg",
            "medium": "https://lain.bgm.tv/pic/user/m/icon.jpg",
            "small": "https://lain.bgm.tv/pic/user/s/icon.jpg",
          },
          "id": 2,
          "joinedAt": 0,
          "nickname": "nickname 2",
          "sign": "sing 2",
          "username": "2",
        },
        "id": 3,
        "reactions": Array [],
        "replies": Array [],
        "state": 0,
        "text": "before-test",
      }
    `);
  });

  test('not found', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 2,
      },
    });
    await app.register(setup);

    const res = await app.inject({ method: 'get', url: '/subjects/-/posts/114514' });
    expect(res.statusCode).toBe(404);
  });
});

describe('edit group post', () => {
  test('should edit post', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 287622,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/posts/2177420',
      method: 'put',
      payload: { text: 'new content' },
    });

    expect(res.statusCode).toBe(200);

    const pst = await orm.GroupPostRepo.findOneBy({
      id: 2177420,
    });

    expect(pst?.content).toBe('new content');
  });

  test('should not edit post', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 287622 + 1,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/posts/2177420',
      method: 'put',
      payload: { text: 'new content' },
    });

    expect(res.json()).toMatchInlineSnapshot(`
      Object {
        "code": "NOT_ALLOWED",
        "error": "Unauthorized",
        "message": "you don't have permission to edit reply not created by you",
        "statusCode": 401,
      }
    `);
    expect(res.statusCode).toBe(401);
  });

  test('should not edit post with sub-reply', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 287622,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/posts/2177419',
      method: 'put',
      payload: { text: 'new content' },
    });

    expect(res.json()).toMatchInlineSnapshot(`
      Object {
        "code": "NOT_ALLOWED",
        "error": "Unauthorized",
        "message": "you don't have permission to edit a reply with sub-reply",
        "statusCode": 401,
      }
    `);
    expect(res.statusCode).toBe(401);
  });
});

describe('edit subject post', () => {
  test('should edit post', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 2,
      },
    });
    await app.register(setup);

    const res = await app.inject({
      url: '/subjects/-/posts/3',
      method: 'put',
      payload: { text: 'new content' },
    });

    expect(res.statusCode).toBe(200);

    const pst = await orm.SubjectPostRepo.findOneBy({
      id: 3,
    });

    expect(pst?.content).toBe('new content');
  });

  test('should not edit post', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 2 + 1,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/subjects/-/posts/3',
      method: 'put',
      payload: { text: 'new new content' },
    });

    expect(res.json()).toMatchInlineSnapshot(`
      Object {
        "code": "NOT_ALLOWED",
        "error": "Unauthorized",
        "message": "you don't have permission to edit reply not created by you",
        "statusCode": 401,
      }
    `);
    expect(res.statusCode).toBe(401);
  });
});

describe('create group post reply', () => {
  const createTopicReply = vi.fn().mockResolvedValue({
    id: 6,
    content: '',
    state: CommentState.Normal,
    createdAt: DateTime.fromISO('2021-10-21').toUnixInteger(),
    type: TopicParentType.Group,
    topicID: 371602,
    user: {
      img: '',
      username: 'u',
      groupID: UserGroup.Normal,
      id: 9,
      nickname: 'n',
      regTime: DateTime.fromISO('2008-10-01').toUnixInteger(),
      sign: '',
    },
  });

  const notifyMock = vi.fn();
  beforeEach(() => {
    vi.spyOn(Topic, 'createTopicReply').mockImplementation(createTopicReply);
    vi.spyOn(Notify, 'create').mockImplementation(notifyMock);
    vi.spyOn(Topic, 'fetchTopicDetail').mockImplementationOnce(
      (_: IAuth, type: 'group' | 'subject', id: number): Promise<ITopicDetails | null> => {
        if (id !== 371602) {
          return Promise.resolve(null);
        }

        return Promise.resolve({
          contentPost: { id: 100 },
          replies: [],
          creatorID: 287622,
          id: id,
          title: 't',
          display: TopicDisplay.Normal,
          createdAt: DateTime.now().toUnixInteger(),
          text: 't',
          state: CommentState.Normal,
          parentID: 1,
        });
      },
    );
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('should create group post reply', async () => {
    const app = createTestServer({
      auth: {
        groupID: UserGroup.Normal,
        login: true,
        permission: {},
        allowNsfw: true,
        regTime: 0,
        userID: 1,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/topics/371602/replies',
      method: 'post',
      payload: {
        content: 'post contents',
        'cf-turnstile-response': 'fake-response',
      },
    });

    expect(res.json()).toMatchObject({
      creator: {
        avatar: {
          large: 'https://lain.bgm.tv/pic/user/l/icon.jpg',
          medium: 'https://lain.bgm.tv/pic/user/m/icon.jpg',
          small: 'https://lain.bgm.tv/pic/user/s/icon.jpg',
        },
        id: 1,
        joinedAt: 0,
        nickname: 'nickname 1',
        username: '1',
      },
      state: 0,
      text: 'post contents',
    });
    expect(res.statusCode).toBe(200);
    expect(notifyMock).toHaveBeenCalledOnce();
    expect(notifyMock).toBeCalledWith(
      expect.objectContaining({
        destUserID: 287622,
        type: Notify.Type.GroupTopicReply,
      }),
    );
  });

  test('should not create with banned user', async () => {
    const app = createTestServer({
      auth: {
        groupID: UserGroup.Normal,
        login: true,
        permission: {
          ban_post: true,
        },
        regTime: 0,
        allowNsfw: true,
        userID: 1,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/topics/371602/replies',
      method: 'post',
      payload: {
        content: 'post contents',
        'cf-turnstile-response': 'fake-response',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(createTopicReply).toBeCalledTimes(0);
  });

  test('should not create on non-existing topic', async () => {
    const app = createTestServer({
      auth: {
        groupID: UserGroup.Normal,
        login: true,
        permission: {},
        allowNsfw: true,
        regTime: 0,
        userID: 1,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/topics/3716000/replies',
      method: 'post',
      payload: {
        content: 'post contents',
        'cf-turnstile-response': 'fake-response',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchSnapshot();
  });

  test('should not create on non-existing topic reply', async () => {
    const app = createTestServer({
      auth: {
        groupID: UserGroup.Normal,
        login: true,
        permission: {},
        allowNsfw: true,
        regTime: 0,
        userID: 1,
      },
    });

    await app.register(setup);

    const res = await app.inject({
      url: '/groups/-/topics/371602/replies',
      method: 'post',
      payload: {
        content: 'post contents',
        replyTo: 11,
        'cf-turnstile-response': 'fake-response',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchSnapshot();
  });
});

async function testServer(...arg: Parameters<typeof createTestServer>) {
  const app = createTestServer(...arg);

  await app.register(setup);
  return app;
}

describe('delete group post', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('not found', async () => {
    const app = await testServer({ auth: { login: true, userID: 1 } });
    const res = await app.inject({
      url: '/groups/-/posts/2092074123',
      method: 'delete',
    });

    expect(res.statusCode).toBe(404);
  });

  test('ok', async () => {
    const app = await testServer({ auth: { login: true, userID: 287622 } });

    const res = await app.inject({ method: 'delete', url: '/groups/-/posts/2177420' });
    expect(res.json()).toMatchSnapshot();
    expect(res.statusCode).toBe(200);
  });

  test('not allowed not login', async () => {
    const app = await testServer();
    const res = await app.inject({ url: '/groups/-/posts/2177420', method: 'delete' });

    expect(res.json()).toMatchSnapshot();
    expect(res.statusCode).toBe(401);
  });

  test('not allowed wrong user', async () => {
    const app = await testServer({ auth: { login: true, userID: 1122 } });
    const res = await app.inject({ url: '/groups/-/posts/2177420', method: 'delete' });

    expect(res.json()).toMatchSnapshot();
    expect(res.statusCode).toBe(401);
  });
});

describe('delete subject post', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('not found', async () => {
    const app = await testServer({ auth: { login: true, userID: 2 } });
    const res = await app.inject({
      url: '/subjects/-/posts/114514',
      method: 'delete',
    });

    expect(res.statusCode).toBe(404);
  });

  test('ok', async () => {
    const app = await testServer({ auth: { login: true, userID: 2 } });

    const res = await app.inject({ method: 'delete', url: '/subjects/-/posts/3' });
    expect(res.json()).toMatchSnapshot();
    expect(res.statusCode).toBe(200);
  });

  test('not allowed not login', async () => {
    const app = await testServer();
    const res = await app.inject({ url: '/subjects/-/posts/3', method: 'delete' });

    expect(res.json()).toMatchSnapshot();
    expect(res.statusCode).toBe(401);
  });

  test('not allowed wrong user', async () => {
    const app = await testServer({ auth: { login: true, userID: 1122 } });
    const res = await app.inject({ url: '/subjects/-/posts/3', method: 'delete' });

    expect(res.json()).toMatchSnapshot();
    expect(res.statusCode).toBe(401);
  });
});
