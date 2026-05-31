'use client';

const sources = [
  { ic: '▤', name: 'Excel (.xlsx)', desc: '沿用現有表格 · 種子人員與歷史指派', rel: 'high' },
  { ic: '▦', name: '圖片 (JPG / PNG)', desc: '拍下的表格 · 以視覺辨識解析', rel: 'med' },
  { ic: '▥', name: 'PDF', desc: '文字層解析，必要時以視覺辨識', rel: 'med' },
  { ic: '❖', name: '聚會手冊 EPUB', desc: '每週節目 · 標題／時長／詩歌', rel: 'high' },
];

const reviewItems = [
  { ok: true,  part: '經文朗讀',         who: '李建宏',         note: '' },
  { ok: true,  part: '初次交談 / 助手',  who: '黃美玲 / 周佩珊', note: '' },
  { ok: false, part: '屬靈寶石',         who: '張宗翰？',        note: '辨識度低，請確認' },
  { ok: true,  part: '會眾研經班',       who: '劉政德 / 蔡明杰', note: '' },
];

const exportCards = [
  { ic: '▦', label: '分享圖片', sub: 'JPG · 貼到 LINE 群組' },
  { ic: '▤', label: '匯出 Excel', sub: '沿用原本表格格式' },
  { ic: '▥', label: '匯出 PDF', sub: '列印用排版' },
  { ic: '⎙', label: '列印', sub: '直接送印表機' },
];

export default function ImportPage() {
  return (
    <section>
      <div className="toolbar">
        <span className="toolbar__title">匯入 / 匯出</span>
      </div>

      <div className="imp-grid">
        {/* Import column */}
        <div className="imp-col">
          <h3 className="imp-h">匯入資料</h3>
          <div className="dropzone">
            <div className="dropzone__ic">⬆</div>
            <div className="dropzone__t">拖曳檔案到這裡，或<u>點擊選擇</u></div>
            <div className="dropzone__sub">支援 Excel · 圖片 · PDF · 聚會手冊 EPUB</div>
          </div>
          <div className="srcs">
            {sources.map((s, i) => (
              <div key={i} className="src">
                <span className="src__ic">{s.ic}</span>
                <div className="src__t">
                  <span className="src__name">{s.name}</span>
                  <span className="src__desc">{s.desc}</span>
                </div>
                <span className={`rel rel--${s.rel}`}>
                  {s.rel === 'high' ? '高準確度' : '需審核'}
                </span>
              </div>
            ))}
          </div>
          <div className="pipeline">
            <span className="pl-step is-done">上傳</span>
            <span className="pl-arr">→</span>
            <span className="pl-step is-now">解析</span>
            <span className="pl-arr">→</span>
            <span className="pl-step">審核</span>
            <span className="pl-arr">→</span>
            <span className="pl-step">發布</span>
          </div>
        </div>

        {/* Review column */}
        <div className="imp-col">
          <h3 className="imp-h">
            審核 — 確認後才寫入
            <span className="imp-h__src">圖片解析 · 6/3 聚會</span>
          </h3>
          <div className="rev">
            <div className="rev-head">
              <span />
              <span>項目</span>
              <span>指派</span>
              <span>備註</span>
            </div>
            {reviewItems.map((r, i) => (
              <div key={i} className={`rev-row${!r.ok ? ' rev-row--warn' : ''}`}>
                <span className="rev-ic">{r.ok ? '✓' : '！'}</span>
                <span className="rev-part">{r.part}</span>
                <span className="rev-who">{r.who}</span>
                <span className="rev-note">{r.note}</span>
              </div>
            ))}
          </div>
          <div className="rev-actions">
            <button className="btn">捨棄</button>
            <button className="btn btn--primary">確認並發布</button>
          </div>
        </div>
      </div>

      <section className="exp-block">
        <h3 className="imp-h">匯出與分享</h3>
        <div className="exp-grid">
          {exportCards.map((c, i) => (
            <button key={i} className="exp-card">
              <span className="exp-ic">{c.ic}</span>
              <b>{c.label}</b>
              <small>{c.sub}</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
