// Synthetic 週末 rows for the weekend PDF e2e test.
//
// Plain .mjs so the Playwright test imports the SAME rows the fixture renders
// and computes the expected page count with `weekendPrintChunks` instead of
// hard-coding one that would silently rot.
//
// Dates carry no year in this app: WeekendView resolves "M/D" to the nearest
// future date and then filters by the selected year (default: this year). The
// fixture therefore lives inside one fixed service year and the test freezes the
// browser clock to January of that year — otherwise every row would be in the
// past by December and the "future" filter would empty the table.
//
// PUBLIC REPO: fake names only, no roster data.

export const FIXTURE_YEAR = 2026;
// First day of the fixture year; the e2e freezes the page clock here.
export const FIXTURE_NOW = `${FIXTURE_YEAR}-01-01T09:00:00`;

const TOPICS = [
  '耶和華的名配得讚美',
  '在患難中保持忠貞',
  '喜樂地事奉耶和華',
  '教導兒女愛耶和華',
  '信心經得起考驗',
  '保持屬靈的眼光',
  '仁慈的力量',
  '凡事感謝耶和華',
  '緊緊跟隨基督',
  '和平的珍寶',
  '在言語上顯出智慧',
  '彼此鼓勵的重要',
];

const CONGREGATIONS = ['中央', '東區', '南區', '西區', '北區', '海邊'];

const NAMES = [
  '王小明', '陳大文', '林小華', '何美玲', '張志明', '李淑芬', '黃俊傑', '吳天恩',
  '周美惠', '鄭建國', '許雅婷', '曾信德', '劉志遠', '蔡佳蓉', '楊明道', '潘淑貞',
];

const m = (index) => NAMES[index % NAMES.length];

// 40 weekly schedule rows + one 特別 + one 事項 + one 暫停 = 42 rows → two print
// pages (26 + 16), a little under a real service year. The rows step a week apart
// so every date stays inside the fixture year (a "M/D" past 12/31 would resolve
// to another year and the year gate would silently drop it). The event rows sit
// early so the first page also exercises the full-width colSpan rows.
export function weekendFixtureRows() {
  const rows = [];
  for (let i = 0; i < 40; i += 1) {
    const date = new Date(FIXTURE_YEAR, 0, 5 + i * 7);
    rows.push({
      _id: `fx-${i}`,
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      no: String(101 + i),
      topic: TOPICS[i % TOPICS.length],
      cong: CONGREGATIONS[i % CONGREGATIONS.length],
      speaker: m(i),
      chair: m(i + 3),
      wt: m(i + 5),
      read: m(i + 7),
      host: i % 3 === 0 ? String((i % 6) + 1) : '',
      away: i % 5 === 0 ? `${CONGREGATIONS[(i + 2) % CONGREGATIONS.length]} 會眾` : '',
      type: i === 4 ? 'special' : 'schedule',
      label: '',
      note: '',
    });
  }
  const blank = {
    topic: '', cong: '', speaker: '', chair: '', wt: '', read: '', host: '', away: '',
  };
  rows.splice(2, 0, {
    ...blank,
    _id: 'fx-event',
    date: '2/9',
    type: 'event',
    label: '分區大會',
    note: '地點：桃園巨蛋',
  });
  rows.splice(6, 0, {
    ...blank,
    _id: 'fx-suspended',
    date: '3/23',
    type: 'suspended',
    label: '聚會暫停',
    note: '本週沒有聚會',
  });
  return rows;
}

// Deterministic stand-in for the app's getAssign(slotId, defaultName): it keeps
// the fixture's own names, and swaps one slot so the test proves the capture is
// the rendered stage and not the raw row data.
export function fixtureWeekendGetAssign(slotId, fallback) {
  if (slotId === 'wefx-0_chair') return '林小華';
  return fallback ?? '';
}
