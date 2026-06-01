/**
 * One-time script to import the 2026 weekend schedule.
 * Run with: node --env-file=.env scripts/import-weekend.mjs
 *
 * Clears existing WeekendRows for the congregation first, then inserts fresh.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROWS = [
  { date: '5/31', no: '71',  topic: '現在就要保持警醒！',                   cong: '龍潭',       speaker: '北村洋樹', chair: '唐榮裕', wt: '王以梵', read: '周家寶',  host: 'B', away: '鄭(龍潭50) 王(幸福)' },
  { date: '6/7',  no: '100', topic: '怎樣建立牢固持久的友誼',               cong: '新竹他加祿語', speaker: '林培賢',  chair: '周家寶', wt: '王以梵', read: '張任超',  host: 'C', away: '廖(大園115)' },
  { date: '6/14', no: '27',  topic: '怎樣建立美滿幸福的婚姻',               cong: '新屋',       speaker: '蔡元勳',  chair: '包恩德', wt: '王以梵', read: '饒富田',  host: 'D', away: '' },
  { date: '6/21', no: '',    topic: '你可以怎樣獲得永遠的生命？',           cong: '分區監督',    speaker: '柯智維',  chair: '廖永田', wt: '王以梵', read: '羅紫軒',  host: 'E', away: '' },
  { date: '6/28', no: '117', topic: '怎樣以善勝惡',                         cong: '平鎮東',     speaker: '黃蔚博',  chair: '張任超', wt: '王以梵', read: '蘇大政',  host: 'A', away: '鄭(大園50)' },
  { date: '7/5',  type: 'event', topic: '國際大會', label: '本週聚會暫停' },
  { date: '7/12', no: '187', topic: '為什麼仁愛的上帝容忍惡事存在？',       cong: '新屋',       speaker: '卓誠幸',  chair: '饒富田', wt: '王以梵', read: '廖子君',  host: 'B', away: '' },
  { date: '7/19', no: '54',  topic: '建立真信心，信賴上帝和他的承諾',       cong: '楊梅',       speaker: '徐念宗',  chair: '唐榮裕', wt: '王以梵', read: '陳秉宏',  host: 'C', away: '' },
  { date: '7/26', no: '21',  topic: '珍視你在上帝王國裡享有的殊榮',         cong: '楊梅',       speaker: '王金雄',  chair: '卓誠幸', wt: '王以梵', read: '周業邦',  host: 'D', away: '' },
  { date: '8/2',  no: '8',   topic: '為上帝而活，不為自己而活',             cong: '大園',       speaker: '陳柏劭',  chair: '唐榮裕', wt: '王以梵', read: '潘宇喬',  host: 'E', away: '' },
  { date: '8/9',  no: '42',  topic: '愛能戰勝仇恨嗎？',                     cong: '桃園他加祿',  speaker: '馬睿科',  chair: '廖永田', wt: '王以梵', read: '于樂洋',  host: 'A', away: '' },
  { date: '8/16', no: '74',  topic: '耶和華一直關注你',                     cong: '新屋',       speaker: '張任超',  chair: '張任超', wt: '王以梵', read: '張任超',  host: 'B', away: '' },
  { date: '8/23', no: '179', topic: '棄絕世俗的幻想，追求上帝真實的王國',   cong: '新竹市北區',  speaker: '王志明',  chair: '林俊吉', wt: '王以梵', read: '潘金智',  host: 'C', away: '鄭 (八德187)' },
  { date: '8/30', no: '110', topic: '家庭幸福以上帝為本',                   cong: '新屋',       speaker: '唐榮裕',  chair: '周業邦', wt: '王以梵', read: '饒富田',  host: 'D', away: '蔡 (新化42)' },
  { date: '9/6',  no: '80',  topic: '你寄望於科學還是聖經？',               cong: '湖口',       speaker: '曾士軒',  chair: '張嘉成', wt: '王以梵', read: '羅紫軒',  host: 'E', away: '' },
  { date: '9/13', no: '33',  topic: '真正的公平何時來臨？',                 cong: '龜山',       speaker: '鍾陽介',  chair: '蔡元勳', wt: '王以梵', read: '蘇大政',  host: 'A', away: '' },
  { date: '9/20', no: '65',  topic: '在充滿怒氣的世界裡促進和睦',           cong: '新屋',       speaker: '于樂洋',  chair: '饒富田', wt: '王以梵', read: '廖永田',  host: 'B', away: '' },
  { date: '9/27', type: 'special', topic: '特別演講：聖經可以怎樣幫助你？', cong: '',           speaker: '卓誠幸',  chair: '唐榮裕', wt: '',       read: '陳秉宏',  host: 'C', away: '' },
  { date: '10/4', no: '114', topic: '欣賞上帝所造的奇妙萬物',               cong: '湖口',       speaker: '陳延基',  chair: '鄭裕人', wt: '王以梵', read: '廖子君',  host: 'D', away: '' },
  { date: '10/11',no: '31',  topic: '你想滿足心靈的需要嗎？',               cong: '龜山',       speaker: '曾永裕',  chair: '包恩德', wt: '王以梵', read: '陳秉宏',  host: 'E', away: '' },
  { date: '10/18',no: '78',  topic: '快快樂樂地敬奉耶和華',                 cong: '新屋',       speaker: '王以梵',  chair: '潘宇喬', wt: '王以梵', read: '周業邦',  host: 'A', away: '' },
  { date: '10/25',no: '175', topic: '什麼證明聖經真實可靠？',               cong: '平鎮西',     speaker: '吳嘉安',  chair: '于樂洋', wt: '王以梵', read: '潘宇喬',  host: 'B', away: '' },
  { date: '11/1', no: '123', topic: '基督徒為何要與眾不同？',               cong: '八德',       speaker: '楊雅仁',  chair: '張任超', wt: '王以梵', read: '于樂洋',  host: 'C', away: '' },
  { date: '11/8', no: '26',  topic: '上帝重視你嗎？',                       cong: '湖口',       speaker: '李明哲',  chair: '潘金智', wt: '王以梵', read: '張任超',  host: 'D', away: '' },
  { date: '11/15',no: '67',  topic: '你願意參與收割的工作嗎？',             cong: '桃北',       speaker: '林君豪',  chair: '饒富田', wt: '王以梵', read: '潘金智',  host: 'E', away: '' },
];

async function main() {
  const congregation = await prisma.congregation.findFirst();
  if (!congregation) { console.error('找不到會眾。'); process.exit(1); }
  console.log(`會眾：${congregation.name} (id=${congregation.id})\n`);

  // Clear existing rows for this congregation
  const deleted = await prisma.weekendRow.deleteMany({ where: { congregationId: congregation.id } });
  console.log(`已清除 ${deleted.count} 筆舊週末資料`);

  // Insert fresh rows
  for (let i = 0; i < ROWS.length; i++) {
    const r = ROWS[i];
    await prisma.weekendRow.create({
      data: {
        congregationId: congregation.id,
        sortOrder: i,
        date:    r.date,
        type:    r.type ?? 'schedule',
        no:      r.no ?? '',
        topic:   r.topic ?? '',
        cong:    r.cong ?? '',
        speaker: r.speaker ?? '',
        chair:   r.chair ?? '',
        wt:      r.wt ?? '',
        read:    r.read ?? '',
        host:    r.host ?? '',
        away:    r.away ?? '',
        label:   r.label ?? '',
        note:    r.note ?? '',
      },
    });
    console.log(`  ✓ ${r.date} — ${r.topic || '（活動）'}`);
  }

  console.log(`\n完成。已匯入 ${ROWS.length} 筆週末資料。`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
