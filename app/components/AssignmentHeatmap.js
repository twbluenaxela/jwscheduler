'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  buildHeatmapRows, buildPersonDetail, buildPersonSummary,
  eventsByWeek, SERVICE_MONTH_ORDER,
} from '../lib/heatmap.mjs';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

const GENDER_OPTS = [['all', '全部'], ['F', '姊妹'], ['M', '弟兄']];
const RANGE_OPTS = [[3, '3 個月'], [6, '6 個月'], [12, '整年']];

function rampStep(n) { return Math.min(n, 3); }

function Bubble({ text }) {
  return <div className="hm-bubble">{text}</div>;
}

// ─── Overview grid ────────────────────────────────────────────────────────────

function OverviewGrid({ people, midweekWeeks, weekendRows, getAssign, onOpenPerson }) {
  const isMobile = useIsMobile();
  const [gender, setGender] = useState('all');
  const [range, setRange] = useState(12);
  const [offset, setOffset] = useState(0);
  const [hoverKey, setHoverKey] = useState(null);

  const data = useMemo(
    () => buildHeatmapRows(people, midweekWeeks, {}, weekendRows, { gender, range, offset, getAssign }),
    [people, midweekWeeks, weekendRows, getAssign, gender, range, offset]
  );
  const { rows, win, monthMode } = data;

  const monthMode12 = monthMode;
  const sq = monthMode12 ? (isMobile ? 20 : 30) : (isMobile ? 14 : 26);
  const gap = monthMode12 ? 4 : 3;
  const pad = monthMode12 ? 2 : 5;
  const rowH = monthMode12 ? (isMobile ? 34 : 42) : (isMobile ? 34 : 38);
  const nameW = isMobile ? 88 : 176;
  const radius = monthMode12 ? 4 : 3;

  const totalMonths = 12;
  const endIdx = totalMonths - offset;
  const startIdx = Math.max(0, endIdx - range);
  const atStart = startIdx <= 0;
  const atEnd = offset <= 0;

  function changeRange(n) { setRange(n); setOffset(0); }
  function goPrev() { setOffset((o) => Math.min(totalMonths - range, o + range)); }
  function goNext() { setOffset((o) => Math.max(0, o - range)); }

  const attnCount = rows.filter((r) => r.rank > 0).length;
  const rangeLabel = win.length ? `${win[0].month}月 – ${win[win.length - 1].month}月` : '';
  const noteText = monthMode12 ? '一格一個月，點一下看那個月的內容' : '一格一週，點一下看那一週的內容';

  function monthHeaderStyle(m) {
    const w = (monthMode12 ? 1 : m.weekIdxs.length) * (sq + gap) - gap + pad * 2;
    return { flex: 'none', width: w, textAlign: 'center' };
  }

  function bandStyle(mi) {
    return {
      display: 'flex', alignItems: 'center', gap, flex: 'none',
      padding: `0 ${pad}px`, height: rowH,
      background: monthMode12 ? 'transparent' : (mi % 2 ? 'var(--hm-band-tint)' : 'transparent'),
    };
  }

  return (
    <div className="hm-root">
      <div className="hm-header">
        <div>
          <div className="hm-title">指派分布</div>
          <div className="hm-subhead">
            {rangeLabel} · {rows.length} 位 · {noteText} · {attnCount > 0 ? `需要注意的 ${attnCount} 位排在最前面` : '目前沒有需要注意的人'}
          </div>
        </div>
        <div className="hm-filters">
          <div className="hm-seg">
            {GENDER_OPTS.map(([v, label]) => (
              <button key={v} className={`hm-seg__btn${gender === v ? ' is-on' : ''}`} onClick={() => setGender(v)}>{label}</button>
            ))}
          </div>
          <div className="hm-seg">
            {RANGE_OPTS.map(([n, label]) => (
              <button key={n} className={`hm-seg__btn${range === n ? ' is-on' : ''}`} onClick={() => changeRange(n)}>{label}</button>
            ))}
          </div>
          {!isMobile && (
            <div className="hm-arrows">
              <button className="hm-arrow" disabled={atStart} onClick={goPrev}>‹</button>
              <button className="hm-arrow" disabled={atEnd} onClick={goNext}>›</button>
            </div>
          )}
        </div>
      </div>
      {isMobile && (
        <div className="hm-arrows hm-arrows--row">
          <button className="hm-arrow" disabled={atStart} onClick={goPrev}>‹</button>
          <button className="hm-arrow" disabled={atEnd} onClick={goNext}>›</button>
        </div>
      )}

      <div className="hm-tablewrap" onMouseLeave={() => setHoverKey(null)}>
      <div className="hm-colhead" style={{ height: isMobile ? 30 : 34 }}>
        <div className="hm-colhead__name" style={{ width: nameW }}>姓名</div>
        {win.map((m, mi) => (
          <div key={`${m.year}-${m.month}`} style={monthHeaderStyle(m)}>
            <span className="hm-colhead__month">{m.month}月</span>
          </div>
        ))}
        {!isMobile && <div className="hm-colhead__attn">需要注意</div>}
        <div className="hm-colhead__count">件數</div>
      </div>

      <div className="hm-body">
        {rows.length === 0 && <div className="people-empty">目前沒有符合條件的成員。</div>}
        {rows.map((r, ri) => {
          const lastAttn = r.rank > 0 && (!rows[ri + 1] || rows[ri + 1].rank === 0);
          const flagged = r.dbl > 0;
          const note = r.dbl ? `同月 ${r.dbl} 次重複` : r.idle ? `${r.idle} 個月未派` : '';
          return (
            <div
              key={r.person.id ?? r.person.name}
              className={`hm-row${lastAttn ? ' hm-row--lastAttn' : ''}`}
              style={{ height: rowH }}
            >
              <button className="hm-name" style={{ width: nameW }} onClick={() => onOpenPerson(r.person)}>
                <span className={`hm-badge hm-badge--${r.person.g === 'F' ? 'f' : 'm'}`}>{r.person.g === 'F' ? '姊' : '兄'}</span>
                <span className="hm-name__text">{r.person.name}</span>
              </button>
              {r.monthly.map((m, mi) => (
                <div key={mi} style={bandStyle(mi)}>
                  {monthMode12 ? (
                    <Cell
                      n={m.n} sq={sq} radius={radius}
                      bubbleText={m.events.map((e) => `${e.date.getMonth() + 1}月${e.date.getDate()}日　${e.label}`).join('\n')}
                      cellKey={`${r.person.name}-m-${m.year}-${m.month}`}
                      hoverKey={hoverKey} setHoverKey={setHoverKey}
                    />
                  ) : (
                    m.weekIdxs.map((wi) => {
                      const wEvts = r.byWeek.get(wi) ?? [];
                      return (
                        <Cell
                          key={wi}
                          n={wEvts.length} sq={sq} radius={radius}
                          bubbleText={wEvts.map((e) => `${e.date.getMonth() + 1}月${e.date.getDate()}日　${e.label}`).join('\n')}
                          cellKey={`${r.person.name}-w-${wi}`}
                          hoverKey={hoverKey} setHoverKey={setHoverKey}
                        />
                      );
                    })
                  )}
                </div>
              ))}
              {!isMobile && (
                <div className="hm-attn">
                  {r.rank > 0 && <span className={`hm-chip${flagged ? ' hm-chip--warn' : ''}`}>{note}</span>}
                </div>
              )}
              <div className="hm-count" style={{ color: flagged ? 'var(--special)' : 'var(--ink-3)' }}>{r.total}</div>
            </div>
          );
        })}
      </div>
      </div>

      <div className="hm-legend">
        <div className="hm-legend__ramp">
          <span className="hm-legend__lbl">件數</span>
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="hm-legend__swatch-wrap">
              <div className={`hm-swatch hm-swatch--${n}`} />
              <span className="hm-legend__n">{n === 3 ? '3+' : n}</span>
            </div>
          ))}
        </div>
        <div className="hm-legend__note">粗線以上為需要注意的人：同月兩份以上，或該期間內長期沒有指派</div>
      </div>
    </div>
  );
}

