import { SubjectType } from '@app/lib/subject/type.ts';

export interface Platform {
  id: number;
  type: string;
  type_cn: string;
  alias?: string;
  order?: number;
  wiki_tpl?: string;
  search_string?: string;
  enable_header?: boolean;
  sortKeys?: readonly string[];
}

// sorting date key will be searched from platformConfig, platformSortKeys, then default sort keys

export const DefaultSortKeys = Object.freeze(['放送开始', '发行日期', '开始']);

export const PlatformSortKeys = {
  [SubjectType.Book]: Object.freeze(['发售日']),
  [SubjectType.Anime]: DefaultSortKeys,
  [SubjectType.Music]: DefaultSortKeys,
  [SubjectType.Game]: DefaultSortKeys,
  [SubjectType.Real]: DefaultSortKeys,
};

export default {
  [SubjectType.Book]: {
    '0': {
      alias: 'misc',
      id: 0,
      type: 'other',
      type_cn: '其他',
      wiki_tpl: 'Book',
    },
    '1001': {
      alias: 'comic',
      enable_header: true,
      id: 1001,
      type: 'Comic',
      type_cn: '漫画',
      wiki_tpl: 'Manga',
    },
    '1002': {
      alias: 'novel',
      enable_header: true,
      id: 1002,
      type: 'Novel',
      type_cn: '小说',
      wiki_tpl: 'Novel',
    },
    '1003': {
      alias: 'illustration',
      enable_header: true,
      id: 1003,
      type: 'Illustration',
      type_cn: '画集',
      wiki_tpl: 'Book',
    },
  },
  [SubjectType.Anime]: {
    '0': {
      alias: 'misc',
      id: 0,
      type: 'other',
      type_cn: '其他',
      wiki_tpl: 'Anime',
    },
    '1': {
      alias: 'tv',
      enable_header: true,
      id: 1,
      type: 'TV',
      type_cn: 'TV',
      wiki_tpl: 'TVAnime',
      sortKeys: Object.freeze(['放送开始']),
    },
    '2': {
      alias: 'ova',
      enable_header: true,
      id: 2,
      type: 'OVA',
      type_cn: 'OVA',
      wiki_tpl: 'OVA',
      sortKeys: Object.freeze(['发售日期']),
    },
    '3': {
      alias: 'movie',
      enable_header: true,
      id: 3,
      type: 'movie',
      type_cn: '剧场版',
      wiki_tpl: 'Movie',
      sortKeys: Object.freeze(['上映日', '上映年度']),
    },
    '5': {
      alias: 'web',
      enable_header: true,
      id: 5,
      type: 'web',
      type_cn: 'WEB',
      wiki_tpl: 'TVAnime',
      sortKeys: Object.freeze(['放送开始']),
    },
  },
  [SubjectType.Music]: {},
  [SubjectType.Game]: {
    '0': {
      id: 0,
      type: '',
      type_cn: '全部游戏',
    },
    '4': {
      alias: 'pc',
      id: 4,
      search_string: 'pc|windows',
      type: 'PC',
      type_cn: 'PC',
    },
    '5': {
      alias: 'nds',
      id: 5,
      search_string: 'nds',
      type: 'NDS',
      type_cn: 'NDS',
    },
    '6': {
      alias: 'psp',
      id: 6,
      search_string: 'psp',
      type: 'PSP',
      type_cn: 'PSP',
    },
    '7': {
      alias: 'ps2',
      id: 7,
      search_string: 'PS2',
      type: 'PS2',
      type_cn: 'PS2',
    },
    '8': {
      alias: 'ps3',
      id: 8,
      search_string: 'PS3|(PlayStation 3)',
      type: 'PS3',
      type_cn: 'PS3',
    },
    '9': {
      alias: 'xbox360',
      id: 9,
      search_string: 'xbox360',
      type: 'Xbox360',
      type_cn: 'Xbox360',
    },
    '10': {
      alias: 'wii',
      id: 10,
      search_string: 'Wii',
      type: 'Wii',
      type_cn: 'Wii',
    },
    '11': {
      alias: 'iphone',
      id: 11,
      search_string: 'iphone|ipad|ios',
      type: 'iOS',
      type_cn: 'iOS',
    },
    '12': {
      alias: 'arc',
      id: 12,
      search_string: 'ARC|街机',
      type: 'ARC',
      type_cn: '街机',
    },
    '15': {
      alias: 'xbox',
      id: 15,
      search_string: 'XBOX',
      type: 'XBOX',
      type_cn: 'XBOX',
    },
    '16': {
      id: 16,
      type: 'GameCube',
      type_cn: 'GameCube',
    },
    '17': {
      alias: 'gamecube',
      id: 17,
      search_string: 'GameCube|ngc',
      type: 'GameCube',
      type_cn: 'GameCube',
    },
    '18': {
      alias: 'ngp',
      id: 18,
      search_string: 'ngp',
      type: 'NEOGEO Pocket Color',
      type_cn: 'NEOGEO Pocket Color',
    },
    '19': {
      alias: 'sfc',
      id: 19,
      search_string: 'SFC',
      type: 'SFC',
      type_cn: 'SFC',
    },
    '20': {
      alias: 'fc',
      id: 20,
      search_string: 'FC',
      type: 'FC',
      type_cn: 'FC',
    },
    '21': {
      alias: 'n64',
      id: 21,
      search_string: 'n64',
      type: 'Nintendo 64',
      type_cn: 'Nintendo 64',
    },
    '22': {
      alias: 'GBA',
      id: 22,
      search_string: 'GBA',
      type: 'GBA',
      type_cn: 'GBA',
    },
    '23': {
      alias: 'GB',
      id: 23,
      search_string: 'GB',
      type: 'GB',
      type_cn: 'GB',
    },
    '24': {
      id: 24,
      type: 'GBC',
      type_cn: 'GBC',
    },
    '25': {
      alias: 'vb',
      id: 25,
      search_string: 'Virtual Boy',
      type: 'Virtual Boy',
      type_cn: 'Virtual Boy',
    },
    '26': {
      alias: 'wsc',
      id: 26,
      search_string: 'wsc',
      type: 'WonderSwan Color',
      type_cn: 'WonderSwan Color',
    },
    '27': {
      alias: 'dreamcast',
      id: 27,
      search_string: 'dc',
      type: 'Dreamcast',
      type_cn: 'Dreamcast',
    },
    '28': {
      alias: 'ps',
      id: 28,
      search_string: 'ps',
      type: 'PlayStation',
      type_cn: 'PlayStation',
    },
    '29': {
      alias: 'ws',
      id: 29,
      search_string: 'ws',
      type: 'WonderSwan',
      type_cn: 'WonderSwan',
    },
    '30': {
      alias: 'psv',
      id: 30,
      search_string: 'psv|vita',
      type: 'PSVita',
      type_cn: 'PS Vita',
    },
    '31': {
      alias: '3ds',
      id: 31,
      search_string: '3ds',
      type: '3DS',
      type_cn: '3DS',
    },
    '32': {
      alias: 'android',
      id: 32,
      search_string: 'android',
      type: 'Android',
      type_cn: 'Android',
    },
    '33': {
      alias: 'mac',
      id: 33,
      search_string: 'mac',
      type: 'Mac OS',
      type_cn: 'Mac OS',
    },
    '34': {
      alias: 'ps4',
      id: 34,
      search_string: 'PS4',
      type: 'PS4',
      type_cn: 'PS4',
    },
    '35': {
      alias: 'xbox_one',
      id: 35,
      search_string: '(Xbox One)',
      type: 'Xbox One',
      type_cn: 'Xbox One',
    },
    '36': {
      alias: 'wii_u',
      id: 36,
      search_string: '(Wii U)|WiiU',
      type: 'Wii U',
      type_cn: 'Wii U',
    },
    '37': {
      alias: 'ns',
      id: 37,
      search_string: '(Nintendo Switch)|NS',
      type: 'Nintendo Switch',
      type_cn: 'Nintendo Switch',
    },
    '38': {
      alias: 'ps5',
      id: 38,
      search_string: 'PS5',
      type: 'PS5',
      type_cn: 'PS5',
    },
    '39': {
      alias: 'xbox_series_xs',
      id: 39,
      search_string: 'XSX|XSS|(Xbox Series X)|(Xbox Series S)',
      type: 'Xbox Series X/S',
      type_cn: 'Xbox Series X/S',
    },
  },
  [SubjectType.Real]: {
    '0': {
      alias: 'misc',
      id: 0,
      type: 'other',
      type_cn: '其他',
      wiki_tpl: 'TV',
    },
    '1': {
      alias: 'jp',
      enable_header: true,
      id: 1,
      type: 'jp',
      type_cn: '日剧',
      wiki_tpl: 'TV',
    },
    '2': {
      alias: 'en',
      enable_header: true,
      id: 2,
      type: 'en',
      type_cn: '欧美剧',
      wiki_tpl: 'TV',
    },
    '3': {
      alias: 'cn',
      enable_header: true,
      id: 3,
      type: 'cn',
      type_cn: '华语剧',
      wiki_tpl: 'TV',
    },
  },
} satisfies Record<SubjectType, Record<number, Platform>> as Record<
  SubjectType,
  Record<number, Platform>
>;
