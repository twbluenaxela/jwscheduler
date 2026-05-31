/* All seed data for the scheduler — will be replaced by API calls in Phase 2 */

export const midweekWeeks = [
  {
    id: 0,
    date: "6月 3日",
    weekdayPill: "星期三 · 19:30",
    reading: "耶利米書 1-3 章",
    chairman: "王文哲",
    openPrayer: "林家明",
    openSong: "84",
    openIntroTime: "7:36",
    treasuresGroup: "第一班",
    treasures: [
      { id: "t0", time: "7:36", partNum: 1, title: "「不要怕他們，因為我與你同在」", dur: "10 分鐘", cat: "treasures", assign: ["陳志強"] },
      { id: "t1", time: "7:46", partNum: 2, title: "屬靈寶石", dur: "10 分鐘", cat: "gems", assign: ["張宗翰"] },
      { id: "t2", time: "7:56", partNum: 3, title: "經文朗讀", dur: "4 分鐘", cat: "reading", roleLabel: "學生", assign: ["李建宏"] },
    ],
    ministryGroup: "第一班",
    ministry: [
      { id: "m0", time: "8:00", partNum: 4, title: "初次交談 — 向住戶作見證", dur: "3 分鐘", cat: "ministry", roleLabel: "學生/助手", assign: ["黃美玲", "周佩珊"] },
      { id: "m1", time: "8:04", partNum: 5, title: "再次交談 — 向住戶作見證", dur: "4 分鐘", cat: "ministry", roleLabel: "學生/助手", assign: ["林淑芬", "陳怡君"] },
      { id: "m2", time: "8:09", partNum: 6, title: "教導人成為門徒 — 聖經學生沒有進步", dur: "5 分鐘", cat: "ministry", roleLabel: "學生/助手", assign: ["張雅婷", "李心怡"] },
    ],
    midSong: "76",
    midSongTime: "8:15",
    living: [
      { id: "l0", time: "8:20", partNum: 7, title: "你可以像耶利米一樣勇敢", dur: "6 分鐘", cat: "living", assign: ["周家興"] },
      { id: "l1", time: "8:26", partNum: 8, title: "「態度溫和，深深尊重」", dur: "9 分鐘", cat: "living", assign: ["吳承恩"] },
      { id: "cbs", time: "8:35", partNum: 9, title: "會眾研經班", dur: "30 分鐘", cat: "cbs", roleLabel: "主持/朗讀", assign: ["劉政德", "蔡明杰"] },
    ],
    closingTime: "9:05",
    closingDur: "不超過 3 分鐘",
    closeSongTime: "9:08",
    closeSong: "18",
    closePrayer: "許文凱",
  },
  {
    id: 1,
    date: "6月 10日",
    weekdayPill: "星期三 · 19:30",
    reading: "耶利米書 4-6 章",
    chairman: "鄭裕昇",
    openPrayer: "黃俊賢",
    openSong: "56",
    openIntroTime: "7:36",
    treasuresGroup: "第一班",
    treasures: [
      { id: "t0", time: "7:36", partNum: 1, title: "猶大國民是前車之鑑", dur: "10 分鐘", cat: "treasures", assign: ["潘冠廷"] },
      { id: "t1", time: "7:46", partNum: 2, title: "屬靈寶石", dur: "10 分鐘", cat: "gems", assign: ["卓銘軒"] },
      { id: "t2", time: "7:56", partNum: 3, title: "經文朗讀", dur: "4 分鐘", cat: "reading", roleLabel: "學生", assign: [] },
    ],
    ministryGroup: "第一班",
    ministry: [
      { id: "m0", time: "8:00", partNum: 4, title: "初次交談 — 在公共場所傳道", dur: "2 分鐘", cat: "ministry", roleLabel: "學生/助手", assign: ["蔡麗華", "黃美玲"] },
      { id: "m1", time: "8:03", partNum: 5, title: "初次交談 — 向住戶作見證", dur: "2 分鐘", cat: "ministry", roleLabel: "學生/助手", assign: ["周佩珊", "林淑芬"] },
      { id: "m2", time: "8:06", partNum: 6, title: "再次交談 — 在日常生活中作見證", dur: "4 分鐘", cat: "ministry", roleLabel: "學生/助手", assign: ["陳怡君", "張雅婷"] },
      { id: "m3", time: "8:11", partNum: 7, title: "解釋自己的信仰 — 《常見問題》第 5 篇", dur: "3 分鐘", cat: "ministry", roleLabel: "學生/助手", assign: ["李心怡", "蔡麗華"] },
    ],
    midSong: "60",
    midSongTime: "8:15",
    living: [
      { id: "l0", time: "8:20", partNum: 8, title: "你看到的都是真的嗎？", dur: "8 分鐘", cat: "living", assign: ["劉政德"] },
      { id: "l1", time: "8:28", partNum: 9, title: "本地需要", dur: "10 分鐘", cat: "living", assign: ["王文哲"] },
      { id: "cbs", time: "8:35", partNum: 10, title: "會眾研經班", dur: "27 分鐘", cat: "cbs", roleLabel: "主持/朗讀", assign: ["包德安", "饒志明"] },
    ],
    closingTime: "9:05",
    closingDur: "不超過 3 分鐘",
    closeSongTime: "9:08",
    closeSong: "68",
    closePrayer: "賴俊宏",
  },
];

