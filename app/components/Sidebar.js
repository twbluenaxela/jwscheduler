'use client';
import Image from 'next/image';

export default function Sidebar({ page, setPage }) {
  const items = [
    {
      id: 'meetings',
      label: '本週聚會',
      icon: (
        <svg viewBox="0 0 24 24" className="navicon">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9h17M8 3.5v3M16 3.5v3" />
        </svg>
      ),
    },
    {
      id: 'overview',
      label: '總覽',
      icon: (
        <svg viewBox="0 0 24 24" className="navicon">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      ),
    },
    {
      id: 'people',
      label: '人員',
      icon: (
        <svg viewBox="0 0 24 24" className="navicon">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <path d="M16 6.5a2.7 2.7 0 0 1 0 5.2M17.5 19c0-2.2-1-3.8-2.5-4.6" />
        </svg>
      ),
    },
    {
      id: 'import',
      label: '匯入 / 匯出',
      icon: (
        <svg viewBox="0 0 24 24" className="navicon">
          <path d="M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10" />
          <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="sidenav">
      <div className="brand">
        <Image
          src="/jwschedulerlogo.png"
          alt="聚會安排"
          width={34}
          height={34}
          className="brand__logo"
          priority
        />
        <span className="brand__name">聚會安排</span>
        <span className="brand__cong">新屋會眾</span>
      </div>
      <nav className="navlist">
        {items.map((item) => (
          <button
            key={item.id}
            className="navitem"
            aria-current={page === item.id ? 'true' : 'false'}
            onClick={() => setPage(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidenav__foot">
        <div className="sidenav__health">
          <span className="health-dot" />
          <span>
            未來 3 週<br />
            <b>有 2 個空缺待補</b>
          </span>
        </div>
      </div>
    </aside>
  );
}
