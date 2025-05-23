import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { db, op, schema } from '@app/drizzle';
import { emptyAuth } from '@app/lib/auth/index.ts';
import { CollectionPrivacy, CollectionType } from '@app/lib/subject/type.ts';
import { createTestServer } from '@app/tests/utils.ts';

import { setup } from './collection.ts';

async function resetSubjectInterest() {
  await db
    .delete(schema.chiiSubjectInterests)
    .where(
      op.and(
        op.eq(schema.chiiSubjectInterests.uid, 382951),
        op.eq(schema.chiiSubjectInterests.subjectID, 12),
      ),
    );
  await db
    .delete(schema.chiiEpStatus)
    .where(op.and(op.eq(schema.chiiEpStatus.uid, 382951), op.eq(schema.chiiEpStatus.sid, 12)));
  // reset collection count
  await db
    .update(schema.chiiSubjects)
    .set({
      collect: 4534,
      doing: 215,
    })
    .where(op.eq(schema.chiiSubjects.id, 12));
  // reset rating count
  await db
    .update(schema.chiiSubjectFields)
    .set({
      rate10: 168,
    })
    .where(op.eq(schema.chiiSubjectFields.id, 12));
}

describe('subject collection', () => {
  beforeEach(async () => {
    await resetSubjectInterest();
  });

  afterEach(async () => {
    await resetSubjectInterest();
  });

  test('should get subject collections', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 382951,
      },
    });
    await app.register(setup);
    const res = await app.inject({
      method: 'get',
      url: '/collections/subjects',
      query: { limit: '2', offset: '0' },
    });
    expect(res.json()).toMatchSnapshot();
  });

  test('should create subject collection', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 382951,
      },
    });
    await app.register(setup);
    const res = await app.inject({
      method: 'put',
      url: '/collections/subjects/12',
      body: {
        type: CollectionType.Doing,
        rate: 10,
        comment: 'test',
        private: false,
        progress: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const [collection] = await db
      .select()
      .from(schema.chiiSubjectInterests)
      .where(
        op.and(
          op.eq(schema.chiiSubjectInterests.uid, 382951),
          op.eq(schema.chiiSubjectInterests.subjectID, 12),
        ),
      );
    expect(collection).toBeDefined();
    expect(collection?.type).toBe(CollectionType.Doing);
    expect(collection?.epStatus).toBe(0);
    expect(collection?.volStatus).toBe(0);
    expect(collection?.rate).toBe(10);
    expect(collection?.comment).toBe('test');
    expect(collection?.privacy).toBe(CollectionPrivacy.Public);
    const [subject] = await db
      .select()
      .from(schema.chiiSubjects)
      .where(op.eq(schema.chiiSubjects.id, 12));
    expect(subject?.doing).toBe(216);
    const [subjectFields] = await db
      .select()
      .from(schema.chiiSubjectFields)
      .where(op.eq(schema.chiiSubjectFields.id, 12));
    expect(subjectFields?.rate10).toBe(169);
  });

  test('should create subject collection with progress', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 382951,
      },
    });
    await app.register(setup);
    const res = await app.inject({
      method: 'put',
      url: '/collections/subjects/12',
      body: {
        type: CollectionType.Collect,
        progress: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const [collection] = await db
      .select()
      .from(schema.chiiSubjectInterests)
      .where(
        op.and(
          op.eq(schema.chiiSubjectInterests.uid, 382951),
          op.eq(schema.chiiSubjectInterests.subjectID, 12),
        ),
      );
    expect(collection).toBeDefined();
    expect(collection?.type).toBe(CollectionType.Collect);
    expect(collection?.epStatus).toBe(27);
    expect(collection?.volStatus).toBe(0);
    expect(collection?.privacy).toBe(CollectionPrivacy.Public);
    const [subject] = await db
      .select()
      .from(schema.chiiSubjects)
      .where(op.eq(schema.chiiSubjects.id, 12));
    expect(subject?.collect).toBe(4535);
  });
});

describe('character collection', () => {
  test('should get character collections', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 382951,
      },
    });
    await app.register(setup);
    const res = await app.inject({
      method: 'get',
      url: '/collections/characters',
      query: { limit: '2', offset: '0' },
    });
    expect(res.json()).toMatchSnapshot();
  });
});

describe('person collection', () => {
  test('should get person collections', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 382951,
      },
    });
    await app.register(setup);
    const res = await app.inject({
      method: 'get',
      url: '/collections/persons',
      query: { limit: '2', offset: '0' },
    });
    expect(res.json()).toMatchSnapshot();
  });
});

describe('index collection', () => {
  test('should get index collections', async () => {
    const app = createTestServer({
      auth: {
        ...emptyAuth(),
        login: true,
        userID: 382951,
      },
    });
    await app.register(setup);
    const res = await app.inject({
      method: 'get',
      url: '/collections/indexes',
      query: { limit: '2', offset: '0' },
    });
    expect(res.json()).toMatchSnapshot();
  });
});