export const weekendData = [
  { date: "7/5",  type: "event", label: "國際大會", note: "本週聚會暫停" },
  { date: "7/12", no: "187", topic: "為什麼仁愛的上帝容忍患難存在？", cong: "新屋",     speaker: "陳柏睿", chair: "王文哲", wt: "林家明", read: "李建宏", host: "B" },
  { date: "7/19", no: "54",  topic: "建立真信心，信賴上帝和他的承諾", cong: "楊梅",     speaker: "徐念宗", chair: "鄭裕昇", wt: "黃俊賢", read: "周家興", host: "C" },
  { date: "7/26", no: "21",  topic: "珍視你在上帝王國裡享有的殊榮",   cong: "楊梅",     speaker: "王金雄", chair: "卓銘軒", wt: "王文哲", read: "吳承恩", host: "D" },
  { date: "8/2",  no: "8",   topic: "為上帝而活，不為自己而活",       cong: "大園",     speaker: "陳柏勛", chair: "鄭裕昇", wt: "林家明", read: "潘冠廷", host: "E" },
  { date: "8/9",  no: "42",  topic: "愛能戰勝仇恨嗎？",               cong: "桃園他加祿", speaker: "馬睿科", chair: "劉政德", wt: "王文哲", read: "饒志明", host: "A" },
  { date: "8/16", no: "74",  topic: "耶和華一直關注你",               cong: "新屋",     speaker: "唐榮裕", chair: "周家興", wt: "黃俊賢", read: "許文凱", host: "B" },
  { date: "8/23", no: "179", topic: "棄絕世俗的幻想，追求上帝真實的王國", cong: "新竹市北區", speaker: "王志明", chair: "林家明", wt: "王文哲", read: "包德安", host: "C", away: "鄭（八德 187）" },
  { date: "8/30", no: "110", topic: "家庭幸福以上帝為本",             cong: "新屋",     speaker: "唐榮裕", chair: "周家興", wt: "卓銘軒", read: "", host: "", away: "蔡（新化 42）" },
  { date: "9/6",  no: "80",  topic: "你寄望於科學還是聖經？",         cong: "湖口",     speaker: "曾士軒", chair: "張宗翰", wt: "黃俊賢", read: "", host: "" },
  { date: "9/13", no: "33",  topic: "真正的公平何時來臨？",           cong: "龜山",     speaker: "鍾偉介", chair: "蔡明杰", wt: "王文哲", read: "", host: "" },
  { date: "9/20", no: "78",  topic: "在充滿怒氣的世界裡促進和睦",     cong: "新屋",     speaker: "于樂洋", chair: "唐榮裕", wt: "", read: "", host: "" },
  { date: "9/27", type: "special", topic: "特別演講：聖經可以怎樣幫助你？", cong: "—", speaker: "卓誠幸", chair: "唐榮裕", wt: "", read: "周家興", host: "" },
  { date: "10/4",  no: "114", topic: "欣賞上帝所造的奇妙萬物",        cong: "湖口",     speaker: "陳延基", chair: "鄭裕昇", wt: "黃俊賢", read: "李建宏", host: "" },
  { date: "10/11", no: "31",  topic: "你想滿足心靈的需要嗎？",        cong: "龜山",     speaker: "曾永裕", chair: "包德安", wt: "黃俊賢", read: "周家興", host: "" },
  { date: "10/18", no: "175", topic: "什麼證明聖經真實可靠？",        cong: "平鎮西",   speaker: "吳嘉安", chair: "于樂洋", wt: "王文哲", read: "", host: "" },
];

