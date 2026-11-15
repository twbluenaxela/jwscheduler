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

export function issueLabel(code) {
  const series = seriesOf(code || '');
  if (!series) return code || '書刊';
  const match = /^(?:wlp|mwb|wp|w|g)(\d{2})\.(\d{1,2})$/.exec(code);
  const unit = ['g', 'wp'].includes(series) ? '期' : '月';
  return `${match[1]}年${Number(match[2])}${unit}`;
}

export default function PubThumb({ publication, code, name, size = 'mini', language, format }) {
  const coverCode = code || publication?.code || '書刊';
  const label = name || publication?.name || coverCode;
  const series = seriesOf(coverCode);
  const displayCode = size === 'mini' ? series || coverCode : coverCode;
  const category = ['w', 'wlp', 'mwb'].includes(series) ? 'study'
    : ['g', 'wp'].includes(series) ? 'magazine' : publication?.category || 'other';
  const coverFormat = format || publication?.format || (series === 'wlp' ? 'large' : 'standard');
  const coverLanguage = language || publication?.language;
  const markers = [coverFormat === 'large' ? '大字' : coverFormat === 'pocket' ? '袖珍' : '',
    coverLanguage === 'ENG' ? '英' : coverLanguage === 'JPN' ? '日' : ''].filter(Boolean);
  return (
    <span className={`lit-cover lit-cover--${category} lit-cover--${size}`} aria-label={label}>
      {publication?.coverUrl ? <img src={publication.coverUrl} alt="" loading="lazy" /> : (
        <span className="lit-cover__print">
          <span className={`lit-cover__code${size === 'mini' && displayCode.length > 4 ? ' lit-cover__code--long' : ''}`}>
            {size === 'mini' ? displayCode : displayCode.split(/(?<=[.-])/).map((part, index) => (
              <span key={index}>{part}{/[.-]$/.test(part) && <wbr />}</span>
            ))}
          </span>
        </span>
      )}
      {markers.length > 0 && <span className="lit-cover__tag">{markers.join(' · ')}</span>}
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
