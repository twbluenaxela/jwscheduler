'use client';

import { useEffect, useRef, useState } from 'react';

import ImportPage from '../../../components/ImportPage';
import { FIXTURE_WEEKS, fixtureGetAssign } from '../../midweek-pdf/fixtureWeeks.mjs';

// LOCAL TEST ONLY. Mounts the real 匯入 / 匯出 page with synthetic weeks so
// tests/e2e/exports.e2e.mjs can press 分享圖片 / PDF 版面 / 下載 PDF / 匯出 Excel /
// 列印 and inspect the real files. Never served in production.
export default function ImportExportFixture() {
  const [ready, setReady] = useState(false);
  const weekCount = useRef(FIXTURE_WEEKS.length);

  useEffect(() => {
    // The off-screen capture cards mount a frame after the page's own render.
    const timer = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="content" style={{ padding: 16 }}>
        <ImportPage existingWeeks={FIXTURE_WEEKS} getAssign={fixtureGetAssign} />
      </div>
    </main>
  );
}