export const overviewData = [
  { date: "6/3",  wd: "三", type: "mw", title: "耶利米書 1-3 章", keys: ["主席 王文哲", "研經班 劉政德"], status: "ok" },
  { date: "6/7",  wd: "日", type: "we", title: "為什麼仁愛的上帝容忍患難？", keys: ["講者 陳柏睿 · 新屋", "主席 王文哲"], status: "ok" },
  { date: "6/10", wd: "三", type: "mw", title: "耶利米書 4-6 章", keys: ["主席 鄭裕昇", "經文朗讀 未指派"], status: "gap", gaps: 1 },
  { date: "6/14", wd: "日", type: "we", title: "建立真信心，信賴上帝", keys: ["講者 徐念宗 · 楊梅", "守望台 黃俊賢"], status: "ok" },
  { date: "6/17", wd: "三", type: "mw", title: "耶利米書 7-9 章", keys: ["尚未排定"], status: "empty" },
  { date: "6/21", wd: "日", type: "we", title: "珍視你在王國裡的殊榮", keys: ["講者 未指派", "主席 未指派"], status: "gap", gaps: 3 },
  { date: "7/5",  wd: "日", type: "event", title: "國際大會 — 本週聚會暫停", keys: [], status: "suspended" },
];

export const peopleData = [
  { name: "王文哲", g: "M", appt: "長老",    quals: ["主席", "寶藏演講", "公眾演講", "守望台主持"], status: "active", recent: [{ date: "5/27", role: "主席", note: "週三聚會" }, { date: "5/18", role: "公眾演講", note: "週末聚會" }] },
  { name: "林家明", g: "M", appt: "長老",    quals: ["主席", "經文寶石", "生活演講", "研經班主持"], status: "active", recent: [{ date: "5/27", role: "開始禱告", note: "週三聚會" }, { date: "5/11", role: "研經班主持", note: "週末聚會" }] },
  { name: "鄭裕昇", g: "M", appt: "助理僕人", quals: ["主席", "寶藏演講", "公眾演講"], status: "active", recent: [{ date: "5/20", role: "主席", note: "週三聚會" }, { date: "5/4", role: "守望台主持", note: "週末聚會" }] },
  { name: "陳志強", g: "M", appt: "助理僕人", quals: ["寶藏演講", "生活演講", "朗讀"], status: "active", recent: [{ date: "5/27", role: "寶藏演講", note: "週三聚會" }, { date: "5/6", role: "生活演講", note: "週三聚會" }] },
  { name: "周家興", g: "M", appt: "傳道員",   quals: ["經文朗讀", "禱告", "朗讀"], status: "active", recent: [{ date: "5/27", role: "經文朗讀", note: "週三聚會" }, { date: "5/11", role: "朗讀", note: "週末聚會" }] },
  { name: "劉政德", g: "M", appt: "長老",    quals: ["研經班主持", "公眾演講", "生活演講"], status: "away", awayNote: "6/14 – 6/28 外出", recent: [{ date: "5/20", role: "研經班主持", note: "週末聚會" }, { date: "5/13", role: "生活演講", note: "週三聚會" }] },
  { name: "李建宏", g: "M", appt: "傳道員",   quals: ["經文朗讀", "初次交談"], status: "active", recent: [{ date: "5/27", role: "經文朗讀", note: "週三聚會" }, { date: "5/18", role: "朗讀", note: "週末聚會" }] },
  { name: "林淑芬", g: "F", appt: "—",       quals: ["初次交談", "再次交談", "教導示範"], status: "active", recent: [{ date: "5/27", role: "初次交談", note: "配合助手" }, { date: "5/11", role: "再次交談", note: "配合助手" }] },
  { name: "陳怡君", g: "F", appt: "—",       quals: ["初次交談", "再次交談"], status: "active", recent: [{ date: "5/20", role: "再次交談", note: "配合助手" }, { date: "5/6", role: "初次交談", note: "配合助手" }] },
  { name: "黃美玲", g: "F", appt: "—",       quals: ["初次交談", "再次交談", "教導示範"], status: "away", awayNote: "本週外出", recent: [{ date: "5/27", role: "初次交談", note: "配合助手" }, { date: "5/13", role: "再次交談", note: "配合助手" }] },
];

