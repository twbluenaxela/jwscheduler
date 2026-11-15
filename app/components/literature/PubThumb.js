import { seriesOf } from '../../lib/literatureShipments.mjs';

export const SERIES = { w: '守望台研讀版', wlp: '守望台研讀版（大字版）', mwb: '聚會手冊', g: '警醒！', wp: '守望台（公眾版）' };
export const LANGUAGES = { CHT: '中文', ENG: '英文', JPN: '日文' };
export const GROUPS = ['A', 'B', 'C', 'D', 'E', '未分組'];
export const groupOf = (person) => GROUPS.includes(person.serviceGroup) ? person.serviceGroup : '未分組';
export const sameId = (a, b) => String(a) === String(b);

export function seriesPublication(items, series, language) {
  const issues = items.filter((p) => seriesOf(p.code) === series && p.language === language && p.coverUrl);
  issues.sort((a, b) => (b.issue || b.code).localeCompare(a.issue || a.code, undefined, { numeric: true }));
  return issues[0] || items.find((p) => p.code === series && p.language === language) || null;
}

export default function PubThumb({ publication, code, name }) {
  const label = name || publication?.name || code || '書刊';
  return (
    <span className="lit-thumb">
      {publication?.coverUrl ? <img src={publication.coverUrl} alt="" /> : <span className="lit-thumb__placeholder">{code || publication?.code || '書刊'}</span>}
      <span className="lit-thumb__code">{code || publication?.code}</span>
      <span>{label}</span>
    </span>
  );
}

export function Sheet({ title, close, children }) {
  return (
    <div className="sheet-backdrop open" onClick={close}>
      <div className="sheet lit-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="sheet__grab" />
        <header className="sheet__head"><strong>{title}</strong><button type="button" className="sheet__close" aria-label="關閉" onClick={close}>✕</button></header>
        <div className="lit-sheet-body">{children}</div>
      </div>
    </div>
  );
}
