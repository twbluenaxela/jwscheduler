'use client';

export default function TabBar({ page, setPage, role }) {
  const canEdit = role === 'ADMIN' || role === 'SYSADMIN';
  const items = [
    {
      id: 'meetings', label: '本週',
      icon: <svg viewBox="0 0 24 24" className="navicon"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3.5v3M16 3.5v3"/></svg>,
    },
    {
      id: 'overview', label: '總覽',
      icon: <svg viewBox="0 0 24 24" className="navicon"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>,
    },
    {
      id: 'people', label: '人員',
      icon: <svg viewBox="0 0 24 24" className="navicon"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 6.5a2.7 2.7 0 0 1 0 5.2M17.5 19c0-2.2-1-3.8-2.5-4.6"/></svg>,
    },
    {
      id: 'import', label: '匯入',
      icon: <svg viewBox="0 0 24 24" className="navicon"><path d="M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/></svg>,
    },
    {
      id: 'settings', label: '設定',
      icon: <svg viewBox="0 0 24 24" className="navicon"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    },
  ];

  const visible = items.filter((i) => canEdit || i.id !== 'import');

  return (
    <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${visible.length}, 1fr)` }}>
      {visible.map((item) => (
        <button
          key={item.id}
          className="tabbar__item"
          aria-current={page === item.id ? 'true' : 'false'}
          onClick={() => setPage(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