function Cell({ n, sq, radius, bubbleText, cellKey, hoverKey, setHoverKey }) {
  const active = n > 0 && hoverKey === cellKey;
  const has = n > 0;
  return (
    <div
      className="hm-cellwrap"
      style={{ cursor: has ? 'pointer' : 'default' }}
      onMouseEnter={has ? () => setHoverKey(cellKey) : undefined}
      onClick={has ? () => setHoverKey((k) => (k === cellKey ? null : cellKey)) : undefined}
    >
      <div className={`hm-cell hm-cell--${rampStep(n)}`} style={{ width: sq, height: sq, borderRadius: radius }} />
      {active && <Bubble text={bubbleText} />}
    </div>
  );
}

// ─── Person detail ────────────────────────────────────────────────────────────

function PersonDetail({ person, midweekWeeks, weekendRows, getAssign, onBack }) {
  const isMobile = useIsMobile();
  const [hoverKey, setHoverKey] = useState(null);

  const detail = useMemo(
    () => buildPersonDetail(person.name, person.g, midweekWeeks, {}, weekendRows, { getAssign }),
    [person, midweekWeeks, weekendRows, getAssign]
  );
  const summary = useMemo(() => buildPersonSummary(person.name, person.g, detail), [person, detail]);
  const byWeek = useMemo(() => eventsByWeek(detail.evts, detail.startYear), [detail]);

  const maxMonthly = Math.max(...detail.monthly.map((m) => m.n), 1);
  const genderLabel = person.g === 'F' ? '姊妹' : '弟兄';
  const serviceYearLabel = `${detail.startYear}–${detail.startYear + 1} 服務年度`;

  const sq = isMobile ? 11 : 20;
  const bandGap = isMobile ? 3 : 4;

  function handleCopyText() {
    const lines = [
      `${person.name}（${genderLabel}）`,
      serviceYearLabel,
      '',
      summary,
      '',
      '指派記錄：',
      ...detail.records.map((r) => `${r.date}　${r.label}${r.partner ? `　（${r.partner}）` : ''}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => alert('已複製到剪貼簿！'))
      .catch(() => alert('複製失敗，請手動複製。'));
  }

  function handlePrint() { window.print(); }

  const stats = [
    { label: '全年件數', value: `${detail.total} 份` },
    { label: '平均間隔', value: detail.avgGapWeeks != null ? `${detail.avgGapWeeks.toFixed(1)} 週` : '—' },
    { label: '最長間隔', value: detail.maxGapWeeks != null ? `${Math.round(detail.maxGapWeeks)} 週` : '—' },
    { label: '同月重複', value: detail.doubleMonths.length ? `${detail.doubleMonths.length} 次（${detail.doubleMonths.map((m) => `${m.month}月`).join('、')}）` : '無' },
  ];

  return (
    <div className="hm-person hm-print-root">
      <div className="hm-person__head">
        <div>
          <button className="hm-back" onClick={onBack}>‹ 總覽</button>
          <div className="hm-person__title">
            <span className="hm-person__name">{person.name}</span>
            <span className="hm-person__meta">{genderLabel}{person.appt ? ` · ${person.appt}` : ''} · {serviceYearLabel}</span>
          </div>
        </div>
        <div className="hm-person__actions hm-print-hide">
          <button className="btn btn--ghost" onClick={handleCopyText}>複製文字</button>
          <button className="btn btn--ghost" onClick={handlePrint}>列印一頁</button>
        </div>
      </div>

      <div className="hm-person__body">
        <div className="hm-person__left">
          <p className="hm-person__summary">{summary}</p>

          <div>
            <div className="hm-person__lbl">整年 52 週 · 點一下看內容</div>
            <div className="hm-grid52" onMouseLeave={() => setHoverKey(null)}>
              {detail.months.map((m) => (
                <div key={`${m.year}-${m.month}`} className="hm-grid52__band" style={{ gap: bandGap }}>
                  {m.weekIdxs.map((wi) => {
                    const wEvts = byWeek.get(wi) ?? [];
                    const dbl = wEvts.length >= 2;
                    const key = `p-${wi}`;
                    const active = wEvts.length > 0 && hoverKey === key;
                    return (
                      <div
                        key={wi}
                        className="hm-cellwrap"
                        style={{ cursor: wEvts.length ? 'pointer' : 'default' }}
                        onMouseEnter={wEvts.length ? () => setHoverKey(key) : undefined}
                        onClick={wEvts.length ? () => setHoverKey((k) => (k === key ? null : key)) : undefined}
                      >
                        <div
                          className={`hm-cell hm-cell--${dbl ? 'warn' : rampStep(wEvts.length)}`}
                          style={{ width: sq, height: sq, borderRadius: isMobile ? 3 : 5 }}
                        />
                        {active && <Bubble text={wEvts.map((e) => `${e.date.getMonth() + 1}月${e.date.getDate()}日　${e.label}`).join('\n')} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="hm-person__lbl">每月件數 · 褐色為同月兩份以上</div>
            <div className="hm-bars">
              {detail.monthly.map((m) => (
                <div key={`${m.year}-${m.month}`} className="hm-bars__col">
                  <span className="hm-bars__n">{m.n}</span>
                  <div
                    className={`hm-bars__bar${m.flagN >= 2 ? ' is-warn' : ` hm-cell--${rampStep(m.n)}`}`}
                    style={{ height: Math.max(18, 18 + m.n * 16) }}
                  />
                  <span className="hm-bars__lbl">{m.month}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hm-recwrap">
            <div className="hm-person__lbl hm-recwrap__head">
              <span>指派記錄</span>
              <span className="hm-recwrap__count">共 {detail.total} 份</span>
            </div>
            <div className="hm-reclist">
              {detail.records.length === 0 && <div className="people-empty">這個服務年度目前沒有指派記錄。</div>}
              {detail.records.map((r, i) => (
                <div key={i} className={`hm-rec${r.flagged ? ' hm-rec--flag' : ''}`}>
                  <span className={`hm-rec__date${r.flagged ? ' is-warn' : ''}`}>{r.date}</span>
                  <span className="hm-rec__label">{r.label}</span>
                  <span className="hm-rec__partner">{r.partner ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hm-person__right hm-print-hide">
          <div>
            <div className="hm-person__lbl">概況</div>
            {stats.map((s) => (
              <div key={s.label} className="hm-stat">
                <span className="hm-stat__lbl">{s.label}</span>
                <span className="hm-stat__val">{s.value}</span>
              </div>
            ))}
          </div>

          {detail.pairings.length > 0 && (
            <div>
              <div className="hm-person__lbl">助手搭配</div>
              <div className="hm-pairings">
                {detail.pairings.map((p) => (
                  <div key={p.name} className="hm-pairing">
                    <span className="hm-pairing__name">{p.name}</span>
                    <div className="hm-pairing__track">
                      <div className="hm-pairing__fill" style={{ width: `${(p.n / detail.pairings[0].n) * 100}%` }} />
                    </div>
                    <span className="hm-pairing__n">{p.n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.doubleMonths.length > 0 && (
            <div className="hm-callout">
              {`${detail.doubleMonths.map((m) => `${m.month}月`).join('、')}有兩份以上指派，超出同一個月一份的原則。其餘月份都在範圍內。`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AssignmentHeatmap({ people = [], midweekWeeks = [], weekendRows = [], getAssign }) {
  const [selected, setSelected] = useState(null);

  if (selected) {
    return (
      <PersonDetail
        person={selected}
        midweekWeeks={midweekWeeks}
        weekendRows={weekendRows}
        getAssign={getAssign}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <OverviewGrid
      people={people}
      midweekWeeks={midweekWeeks}
      weekendRows={weekendRows}
      getAssign={getAssign}
      onOpenPerson={setSelected}
    />
  );
}