// ---- Assignment pool & categories (from sheet.js) ----
export const POOL = [
  { n: "王文哲", g: "M", a: "長老",    t: ["主席","寶藏","生活","公眾","守望台朗讀","禱告","研經班"] },
  { n: "林家明", g: "M", a: "長老",    t: ["主席","寶藏","生活","公眾","守望台朗讀","禱告","研經班"] },
  { n: "劉政德", g: "M", a: "長老",    t: ["主席","研經班","公眾","生活","守望台朗讀","禱告"] },
  { n: "包德安", g: "M", a: "長老",    t: ["主席","研經班","生活","公眾","守望台朗讀","禱告"] },
  { n: "鄭裕昇", g: "M", a: "助理僕人", t: ["主席","寶藏","公眾","守望台朗讀","禱告"] },
  { n: "卓銘軒", g: "M", a: "助理僕人", t: ["主席","寶藏","公眾","守望台朗讀","禱告"] },
  { n: "陳志強", g: "M", a: "助理僕人", t: ["寶藏","生活","守望台朗讀","禱告"] },
  { n: "張宗翰", g: "M", a: "助理僕人", t: ["寶藏","生活","主席","守望台朗讀","禱告"] },
  { n: "吳承恩", g: "M", a: "助理僕人", t: ["生活","寶藏","主席","禱告"] },
  { n: "周家興", g: "M", a: "傳道員",   t: ["經文朗讀","守望台朗讀","禱告","用心"] },
  { n: "李建宏", g: "M", a: "傳道員",   t: ["經文朗讀","守望台朗讀","用心"] },
  { n: "潘冠廷", g: "M", a: "傳道員",   t: ["經文朗讀","守望台朗讀","用心"] },
  { n: "饒志明", g: "M", a: "傳道員",   t: ["守望台朗讀","經文朗讀","用心"] },
  { n: "賴俊宏", g: "M", a: "傳道員",   t: ["禱告","經文朗讀","守望台朗讀","用心"] },
  { n: "許文凱", g: "M", a: "傳道員",   t: ["禱告","經文朗讀","用心"] },
  { n: "黃俊賢", g: "M", a: "傳道員",   t: ["禱告","守望台朗讀","經文朗讀","用心"] },
  { n: "林淑芬", g: "F", a: "",        t: ["用心"] },
  { n: "陳怡君", g: "F", a: "",        t: ["用心"] },
  { n: "張雅婷", g: "F", a: "",        t: ["用心"] },
  { n: "李心怡", g: "F", a: "",        t: ["用心"] },
  { n: "黃美玲", g: "F", a: "",        t: ["用心"] },
  { n: "周佩珊", g: "F", a: "",        t: ["用心"] },
  { n: "蔡麗華", g: "F", a: "",        t: ["用心"] },
];

export const CATS = {
  chairman:   { tag: "主席",       g: "M",   name: "主席" },
  prayer:     { tag: "禱告",       g: "M",   name: "禱告" },
  treasures:  { tag: "寶藏",       g: "M",   name: "寶藏演講" },
  gems:       { tag: "寶藏",       g: "M",   name: "屬靈寶石" },
  reading:    { tag: "經文朗讀",   g: "M",   name: "經文朗讀（學生）" },
  ministry:   { tag: "用心",       g: "any", name: "傳道訓練" },
  living:     { tag: "生活",       g: "M",   name: "生活演講" },
  cbs:        { tag: "研經班",     g: "M",   name: "會眾研經班主持" },
  cbsread:    { tag: "守望台朗讀", g: "M",   name: "研經班朗讀" },
  publictalk: { tag: "公眾",       g: "M",   name: "公眾演講 講者" },
  wt:         { tag: "主席",       g: "M",   name: "守望台主持" },
  wtread:     { tag: "守望台朗讀", g: "M",   name: "守望台朗讀" },
};

const SPREAD = 2;

function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function daysSince(name, tag) { return 5 + (hash(name + "·" + tag) % 68); }
function loadTerm(name, tag)  { return 1 + (hash(tag + "#" + name) % 6); }

export function candidates(catKey, jitter, spread = SPREAD) {
  const c = CATS[catKey];
  if (!c) return [];
  return POOL
    .filter(p => p.t.includes(c.tag) && (c.g === "any" || p.g === c.g))
    .map(p => {
      const d = daysSince(p.n, c.tag);
      let w = Math.pow(d, spread);
      const recent = d < 14;
      if (recent) w *= 0.1;
      if (jitter) w *= 0.55 + Math.random() * 0.9;
      return { ...p, d, w, recent, load: loadTerm(p.n, c.tag) };
    })
    .sort((a, b) => b.w - a.w);
}
