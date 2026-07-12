import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partTypeOf, effectiveCat, slotCat } from './partTypes.mjs';
import { ministryRoleLabel } from './epubParser.js';

// Real description lines from sample/mwb_CH_202609.epub (September–October 2026).

test('ministryRoleLabel: 示範-prefixed description → 學生/助手 even for 解釋自己的信仰', () => {
  assert.equal(
    ministryRoleLabel('解釋自己的信仰 — 示範', '（3分鐘）示範。《聖經問答》第103篇——主題：耶和華是誰？（《教導》第17課）'),
    '學生/助手'
  );
});

test('ministryRoleLabel: 演講 title → 學生 (no assistant)', () => {
  assert.equal(
    ministryRoleLabel('演講', '（4分鐘）《愛心》附錄A第20點——主題：耶穌不是上帝。（《教導》第7課）'),
    '學生'
  );
});

test('ministryRoleLabel: 演講-prefixed description → 學生', () => {
  assert.equal(
    ministryRoleLabel('解釋自己的信仰 — 演講', '（5分鐘）演講。《聖經問答》第60篇（《教導》第14課）'),
    '學生'
  );
});

test('ministryRoleLabel: 你會怎麼說 discussion part → single slot, no role label', () => {
  assert.equal(
    ministryRoleLabel('你會怎麼說？', '（6分鐘）節目包括討論。向住戶作見證。簡述《愛心》第2課第5點，問問大家：'),
    undefined
  );
});

test('ministryRoleLabel: plain demos → 學生/助手', () => {
  assert.equal(
    ministryRoleLabel('初次交談 — 向住戶作見證', '（3分鐘）向住戶作見證。鼓勵對方學聖經。（《愛心》第4課第3點）'),
    '學生/助手'
  );
  assert.equal(
    ministryRoleLabel('教導人成為門徒', '（5分鐘）鼓勵學生多禱告。（《教導》第8課）'),
    '學生/助手'
  );
});

test('effectiveCat: single 演講 ministry part → ministrytalk; with helper → ministry', () => {
  assert.equal(effectiveCat({ cat: 'ministry', title: '演講 — 《愛心》附錄', roleLabel: '學生' }), 'ministrytalk');
  assert.equal(effectiveCat({ cat: 'ministry', title: '解釋自己的信仰 — 演講', roleLabel: '學生/助手' }), 'ministry');
  assert.equal(effectiveCat({ cat: 'living', title: '生活演講', roleLabel: undefined }), 'living');
});

test('effectiveCat: label-less ministry discussion part (你會怎麼說) → ministrydisc (elder/MS conducts, S-38 ¶6)', () => {
  assert.equal(effectiveCat({ cat: 'ministry', title: '你會怎麼說？', roleLabel: undefined }), 'ministrydisc');
  // Single-student demo (admin removed the helper) keeps the mixed pool.
  assert.equal(effectiveCat({ cat: 'ministry', title: '初次交談 — 向住戶作見證', roleLabel: '學生' }), 'ministry');
});

test('slotCat: CBS reader slot → cbsread; conductor → cbs', () => {
  const cbs = { cat: 'cbs', title: '會眾研經班', roleLabel: '主持/朗讀' };
  assert.equal(slotCat(cbs, '0'), 'cbs');
  assert.equal(slotCat(cbs, '1'), 'cbsread');
});

test('partTypeOf classifies ministry titles', () => {
  assert.equal(partTypeOf('初次交談 — 向住戶作見證'), '初次交談');
  assert.equal(partTypeOf('解釋自己的信仰 — 示範'), '解釋自己的信仰');
  assert.equal(partTypeOf('解釋自己的信仰 — 演講'), '演講');
  assert.equal(partTypeOf('你會怎麼說？'), null);
});
