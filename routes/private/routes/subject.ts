import { Type as t } from '@sinclair/typebox';

import { db, op } from '@app/drizzle/db.ts';
import type * as orm from '@app/drizzle/orm.ts';
import * as schema from '@app/drizzle/schema';
import { NotAllowedError } from '@app/lib/auth/index.ts';
import { Dam, dam } from '@app/lib/dam.ts';
import { BadRequestError, CaptchaError, NotFoundError } from '@app/lib/error.ts';
import { fetchTopicReactions } from '@app/lib/like.ts';
import { Security, Tag } from '@app/lib/openapi/index.ts';
import { turnstile } from '@app/lib/services/turnstile.ts';
import type { SubjectFilter, SubjectSort } from '@app/lib/subject/type.ts';
import {
  CanViewTopicContent,
  CanViewTopicReply,
  ListTopicDisplays,
} from '@app/lib/topic/display.ts';
import { CommentState, TopicDisplay } from '@app/lib/topic/type.ts';
import * as convert from '@app/lib/types/convert.ts';
import * as fetcher from '@app/lib/types/fetcher.ts';
import * as req from '@app/lib/types/req.ts';
import * as res from '@app/lib/types/res.ts';
import { LimitAction } from '@app/lib/utils/rate-limit';
import { requireLogin } from '@app/routes/hooks/pre-handler.ts';
import { rateLimit } from '@app/routes/hooks/rate-limit';
import type { App } from '@app/routes/type.ts';

function toSubjectRelation(
  subject: orm.ISubject,
  fields: orm.ISubjectFields,
  relation: orm.ISubjectRelation,
): res.ISubjectRelation {
  return {
    subject: convert.toSlimSubject(subject, fields),
    relation: convert.toSubjectRelationType(relation),
    order: relation.order,
  };
}

function toSubjectCharacter(
  character: orm.ICharacter,
  relation: orm.ICharacterSubject,
  actors: res.ISlimPerson[],
): res.ISubjectCharacter {
  return {
    character: convert.toSlimCharacter(character),
    actors: actors,
    type: relation.type,
    order: relation.order,
  };
}

function toSubjectStaff(person: orm.IPerson, relations: orm.IPersonSubject[]): res.ISubjectStaff {
  return {
    person: convert.toSlimPerson(person),
    positions: relations.map((r) => convert.toSubjectStaffPosition(r)),
  };
}

