'use client';
import Icon from './Icon';
import Menu from './Menu';
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchPublications } from '../../lib/literature.mjs';
import { localizedName } from '../../lib/publicForm.mjs';
import { countSection, distributed, expected, groupCountLines, hubReportRows, s28Rows } from '../../lib/literatureInventory.mjs';
import PubThumb, { Sheet } from './PubThumb';

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export default function CountSheet({ id, items, request, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [edited, setEdited] = useState({});
  const [expanded, setExpanded] = useState({});
  const [report, setReport] = useState('');
  const [adding, setAdding] = useState(false);
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState({});
  const timers = useRef({});
  const pending = useRef({});
  const nameOf = (p) => p && localizedName(p, items);

  const load = useCallback(async () => {
    try {
      setData(await request(`/api/literature/inventory/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }, [id, request]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveLine(lineId, patch) {
    setSaving((s) => ({ ...s, [lineId]: '儲存中…' }));
    try {
      await request(`/api/literature/inventory/${id}/lines/${lineId}`, json('PATCH', patch));
      setSaving((s) => ({ ...s, [lineId]: '已儲存' }));
    } catch (err) {
      setError(err.message);
      setSaving((s) => ({ ...s, [lineId]: '儲存失敗' }));
    }
  }

  function change(line, patch, markEdited = true) {
    if (markEdited) setEdited((current) => ({ ...current, [line.id]: true }));
    setData((d) => ({
      ...d,
      lines: d.lines.map((l) => l.id === line.id ? { ...l, ...patch } : l),
    }));
    pending.current[line.id] = { ...pending.current[line.id], ...patch };
    setSaving((s) => ({ ...s, [line.id]: '等待儲存…' }));
    clearTimeout(timers.current[line.id]);
    timers.current[line.id] = setTimeout(() => {
      const value = pending.current[line.id];
      delete pending.current[line.id];
      saveLine(line.id, value);
    }, 500);
  }

  async function flush() {
    await Promise.all(Object.entries(pending.current).map(([lineId, patch]) => {
      clearTimeout(timers.current[lineId]);
      delete pending.current[lineId];
      return saveLine(lineId, patch);
    }));
  }

  if (!data) {
    return (
      <div>
        <button className="btn" onClick={onBack}>返回</button>
        {error || '載入中…'}
      </div>
    );
  }

  const { count, lines } = data;
  const counted = lines.filter((line) => line.onHand !== null).length;
  const rows = s28Rows(items, lines);
  const matches = new Set(matchPublications(query, items, { limit: items.length }).map((p) => p.id));
  const sections = groupCountLines(lines, items, edited);
  const visible = rows.filter((row) => !query || matches.has(row.publication.id));
  const hub = hubReportRows(items, lines);
  const monthLabel = `${Number(count.month.slice(5, 7))}月清點`;
  const done = count.status === 'done';

  async function finish() {
    if (counted < lines.length && !window.confirm('仍有未清點的品項，確定完成清點？')) return;
    await flush();
    try {
      await request(`/api/literature/inventory/${id}`, json('PATCH', { status: 'done' }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function add(publication) {
    try {
      await request(`/api/literature/inventory/${id}/lines`, json('POST', { publicationId: publication.id }));
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (report === 's28') {
    return (
      <div className="lit-print-area">
        <div className="lit-report-actions">
          <button className="lit-back" onClick={() => setReport('')}><Icon name="back" /> 清點</button>{' '}
          <button className="btn" onClick={() => window.print()}>列印</button>
        </div>
        <h1>{count.month} 存書月結記錄 S-28</h1>
        <table className="lit-report-table">
          <thead>
            <tr>
              {['項目編號', '名稱', '代號', '原有', '收', '現有', '發'].map((x) => <th key={x}>{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.publication.itemNumber}</td>
                <td>{nameOf(row.publication)}</td>
                <td>{row.publication.code}</td>
                <td>{row.opening}</td>
                <td>{row.received}</td>
                <td>{row.onHand ?? '—'}</td>
                <td>{distributed(row) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (report === 'hub') {
    return (
      <div>
        <div className="lit-report-actions">
          <button className="lit-back" onClick={() => setReport('')}><Icon name="back" /> 清點</button>
          <button
            className="btn"
            onClick={() => navigator.clipboard
              .writeText(hub.map((r) => `${r.publication.code}\t${r.onHand}`).join('\n'))
              .catch((err) => setError(err.message))}
          >
            複製
          </button>
        </div>
        <h1>JW Hub 填寫清單</h1>
        {error && <div className="imp-error">{error}</div>}
        {!hub.length && <p>還沒有任何現有數量。先在清點表填入數字，這裡就會列出要填到 JW Hub 的項目。</p>}
        {[...new Set(hub.map((r) => r.section))].map((section) => (
          <section key={section}>
            <h2>{section}</h2>
            {hub.filter((r) => r.section === section).map((r) => (
              <label className="lit-inventory-row" key={r.id}>
                <input
                  type="checkbox"
                  checked={!!checked[r.id]}
                  onChange={(e) => setChecked({ ...checked, [r.id]: e.target.checked })}
                />
                <span>{r.publication.code} · {nameOf(r.publication)}</span>
                <strong>{r.onHand}</strong>
              </label>
            ))}
          </section>
        ))}
      </div>
    );
  }

  function renderRow(line) {
    const amount = distributed(line);
    return (
      <article className="lit-count-row" key={line.id}>
        <PubThumb publication={line.publication} />
        <div className={`lit-count-meta${line.onHand !== null ? ' lit-count-meta--counted' : ''}`}>
          <strong className={expected(line) === 0 && !line.onHand ? 'lit-count-empty' : ''} title={nameOf(line.publication)}>
            {nameOf(line.publication)}
            {!countSection(line.publication).hub && <span className="lit-count-self">自記</span>}
          </strong>
          <span>{line.publication.code} · {done ? `原有 ${line.opening}` : <button className="lit-opening" onClick={() => {
            const value = window.prompt('原有數量', line.opening);
            if (value !== null && /^\d+$/.test(value)) change(line, { opening: Number(value) });
          }}>原有 {line.opening}</button>} <span className={line.received > 0 ? "lit-received" : ""}>＋收 {line.received}</span></span>
        </div>
        <div className="lit-count-value">
          {saving[line.id] === '儲存失敗' && <small className="lit-count-error" role="status">儲存失敗</small>}
          {!done && line.onHand === null && <span>應有 {expected(line)}</span>}
          <div>
            {line.onHand !== null && line.onHand === expected(line) && <span className="lit-count-equal" role="img" aria-label="與應有相同"><Icon name="check" /></span>}
            {!done && line.onHand === null && <button className="lit-count-check" aria-label="與應有相同" onClick={() => change(line, { onHand: expected(line) })}><Icon name="check" /></button>}
            {done ? <strong className="lit-count-readonly">{line.onHand ?? '—'}</strong> : <input
              aria-label={`${nameOf(line.publication)} 現有`}
              type="number"
              inputMode="numeric"
              min="0"
              value={line.onHand ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || /^\d+$/.test(value)) {
                  change(line, { onHand: value === '' ? null : Number(value) });
                }
              }}
            />}
          </div>
          {amount !== null && <span className={amount < 0 ? 'lit-count-error' : amount === 0 ? 'lit-count-zero' : ''}>{amount < 0 ? `多 ${Math.abs(amount)}` : `發 ${amount}`}</span>}
        </div>
      </article>
    );
  }

  return (
    <div className="lit-detail">
      <button
        className="lit-back"
        onClick={async () => {
          await flush();
          onBack();
        }}
      >
        <Icon name="back" /> 清點
      </button>
      <div className="lit-header lit-count-header">
        <h1>{monthLabel}</h1>
        {!done && <Menu items={[
          { label: 'S-28 表', onSelect: () => setReport('s28') },
          { label: 'JW Hub 填寫清單', onSelect: () => setReport('hub') },
          { label: '加入品項', onSelect: () => { setAddQuery(''); setAdding(true); } },
        ]} />}
      </div>
      {done && <div className="lit-count-complete">
        <div className="lit-count-reports">
          <button className="btn" onClick={() => setReport('s28')}>S-28 表</button>
          <button className="btn" onClick={() => setReport('hub')}>JW Hub 填寫清單</button>
        </div>
        <p>已完成 · {lines.length} 項</p>
      </div>}
      <div className="lit-count-filter-row">
        <nav className="lit-count-chips" aria-label="清點分區">
          {sections.map((section) => (
            <button key={section.group} onClick={() => {
              setSearching(false);
              setQuery('');
              requestAnimationFrame(() => {
                const target = document.getElementById(`count-section-${section.group}`);
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                target?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
              });
            }}>
              {section.group} {section.total === section.counted ? '✓' : section.total - section.counted}
            </button>
          ))}
        </nav>
        <button className="lit-search-toggle" aria-label="搜尋" aria-expanded={searching} onClick={() => {
          setSearching(!searching);
          if (searching) setQuery('');
        }}>
          <Icon name="search" />
        </button>
      </div>
      {searching && <div className="lit-count-search">
        <input className="field__input" placeholder="搜尋書刊" aria-label="搜尋書刊" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
        <button aria-label="清除搜尋" onClick={() => setQuery('')}><Icon name="close" /></button>
      </div>}
      {error && <div className="imp-error" role="alert">{error}</div>}
      {searching ? visible.map(renderRow) : sections.map((section) => {
        const isExpanded = !!expanded[section.group];
        const uncountedZeros = section.zeros.filter((line) => line.onHand === null);
        return (
          <section className="lit-count-section" id={`count-section-${section.group}`} key={section.group}>
            <h2 className="lit-count-section-heading">
              <span>{section.group}</span>
              <span>{section.counted}/{section.total}</span>
            </h2>
            {section.lines.map(renderRow)}
            {section.zeros.length > 0 && <>
              <div className="lit-count-fold">
                <button
                  className="lit-count-fold-toggle"
                  aria-expanded={isExpanded}
                  aria-controls={`count-zeros-${section.group}`}
                  onClick={() => setExpanded((current) => ({ ...current, [section.group]: !isExpanded }))}
                >
                  {uncountedZeros.length ? `另有 ${section.zeros.length} 項為 0` : `${section.zeros.length} 項 0 已確認`}
                </button>
                {!done && <button
                  className="lit-count-fold-confirm"
                  disabled={!uncountedZeros.length}
                  onClick={() => uncountedZeros.forEach((line) => change(line, { onHand: 0 }, false))}
                >
                  全部確認為 0
                </button>}
              </div>
              <div className="lit-count-fold-content" data-expanded={isExpanded} id={`count-zeros-${section.group}`} inert={!isExpanded}>
                <div>{section.zeros.map(renderRow)}</div>
              </div>
            </>}
          </section>
        );
      })}
      {!done && <div className="lit-count-footer">
        <span>已清點 {counted} / {lines.length}</span>
        <button className="btn btn--primary" onClick={finish}>完成清點</button>
      </div>}
      {adding && (
        <Sheet title="加入品項" close={() => setAdding(false)}>
          <input
            className="field__input"
            placeholder="搜尋書刊"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
          />
          {matchPublications(
            addQuery,
            items.filter((p) => !['w', 'mwb', 'wlp'].includes(p.code) && !lines.some((l) => l.publicationId === p.id)),
            { limit: 100 },
          ).map((p) => (
            <button className="lit-preview-line" key={p.id} onClick={() => add(p)}>
              <PubThumb publication={p} />
              <span>{nameOf(p)} · {p.code}</span>
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
