'use client';
import Image from 'next/image';

const LABELS = { meetings: '本週聚會', overview: '總覽', people: '人員', import: '匯入 / 匯出' };

export default function TopBar({ page }) {
  return (
    <header className="topbar">
      <Image
        src="/jwschedulerlogo.png"
        alt="聚會安排"
        width={28}
        height={28}
        className="brand__logo"
        priority
      />
      <span className="brand__name">聚會安排</span>
      <span className="brand__cong">{LABELS[page] ?? '新屋'}</span>
    </header>
  );
}