function toSubjectRec(
  subject: orm.ISubject,
  fields: orm.ISubjectFields,
  rec: orm.ISubjectRec,
): res.ISubjectRec {
  return {
    subject: convert.toSlimSubject(subject, fields),
    sim: rec.sim,
    count: rec.count,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function setup(app: App) {
  app.get(
    '/subjects/:subjectID',
    {
      schema: {
        summary: '获取条目',
        operationId: 'getSubject',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        response: {
          200: res.Ref(res.Subject),
        },
      },
    },
    async ({ auth, params: { subjectID } }) => {
      const data = await db
        .select()
        .from(schema.chiiSubjects)
        .innerJoin(
          schema.chiiSubjectFields,
          op.eq(schema.chiiSubjects.id, schema.chiiSubjectFields.id),
        )
        .where(
          op.and(
            op.eq(schema.chiiSubjects.id, subjectID),
            op.ne(schema.chiiSubjects.ban, 1),
            auth.allowNsfw ? undefined : op.eq(schema.chiiSubjects.nsfw, false),
          ),
        )
        .execute();
      for (const d of data) {
        return convert.toSubject(d.chii_subjects, d.chii_subject_fields);
      }
      throw new NotFoundError(`subject ${subjectID}`);
    },
  );

  app.get(
    '/subjects',
    {
      schema: {
        summary: '获取条目列表',
        operationId: 'getSubjects',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        querystring: t.Object({
          type: req.Ref(req.SubjectType),
          sort: req.Ref(req.SubjectSort),
          page: t.Optional(t.Integer({ default: 1, minimum: 1, description: 'min 1' })),
          cat: t.Optional(
            t.Integer({
              description:
                '每种条目类型分类不同，具体参考 https://github.com/bangumi/common 的 subject_platforms.yaml',
            }),
          ),
          series: t.Optional(t.Boolean({ description: '是否为系列，仅对书籍类型的条目有效' })),
          year: t.Optional(t.Integer({ description: '年份' })),
          month: t.Optional(t.Integer({ description: '月份' })),
          tags: t.Optional(
            t.Array(t.String({ description: 'wiki 标签，包括 分类/来源/类型/题材/地区/受众 等' })),
          ),
        }),
        response: {
          200: res.Paged(res.Ref(res.Subject)),
        },
      },
    },
    async ({ auth, query: { type, cat, series, year, month, sort, tags, page = 1 } }) => {
      const filter = {
        type,
        nsfw: auth.allowNsfw,
        cat,
        series,
        year,
        month,
        tags,
      } satisfies SubjectFilter;
      const result = await fetcher.fetchSubjectIDsByFilter(filter, sort as SubjectSort, page);
      if (result.data.length === 0) {
        return {
          data: [],
          total: result.total,
        };
      }
      const subjects = await fetcher.fetchSubjectsByIDs(result.data);
      const data = [];
      for (const subjectID of result.data) {
        const subject = subjects[subjectID];
        if (subject) {
          data.push(subject);
        }
      }
      return {
        data,
        total: result.total,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/episodes',
    {
      schema: {
        summary: '获取条目的剧集',
        operationId: 'getSubjectEpisodes',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          type: t.Optional(req.Ref(req.EpisodeType)),
          limit: t.Optional(
            t.Integer({ default: 100, minimum: 1, maximum: 1000, description: 'max 1000' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.Episode)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { type, limit = 100, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const condition = op.and(
        op.eq(schema.chiiEpisodes.subjectID, subjectID),
        op.ne(schema.chiiEpisodes.ban, 1),
        type ? op.eq(schema.chiiEpisodes.type, type) : undefined,
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.count() })
        .from(schema.chiiEpisodes)
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiEpisodes)
        .where(condition)
        .orderBy(
          op.asc(schema.chiiEpisodes.disc),
          op.asc(schema.chiiEpisodes.type),
          op.asc(schema.chiiEpisodes.sort),
        )
        .limit(limit)
        .offset(offset)
        .execute();
      const episodes = data.map((d) => convert.toSlimEpisode(d));
      return {
        data: episodes,
        total: count,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/relations',
    {
      schema: {
        summary: '获取条目的关联条目',
        operationId: 'getSubjectRelations',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          type: t.Optional(req.Ref(req.SubjectType)),
          offprint: t.Optional(t.Boolean({ default: false, description: '是否单行本' })),
          limit: t.Optional(
            t.Integer({ default: 20, minimum: 1, maximum: 100, description: 'max 100' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.SubjectRelation)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { type, offprint, limit = 20, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const relationTypeOffprint = 1003;
      let offprintCondition;
      switch (offprint) {
        case true: {
          offprintCondition = op.eq(schema.chiiSubjectRelations.relation, relationTypeOffprint);
          break;
        }
        case false: {
          offprintCondition = op.ne(schema.chiiSubjectRelations.relation, relationTypeOffprint);
          break;
        }
        case undefined: {
          offprintCondition = undefined;
          break;
        }
      }
      const condition = op.and(
        op.eq(schema.chiiSubjectRelations.id, subjectID),
        type ? op.eq(schema.chiiSubjectRelations.relatedType, type) : undefined,
        offprintCondition,
        op.ne(schema.chiiSubjects.ban, 1),
        auth.allowNsfw ? undefined : op.eq(schema.chiiSubjects.nsfw, false),
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.count() })
        .from(schema.chiiSubjectRelations)
        .innerJoin(
          schema.chiiSubjects,
          op.eq(schema.chiiSubjectRelations.relatedID, schema.chiiSubjects.id),
        )
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiSubjectRelations)
        .innerJoin(
          schema.chiiSubjects,
          op.eq(schema.chiiSubjectRelations.relatedID, schema.chiiSubjects.id),
        )
        .innerJoin(
          schema.chiiSubjectFields,
          op.eq(schema.chiiSubjects.id, schema.chiiSubjectFields.id),
        )
        .where(condition)
        .orderBy(
          op.asc(schema.chiiSubjectRelations.relation),
          op.asc(schema.chiiSubjectRelations.order),
        )
        .limit(limit)
        .offset(offset)
        .execute();
      const relations = data.map((d) =>
        toSubjectRelation(d.chii_subjects, d.chii_subject_fields, d.chii_subject_relations),
      );
      return {
        data: relations,
        total: count,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/characters',
    {
      schema: {
        summary: '获取条目的角色',
        operationId: 'getSubjectCharacters',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          type: t.Optional(t.Integer({ description: '角色出场类型: 主角，配角，客串' })),
          limit: t.Optional(
            t.Integer({ default: 20, minimum: 1, maximum: 100, description: 'max 100' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.SubjectCharacter)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { type, limit = 20, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const condition = op.and(
        op.eq(schema.chiiCharacterSubjects.subjectID, subjectID),
        type ? op.eq(schema.chiiCharacterSubjects.type, type) : undefined,
        op.ne(schema.chiiCharacters.ban, 1),
        auth.allowNsfw ? undefined : op.eq(schema.chiiCharacters.nsfw, false),
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.count() })
        .from(schema.chiiCharacterSubjects)
        .innerJoin(
          schema.chiiCharacters,
          op.eq(schema.chiiCharacterSubjects.characterID, schema.chiiCharacters.id),
        )
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiCharacterSubjects)
        .innerJoin(
          schema.chiiCharacters,
          op.eq(schema.chiiCharacterSubjects.characterID, schema.chiiCharacters.id),
        )
        .where(condition)
        .orderBy(
          op.asc(schema.chiiCharacterSubjects.type),
          op.asc(schema.chiiCharacterSubjects.order),
        )
        .limit(limit)
        .offset(offset)
        .execute();
      const characterIDs = data.map((d) => d.chii_characters.id);
      const casts = await fetcher.fetchCastsBySubjectAndCharacterIDs(
        subjectID,
        characterIDs,
        auth.allowNsfw,
      );
      const characters = data.map((d) =>
        toSubjectCharacter(
          d.chii_characters,
          d.chii_crt_subject_index,
          casts[d.chii_characters.id] || [],
        ),
      );
      return {
        data: characters,
        total: count,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/staffs',
    {
      schema: {
        summary: '获取条目的制作人员',
        operationId: 'getSubjectStaffs',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          position: t.Optional(t.Integer({ description: '人物职位: 监督，原案，脚本,..' })),
          limit: t.Optional(
            t.Integer({ default: 20, minimum: 1, maximum: 100, description: 'max 100' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.SubjectStaff)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { position, limit = 20, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const condition = op.and(
        op.eq(schema.chiiPersonSubjects.subjectID, subjectID),
        position ? op.eq(schema.chiiPersonSubjects.position, position) : undefined,
        op.ne(schema.chiiPersons.ban, 1),
        auth.allowNsfw ? undefined : op.eq(schema.chiiPersons.nsfw, false),
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.countDistinct(schema.chiiPersonSubjects.personID) })
        .from(schema.chiiPersonSubjects)
        .innerJoin(
          schema.chiiPersons,
          op.eq(schema.chiiPersonSubjects.personID, schema.chiiPersons.id),
        )
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiPersonSubjects)
        .innerJoin(
          schema.chiiPersons,
          op.eq(schema.chiiPersonSubjects.personID, schema.chiiPersons.id),
        )
        .where(condition)
        .groupBy(schema.chiiPersonSubjects.personID)
        .orderBy(op.asc(schema.chiiPersonSubjects.position))
        .limit(limit)
        .offset(offset)
        .execute();
      const personIDs = data.map((d) => d.chii_person_cs_index.personID);
      const relations = await db
        .select()
        .from(schema.chiiPersonSubjects)
        .where(
          op.and(
            op.eq(schema.chiiPersonSubjects.subjectID, subjectID),
            op.inArray(schema.chiiPersonSubjects.personID, personIDs),
            position ? op.eq(schema.chiiPersonSubjects.position, position) : undefined,
          ),
        )
        .execute();
      const relationsMap = new Map<number, orm.IPersonSubject[]>();
      for (const r of relations) {
        const relations = relationsMap.get(r.personID) || [];
        relations.push(r);
        relationsMap.set(r.personID, relations);
      }
      const persons = data.map((d) =>
        toSubjectStaff(d.chii_persons, relationsMap.get(d.chii_persons.id) || []),
      );
      return {
        data: persons,
        total: count,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/recs',
    {
      schema: {
        summary: '获取条目的推荐',
        operationId: 'getSubjectRecs',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          limit: t.Optional(
            t.Integer({ default: 10, minimum: 1, maximum: 10, description: 'max 10' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.SubjectRec)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { limit = 10, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const condition = op.and(
        op.eq(schema.chiiSubjectRec.subjectID, subjectID),
        op.ne(schema.chiiSubjects.ban, 1),
        auth.allowNsfw ? undefined : op.eq(schema.chiiSubjects.nsfw, false),
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.count() })
        .from(schema.chiiSubjectRec)
        .innerJoin(
          schema.chiiSubjects,
          op.eq(schema.chiiSubjectRec.recSubjectID, schema.chiiSubjects.id),
        )
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiSubjectRec)
        .innerJoin(
          schema.chiiSubjects,
          op.eq(schema.chiiSubjectRec.recSubjectID, schema.chiiSubjects.id),
        )
        .innerJoin(
          schema.chiiSubjectFields,
          op.eq(schema.chiiSubjects.id, schema.chiiSubjectFields.id),
        )
        .where(condition)
        .orderBy(op.asc(schema.chiiSubjectRec.count))
        .limit(limit)
        .offset(offset)
        .execute();
      const recs = data.map((d) =>
        toSubjectRec(d.chii_subjects, d.chii_subject_fields, d.chii_subject_rec),
      );
      return {
        data: recs,
        total: count,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/comments',
    {
      schema: {
        summary: '获取条目的吐槽箱',
        operationId: 'getSubjectComments',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          type: t.Optional(req.Ref(req.CollectionType)),
          limit: t.Optional(
            t.Integer({ default: 20, minimum: 1, maximum: 100, description: 'max 100' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.SubjectComment)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { type, limit = 20, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const condition = op.and(
        op.eq(schema.chiiSubjectInterests.subjectID, subjectID),
        op.eq(schema.chiiSubjectInterests.private, 0),
        op.eq(schema.chiiSubjectInterests.hasComment, 1),
        type ? op.eq(schema.chiiSubjectInterests.type, type) : undefined,
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.count() })
        .from(schema.chiiSubjectInterests)
        .innerJoin(schema.chiiUsers, op.eq(schema.chiiSubjectInterests.uid, schema.chiiUsers.id))
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiSubjectInterests)
        .innerJoin(schema.chiiUsers, op.eq(schema.chiiSubjectInterests.uid, schema.chiiUsers.id))
        .where(condition)
        .orderBy(op.desc(schema.chiiSubjectInterests.updatedAt))
        .limit(limit)
        .offset(offset)
        .execute();
      const comments = data.map((d) =>
        convert.toSubjectComment(d.chii_subject_interests, d.chii_members),
      );
      return {
        data: comments,
        total: count,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/reviews',
    {
      schema: {
        summary: '获取条目的评论',
        operationId: 'getSubjectReviews',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          limit: t.Optional(
            t.Integer({ default: 5, minimum: 1, maximum: 20, description: 'max 20' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.SubjectReview)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { limit = 5, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const condition = op.and(
        op.eq(schema.chiiSubjectRelatedBlogs.subjectID, subjectID),
        op.eq(schema.chiiBlogEntries.public, true),
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.count() })
        .from(schema.chiiSubjectRelatedBlogs)
        .innerJoin(schema.chiiUsers, op.eq(schema.chiiSubjectRelatedBlogs.uid, schema.chiiUsers.id))
        .innerJoin(
          schema.chiiBlogEntries,
          op.eq(schema.chiiSubjectRelatedBlogs.entryID, schema.chiiBlogEntries.id),
        )
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiSubjectRelatedBlogs)
        .innerJoin(schema.chiiUsers, op.eq(schema.chiiSubjectRelatedBlogs.uid, schema.chiiUsers.id))
        .innerJoin(
          schema.chiiBlogEntries,
          op.eq(schema.chiiSubjectRelatedBlogs.entryID, schema.chiiBlogEntries.id),
        )
        .where(condition)
        .orderBy(op.desc(schema.chiiBlogEntries.createdAt))
        .limit(limit)
        .offset(offset)
        .execute();
      const reviews = data.map((d) =>
        convert.toSubjectReview(d.chii_subject_related_blog, d.chii_blog_entry, d.chii_members),
      );
      return {
        data: reviews,
        total: count,
      };
    },
  );

  app.get(
    '/subjects/:subjectID/topics',
    {
      schema: {
        summary: '获取条目讨论版',
        operationId: 'getSubjectTopics',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          subjectID: t.Integer(),
        }),
        querystring: t.Object({
          limit: t.Optional(
            t.Integer({ default: 20, minimum: 1, maximum: 100, description: 'max 100' }),
          ),
          offset: t.Optional(t.Integer({ default: 0, minimum: 0, description: 'min 0' })),
        }),
        response: {
          200: res.Paged(res.Ref(res.Topic)),
        },
      },
    },
    async ({ auth, params: { subjectID }, query: { limit = 20, offset = 0 } }) => {
      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }
      const display = ListTopicDisplays(auth);
      const condition = op.and(
        op.eq(schema.chiiSubjectTopics.subjectID, subjectID),
        op.inArray(schema.chiiSubjectTopics.display, display),
      );
      const [{ count = 0 } = {}] = await db
        .select({ count: op.count() })
        .from(schema.chiiSubjectTopics)
        .innerJoin(schema.chiiUsers, op.eq(schema.chiiSubjectTopics.uid, schema.chiiUsers.id))
        .where(condition)
        .execute();
      const data = await db
        .select()
        .from(schema.chiiSubjectTopics)
        .innerJoin(schema.chiiUsers, op.eq(schema.chiiSubjectTopics.uid, schema.chiiUsers.id))
        .where(condition)
        .orderBy(op.desc(schema.chiiSubjectTopics.createdAt))
        .limit(limit)
        .offset(offset)
        .execute();
      const topics = data.map((d) => convert.toSubjectTopic(d.chii_subject_topics, d.chii_members));
      return {
        data: topics,
        total: count,
      };
    },
  );

  app.post(
    '/subjects/:subjectID/topics',
    {
      schema: {
        summary: '创建条目讨论',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        operationId: 'createSubjectTopic',
        params: t.Object({
          subjectID: t.Integer({ examples: [114514], minimum: 0 }),
        }),
        response: {
          200: t.Object({
            id: t.Integer({ description: 'new topic id' }),
          }),
        },
        body: req.CreateTopic,
      },
      preHandler: [requireLogin('creating a topic')],
    },
    async ({
      auth,
      body: { text, title, 'cf-turnstile-response': cfCaptchaResponse },
      params: { subjectID },
    }) => {
      if (!(await turnstile.verify(cfCaptchaResponse ?? ''))) {
        throw new CaptchaError();
      }
      if (!Dam.allCharacterPrintable(text)) {
        throw new BadRequestError('text contains invalid invisible character');
      }
      if (auth.permission.ban_post) {
        throw new NotAllowedError('create topic');
      }

      const subject = await fetcher.fetchSlimSubjectByID(subjectID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${subjectID}`);
      }

      const state = CommentState.Normal;
      let display = TopicDisplay.Normal;
      if (dam.needReview(title) || dam.needReview(text)) {
        display = TopicDisplay.Review;
      }
      await rateLimit(LimitAction.Subject, auth.userID);

      const now = Math.round(Date.now() / 1000);

      const topic: typeof schema.chiiSubjectTopics.$inferInsert = {
        createdAt: now,
        updatedAt: now,
        subjectID: subjectID,
        uid: auth.userID,
        title,
        replies: 0,
        state,
        display,
      };
      const post: typeof schema.chiiSubjectPosts.$inferInsert = {
        content: text,
        uid: auth.userID,
        createdAt: now,
        state,
        mid: 0,
        related: 0,
      };
      await db.transaction(async (t) => {
        const [result] = await t.insert(schema.chiiSubjectTopics).values(topic).execute();
        post.mid = result.insertId;
        await t.insert(schema.chiiSubjectPosts).values(post).execute();
      });

      return { id: post.mid };
    },
  );

  app.get(
    '/subjects/-/topics/:topicID',
    {
      schema: {
        summary: '获取条目讨论',
        operationId: 'getSubjectTopic',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          topicID: t.Integer({ examples: [371602], minimum: 0 }),
        }),
        response: {
          200: res.Ref(res.TopicDetail),
        },
      },
    },
    async ({ auth, params: { topicID } }) => {
      const topic = await fetcher.fetchSubjectTopicByID(topicID);
      if (!topic) {
        throw new NotFoundError(`topic ${topicID}`);
      }
      const subject = await fetcher.fetchSlimSubjectByID(topic.parentID, auth.allowNsfw);
      if (!subject) {
        throw new NotFoundError(`subject ${topic.parentID}`);
      }
      if (!CanViewTopicContent(auth, topic.state, topic.display, topic.creator.id)) {
        throw new NotAllowedError('view topic');
      }

      const replies = await fetcher.fetchSubjectTopicRepliesByTopicID(topicID);
      const top = replies.shift();
      if (!top) {
        throw new NotFoundError(`topic ${topicID}`);
      }
      const friendIDs = await fetcher.fetchFriendIDsByUserID(auth.userID);
      const reactions = await fetchTopicReactions(auth.userID, auth.userID);

      for (const reply of replies) {
        if (!CanViewTopicReply(reply.state)) {
          reply.text = '';
        }
        if (reply.creator.id in friendIDs) {
          reply.isFriend = true;
        }
        reply.reactions = reactions[reply.creator.id] ?? [];
        for (const subReply of reply.replies) {
          if (!CanViewTopicReply(subReply.state)) {
            subReply.text = '';
          }
          if (subReply.creator.id in friendIDs) {
            subReply.isFriend = true;
          }
          subReply.reactions = reactions[subReply.creator.id] ?? [];
        }
      }
      return {
        ...topic,
        parent: subject,
        text: top.text,
        replies,
        reactions: reactions[top.id] ?? [],
      };
    },
  );

  app.put(
    '/subjects/-/topics/:topicID',
    {
      schema: {
        summary: '编辑自己创建的条目讨论',
        operationId: 'updateSubjectTopic',
        tags: [Tag.Subject],
        security: [{ [Security.CookiesSession]: [], [Security.HTTPBearer]: [] }],
        params: t.Object({
          topicID: t.Integer({ examples: [371602], minimum: 0 }),
        }),
        body: req.UpdateTopic,
      },
      preHandler: [requireLogin('updating a topic')],
    },
    async ({ auth, body: { text, title }, params: { topicID } }) => {
      if (auth.permission.ban_post) {
        throw new NotAllowedError('create reply');
      }
      if (!Dam.allCharacterPrintable(text)) {
        throw new BadRequestError('text contains invalid invisible character');
      }

      const topic = await fetcher.fetchSubjectTopicByID(topicID);
      if (!topic) {
        throw new NotFoundError(`topic ${topicID}`);
      }

      if (
        ![CommentState.AdminReopen, CommentState.AdminPin, CommentState.Normal].includes(
          topic.state,
        )
      ) {
        throw new NotAllowedError('edit this topic');
      }
      if (topic.creator.id !== auth.userID) {
        throw new NotAllowedError('update topic');
      }

      let display = topic.display;
      if (dam.needReview(title) || dam.needReview(text)) {
        if (display === TopicDisplay.Normal) {
          display = TopicDisplay.Review;
        } else {
          return {};
        }
      }

      await db.transaction(async (t) => {
        await t
          .update(schema.chiiSubjectTopics)
          .set({ title, display })
          .where(op.eq(schema.chiiSubjectTopics.id, topicID))
          .execute();
        await t
          .update(schema.chiiSubjectPosts)
          .set({ content: text })
          .where(op.eq(schema.chiiSubjectPosts.mid, topicID))
          .execute();
      });

      return {};
    },
  );
}
