'use client';

import { useState } from 'react';
import ReimportDialog from '../../components/ReimportDialog';
import { diffImport } from '../../lib/reimportDiff.mjs';

const existingWeeks = [
  {
    date: '12月 3日',
    treasures: [{ id: 't0', title: '舊標題一', dur: '10 分鐘', roleLabel: undefined, hideHelper: false, assign: ['甲'] }],
    ministry: [{ id: 'm0', title: '舊標題二', dur: '5 分鐘', roleLabel: '學生/助手', hideHelper: false, assign: ['乙', '丙'] }],
    living: [
      { id: 'l0', title: '基督徒的生活', dur: '10 分鐘', roleLabel: undefined, hideHelper: false, assign: [] },
      { id: 'x_abc', title: '新增節目', dur: '3 分鐘', roleLabel: undefined, hideHelper: false, assign: ['丁'] },
    ],
  },
  {
    date: '12月 10日',
    treasures: [{ id: 't0', title: '上帝話語的寶藏', dur: '10 分鐘', roleLabel: undefined, hideHelper: false, assign: [] }],
    ministry: [],
    living: [],
  },
];

const parsedWeeks = [
  {
    date: '12月 3日',
    treasures: [{ id: 't0', title: '上帝話語的寶藏', dur: '10 分鐘', roleLabel: undefined }],
    ministry: [{ id: 'm0', title: '初次交談', dur: '5 分鐘', roleLabel: '學生/助手' }],
    living: [
      { id: 'l0', title: '基督徒的生活', dur: '10 分鐘', roleLabel: undefined },
      { id: 'cbs', title: '會眾研經班', dur: '30 分鐘', roleLabel: '主持/朗讀' },
    ],
  },
  {
    date: '12月 10日',
    treasures: [{ id: 't0', title: '上帝話語的寶藏', dur: '10 分鐘', roleLabel: undefined }],
    ministry: [],
    living: [],
  },
  {
    date: '12月 17日',
    treasures: [],
    ministry: [],
    living: [],
  },
];

export default function ReimportFixture() {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState('keep');
  const diffs = diffImport(existingWeeks, parsedWeeks);
  return (
    <div style={{ padding: 24 }}>
      <h1>Re-import dialog fixture</h1>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>Open dialog</button>
      <ReimportDialog
        open={open}
        diffs={diffs}
        mode={mode}
        onModeChange={setMode}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        saving={false}
      />
    </div>
  );
}
