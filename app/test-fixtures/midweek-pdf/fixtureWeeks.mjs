// Synthetic 週中 data for the PDF capture e2e test.
//
// Plain .mjs (not the client component) so the Playwright test can import the
// SAME weeks it renders and compute the expected page count with paginate()
// instead of hard-coding a number that would silently rot.
//
// PUBLIC REPO: fake names only, no roster data.

function part(id, dbId, section, partNum, title, dur, time, cat, roleLabel, assign = [], extra = {}) {
  return {
    id, dbId, partNum, title, dur, time, cat,
    roleLabel: roleLabel ?? undefined,
    assign,
    hideHelper: false,
    scenario: '',
    ...extra,
  };
}

export const FIXTURE_WEEKS = [
  {
    id: 9101,
    date: '9/9',
    dateLabel: '9 月 9 日',
    weekdayPill: '週三 19:30',
    reading: '以賽亞書 45:1–10',
    chairman: '王小明',
    openPrayer: '陳大文',
    openSong: 12,
    openIntroTime: '7:30',
    treasures: [
      part('t1', 91011, 'treasures', 1, '愛耶和華的人必恨惡惡事', '10 分鐘', '7:35', 'treasures', null, ['王小明']),
      part('t2', 91012, 'treasures', 2, '經文寶石', '10 分鐘', '7:45', 'gems'),
      part('t3', 91013, 'treasures', 3, '聖經朗讀', '4 分鐘', '7:55', 'reading', '學生', ['何美玲']),
    ],
    ministry: [
      part('m1', 91014, 'ministry', 4, '初次交談：介紹聖經課程', '3 分鐘', '8:00', 'ministry', '學生/助手', ['陳大文', '林小華']),
      part('m2', 91015, 'ministry', 5, '續訪：回答常見問題', '4 分鐘', '8:03', 'ministry', '學生/助手'),
      part('m3', 91016, 'ministry', 6, '教導人成為門徒：為什麼要研讀聖經', '5 分鐘', '8:07', 'ministry', '學生'),
    ],
    living: [
      part('l1', 91017, 'living', 7, '本地需要：在忙碌生活中保持屬靈常規（訪問：恩慈與信實夫妻）', '15 分鐘', '8:18', 'living', null, ['張志明']),
      part('l2', 91018, 'living', 8, '會眾研經班', '30 分鐘', '8:33', 'cbs', '主持/朗讀', ['李淑芬', '黃俊傑']),
    ],
    midSong: 42,
    midSongTime: '8:12',
    closingTime: '9:03',
    closingDur: '3 分鐘',
    closeSongTime: '9:06',
    closeSong: 88,
    closePrayer: '吳天恩',
    type: 'normal',
    label: '',
  },
  {
    id: 9102,
    date: '9/16',
    dateLabel: '9 月 16 日',
    weekdayPill: '週三 19:30',
    reading: '以賽亞書 46:1–13',
    chairman: '陳大文',
    openPrayer: '王小明',
    openSong: 33,
    openIntroTime: '7:30',
    treasures: [
      part('t1', 91021, 'treasures', 1, '要緊緊跟隨耶和華', '10 分鐘', '7:35', 'treasures', null, ['林小華']),
      part('t2', 91022, 'treasures', 2, '經文寶石', '10 分鐘', '7:45', 'gems', null, ['何美玲']),
      part('t3', 91023, 'treasures', 3, '聖經朗讀', '4 分鐘', '7:55', 'reading', '學生', ['張志明']),
    ],
    ministry: [
      part('m1', 91024, 'ministry', 4, '初次交談：善用書刊', '3 分鐘', '8:00', 'ministry', '學生/助手', ['李淑芬', '吳天恩']),
      part('m2', 91025, 'ministry', 5, '續訪：安排下次討論', '4 分鐘', '8:03', 'ministry', '學生/助手', ['黃俊傑']),
    ],
    living: [
      part('l1', 91026, 'living', 6, '本地需要', '15 分鐘', '8:07', 'living', null, ['王小明']),
      part('l2', 91027, 'living', 7, '會眾研經班', '30 分鐘', '8:22', 'cbs', '主持/朗讀', ['陳大文', '何美玲']),
    ],
    midSong: 57,
    midSongTime: '8:03',
    closingTime: '8:52',
    closingDur: '3 分鐘',
    closeSongTime: '8:55',
    closeSong: 101,
    closePrayer: '林小華',
    type: 'special',
    label: '分區監督探訪',
  },
  {
    id: 9103,
    date: '9/23',
    dateLabel: '9 月 23 日',
    type: 'suspended',
    label: '國際大會',
  },
  {
    id: 9104,
    date: '9/30',
    dateLabel: '9 月 30 日',
    weekdayPill: '週三 19:30',
    reading: '以賽亞書 47:1–15',
    chairman: '何美玲',
    openPrayer: '黃俊傑',
    openSong: 45,
    openIntroTime: '7:30',
    treasures: [
      part('t1', 91041, 'treasures', 1, '耶和華的旨意必成就', '10 分鐘', '7:35', 'treasures', null, ['吳天恩']),
      part('t2', 91042, 'treasures', 2, '經文寶石', '10 分鐘', '7:45', 'gems', null, ['王小明']),
      part('t3', 91043, 'treasures', 3, '聖經朗讀', '4 分鐘', '7:55', 'reading', '學生'),
    ],
    ministry: [
      part('m1', 91044, 'ministry', 4, '初次交談：建立良好基礎', '3 分鐘', '8:00', 'ministry', '學生/助手', ['張志明', '李淑芬']),
      part('m2', 91045, 'ministry', 5, '續訪：培養興趣', '4 分鐘', '8:03', 'ministry', '學生/助手', ['陳大文']),
    ],
    living: [
      part('l1', 91046, 'living', 6, '本地需要', '15 分鐘', '8:07', 'living', null, ['林小華']),
      part('l2', 91047, 'living', 7, '會眾研經班', '30 分鐘', '8:22', 'cbs', '主持/朗讀', ['黃俊傑', '吳天恩']),
    ],
    midSong: 62,
    midSongTime: '8:03',
    closingTime: '8:52',
    closingDur: '3 分鐘',
    closeSongTime: '8:55',
    closeSong: 119,
    closePrayer: '何美玲',
    type: 'normal',
    label: '',
  },
];

// A fixed override map: only two slots differ from the snapshot in the weeks, so
// both the "assigned" and the getAssign-override paths are exercised.
export const FIXTURE_ASSIGNMENTS = {
  mw9101_t1_0: '王小明',
  mw9101_l1_0: '張志明',
};

export function fixtureGetAssign(slotId, defaultName) {
  return slotId in FIXTURE_ASSIGNMENTS ? FIXTURE_ASSIGNMENTS[slotId] : (defaultName ?? '');
}
