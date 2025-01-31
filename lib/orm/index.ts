import * as php from '@trim21/php-serialize';
import * as lo from 'lodash-es';
import { DataSource, In } from 'typeorm';

import { db, op } from '@app/drizzle/db.ts';
import * as schema from '@app/drizzle/schema.ts';
import config, { production, stage } from '@app/lib/config.ts';
import { UnexpectedNotFoundError } from '@app/lib/error.ts';
import { logger } from '@app/lib/logger.ts';

import {
  App,
  Cast,
  Character,
  CharacterSubjects,
  Episode,
  EpisodeComment,
  EpRevision,
  Group,
  GroupMembers,
  GroupPost,
  GroupTopic,
  Notify,
  NotifyField,
  Person,
  PersonSubjects,
  RevHistory,
  RevText,
  Subject,
  SubjectFields,
  SubjectImage,
  SubjectInterest,
  SubjectPost,
  SubjectRelation,
  SubjectRev,
  SubjectTopic,
  User,
  UserField,
} from './entity/index.ts';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: config.mysql.host,
  port: config.mysql.port,
  username: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.db,
  synchronize: false,
  maxQueryExecutionTime: 2000,
  logger: {
    log(level: 'log' | 'info' | 'warn', message: unknown) {
      if (level === 'info') {
        logger.info(message);
      } else if (level === 'warn') {
        logger.warn(message);
      } else {
        logger.info({ log_level: level }, message?.toString());
      }
    },

    logQuerySlow(time: number, query: string, parameters?: unknown[]) {
      logger.warn({ time, query, parameters }, 'slow sql');
    },
    logQueryError(error: string | Error, query: string, parameters?: unknown[]) {
      logger.error({ error, query, parameters }, 'query error');
    },

    logQuery:
      production || stage
        ? // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {}
        : (query, params) => {
            logger.trace({ query, params });
          },

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    logSchemaBuild() {},

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    logMigration() {},
  },
  entities: [
    App,
    Cast,
    Character,
    CharacterSubjects,
    EpRevision,
    User,
    UserField,
    Notify,
    NotifyField,
    SubjectImage,
    Group,
    GroupMembers,
    Episode,
    EpisodeComment,
    Person,
    PersonSubjects,
    RevHistory,
    RevText,
    Subject,
    SubjectTopic,
    SubjectPost,
    SubjectFields,
    SubjectRelation,
    GroupTopic,
    GroupPost,
    SubjectRev,
    SubjectInterest,
  ],
});

export const UserRepo = AppDataSource.getRepository(User);
export const UserFieldRepo = AppDataSource.getRepository(UserField);

export const CharacterRepo = AppDataSource.getRepository(Character);
export const CharacterSubjectsRepo = AppDataSource.getRepository(CharacterSubjects);
export const CastRepo = AppDataSource.getRepository(Cast);

export const PersonRepo = AppDataSource.getRepository(Person);
export const PersonSubjectsRepo = AppDataSource.getRepository(PersonSubjects);

export const SubjectRepo = AppDataSource.getRepository(Subject);
export const SubjectTopicRepo = AppDataSource.getRepository(SubjectTopic);
export const SubjectPostRepo = AppDataSource.getRepository(SubjectPost);
export const SubjectFieldsRepo = AppDataSource.getRepository(SubjectFields);
export const SubjectImageRepo = AppDataSource.getRepository(SubjectImage);
export const SubjectRelationRepo = AppDataSource.getRepository(SubjectRelation);
export const EpisodeRepo = AppDataSource.getRepository(Episode);
export const EpisodeCommentRepo = AppDataSource.getRepository(EpisodeComment);
export const EpRevRepo = AppDataSource.getRepository(EpRevision);

export const RevHistoryRepo = AppDataSource.getRepository(RevHistory);
export const RevTextRepo = AppDataSource.getRepository(RevText);

export const SubjectRevRepo = AppDataSource.getRepository(SubjectRev);
export const SubjectInterestRepo = AppDataSource.getRepository(SubjectInterest);

export const NotifyRepo = AppDataSource.getRepository(Notify);
export const NotifyFieldRepo = AppDataSource.getRepository(NotifyField);

export const GroupRepo = AppDataSource.getRepository(Group);
export const GroupTopicRepo = AppDataSource.getRepository(GroupTopic);
export const GroupPostRepo = AppDataSource.getRepository(GroupPost);
export const GroupMemberRepo = AppDataSource.getRepository(GroupMembers);

export const repo = {
  UserField: UserFieldRepo,
  Subject: SubjectRepo,
  SubjectFields: SubjectFieldsRepo,
  SubjectRelation: SubjectRelationRepo,
  Episode: EpisodeRepo,
  Character: CharacterRepo,
  CharacterSubjects: CharacterSubjectsRepo,
  Cast: CastRepo,
  Person: PersonRepo,
  PersonSubjects: PersonSubjectsRepo,
  Notify: NotifyRepo,
  NotifyField: NotifyFieldRepo,
  Group: GroupRepo,
  GroupMember: GroupMemberRepo,
} as const;

export interface Page {
  limit?: number;
  offset?: number;
}

