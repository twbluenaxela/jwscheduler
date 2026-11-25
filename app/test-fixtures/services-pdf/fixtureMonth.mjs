// Synthetic 服務 data for the services PDF/JPG e2e test.
//
// The same payload shape the real /api/services/month returns — dates, slot
// assignments, 打掃 groups and 帶頭傳道 meetings — so the print sheet is rendered
// from exactly what the live page would hand it.
//
// PUBLIC REPO: fake names only, no roster data.

export const FIXTURE_MONTH = '2026-11';

const PEOPLE = ['王小明', '陳大文', '林小華', '何美玲', '張志明', '李淑芬', '黃俊傑', '吳天恩'];

export const FIXTURE_CATEGORIES = [
  {
    id: 1, key: 'field', name: '帶頭傳道', kind: 'field', positions: [], notes: null, active: true, sortOrder: 0,
  },
  {
    id: 2, key: 'cleaning', name: '打掃', kind: 'groups', positions: ['小組'], notes: '每月一組，請於聚會後打掃。', active: true, sortOrder: 1,
  },
  {
    id: 3, key: 'microphone', name: '麥克風服務', kind: 'slots', positions: ['左邊', '右邊'], notes: '1. 聚會前請確認設備是否運作正常（電量及音量）', active: true, sortOrder: 2,
  },
  {
    id: 4, key: 'attendant', name: '招待', kind: 'slots', positions: ['大門', '主會場'], notes: null, active: true, sortOrder: 3,
  },
  {
    id: 5, key: 'platform', name: '講台服務', kind: 'slots', positions: ['講台'], notes: null, active: true, sortOrder: 4,
  },
];

// Meeting dates for the month: every Sunday plus the first three Thursdays —
// the midweek + weekend shape the app produces, without depending on real data.
export function fixtureDates(month = FIXTURE_MONTH) {
  const [year, part] = month.split('-').map(Number);
  const dates = [];
  const days = new Date(year, part, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    const weekday = new Date(year, part - 1, day).getDay();
    const iso = `${month}-${String(day).padStart(2, '0')}`;
    if (weekday === 0) dates.push({ iso, kind: 'weekend' });
    else if (weekday === 4 && day <= 21) dates.push({ iso, kind: 'midweek', weekdayPill: '星期四 · 19:30' });
  }
  return dates;
}

export function fixtureMonthData(month = FIXTURE_MONTH) {
  const dates = fixtureDates(month);
  const assignments = [];
  let id = 1;
  const slotCategories = FIXTURE_CATEGORIES.filter((category) => category.kind === 'slots');
  for (const date of dates) {
    for (const category of slotCategories) {
      for (const position of category.positions) {
        assignments.push({
          id: id++,
          categoryId: category.id,
          date: date.iso,
          position,
          personId: null,
          personName: PEOPLE[(id * 3) % PEOPLE.length],
          text: null,
          kind: 'slots',
        });
      }
    }
  }
  assignments.push({
    id: id++,
    categoryId: 5,
    date: `${month}-26`,
    position: '講台',
    personId: null,
    personName: null,
    text: '分區大會週',
    kind: 'slots',
  });
  return {
    month,
    dates,
    assignments,
    cleaning: [{
      id: id++,
      categoryId: 2,
      date: `${month}-01`,
      position: '小組',
      personId: null,
      personName: null,
      text: 'B,C',
      kind: 'groups',
    }],
    field: [
      {
        id: 1,
        date: `${month}-07`,
        time: '09:30',
        place: '中央王國聚會所',
        leaderId: null,
        leaderName: '王小明',
        territory: '中央里 1–5 號區',
        note: '',
        images: [],
      },
      {
        id: 2,
        date: `${month}-21`,
        time: '14:00',
        place: '公園入口',
        leaderId: null,
        leaderName: '陳大文',
        territory: '東區',
        note: '',
        images: [],
      },
    ],
  };
}