export interface IUser {
  id: number;
  username: string;
  nickname: string;
  groupID: number;
  img: string;
  regTime: number;
  sign: string;
}

export async function fetchUser(userID: number): Promise<IUser | null> {
  if (!userID) {
    throw new Error(`undefined user id ${userID}`);
  }
  const user = await UserRepo.findOne({
    where: { id: userID },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    nickname: user.nickname,
    username: user.username,
    img: user.avatar,
    groupID: user.groupid,
    regTime: user.regdate,
    sign: user.sign,
  };
}

export interface Permission {
  app_erase?: boolean;
  ban_post?: boolean;
  ban_visit?: boolean;
  doujin_subject_erase?: boolean;
  doujin_subject_lock?: boolean;
  ep_edit?: boolean;
  ep_erase?: boolean;
  ep_lock?: boolean;
  ep_merge?: boolean;
  ep_move?: boolean;
  manage_app?: boolean;
  manage_report?: boolean;
  manage_topic_state?: boolean;
  manage_user?: boolean;
  manage_user_group?: boolean;
  manage_user_photo?: boolean;
  mono_edit?: boolean;
  mono_erase?: boolean;
  mono_lock?: boolean;
  mono_merge?: boolean;
  report?: boolean;
  subject_cover_erase?: boolean;
  subject_cover_lock?: boolean;
  subject_edit?: boolean;
  subject_erase?: boolean;
  subject_lock?: boolean;
  subject_merge?: boolean;
  subject_refresh?: boolean;
  subject_related?: boolean;
  user_ban?: boolean;
  user_group?: boolean;
  user_list?: boolean;
  user_wiki_apply?: boolean;
  user_wiki_approve?: boolean;
}

const defaultPermission: Permission = {
  ban_post: true,
  ban_visit: true,
};

export async function fetchPermission(userGroup: number): Promise<Readonly<Permission>> {
  const permission = await db.query.chiiUsergroup.findFirst({
    where: op.eq(schema.chiiUsergroup.id, userGroup),
  });
  if (!permission) {
    logger.warn("can't find permission for userGroup %d", userGroup);
    return Object.freeze({ ...defaultPermission });
  }

  if (!permission.perm) {
    return Object.freeze({ ...defaultPermission });
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(php.parse(permission.perm) as Record<keyof Permission, string>).map(
        ([key, value]) => [key, value === '1'],
      ),
    ),
  );
}

export async function addCreator<T extends { creatorID: number }>(
  arr: T[],
  { ghostUser = false }: { ghostUser?: boolean } = {},
): Promise<(T & { creator: IUser })[]> {
  const users = await fetchUsers(arr.map((x) => x.creatorID));

  return arr.map((o) => {
    const user = users[o.creatorID];
    if (!user) {
      if (ghostUser) {
        return { ...o, creator: ghost(o.creatorID) };
      }

      throw new UnexpectedNotFoundError(`user ${o.creatorID}`);
    }

    return { ...o, creator: user };
  });
}

function ghost(id: number): IUser {
  return {
    id: 0,
    img: '',
    username: id.toString(),
    nickname: `deleted or missing user ${id}`,
    groupID: 0,
    regTime: 0,
    sign: '',
  };
}

export async function fetchUsers(userIDs: number[]): Promise<Record<number, IUser>> {
  if (userIDs.length === 0) {
    return {};
  }

  const users = await UserRepo.find({
    where: { id: In(lo.uniq(userIDs)) },
  });

  return Object.fromEntries(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        nickname: user.nickname,
        username: user.username,
        img: user.avatar,
        groupID: user.groupid,
        regTime: user.regdate,
        sign: user.sign,
        user_group: user.groupid,
      },
    ]),
  );
}

export interface ISubject {
  id: number;
  name: string;
  typeID: number;
  infobox: string;
  platform: number;
  metaTags: string;
  summary: string;
  nsfw: boolean;
  date: string;
  redirect: number;
  locked: boolean;
  image: string;
}

export async function fetchSubjectByID(id: number): Promise<ISubject | null> {
  const subject = await SubjectRepo.findOne({
    where: { id },
  });

  if (!subject) {
    return null;
  }

  const f = await SubjectFieldsRepo.findOne({
    where: { subjectID: id },
  });

  if (!f) {
    throw new UnexpectedNotFoundError(`subject fields ${id}`);
  }
  return {
    id: subject.id,
    name: subject.name,
    typeID: subject.typeID,
    infobox: subject.fieldInfobox,
    platform: subject.platform,
    metaTags: subject.metaTags,
    summary: subject.fieldSummary,
    nsfw: subject.subjectNsfw,
    date: f.date,
    redirect: f.fieldRedirect,
    locked: subject.locked(),
    image: subject.subjectImage,
  } satisfies ISubject;
}

export async function fetchUserX(id: number): Promise<IUser> {
  const u = await fetchUser(id);
  if (!u) {
    throw new UnexpectedNotFoundError(`user ${id}`);
  }

  return u;
}

export { MoreThan as Gt, MoreThanOrEqual as Gte, In, Like } from 'typeorm';
