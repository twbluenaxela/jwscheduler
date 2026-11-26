'use client';

import { useEffect, useState } from 'react';

import CountSheet from '../../../components/literature/CountSheet';
import seed from '../../../data/literature-seed.json';

// LOCAL TEST ONLY. Mounts the real 書刊 清點 sheet (and its S-28 列印 route) with
// synthetic publications and one inventory count, so
// tests/e2e/exports.e2e.mjs can print the report and inspect the popup.
//
// The publication list is the repo's own seed catalogue (already public), with
// ids attached; the inventory lines are fabricated numbers.
const ITEMS = seed.map((item, index) => ({
  ...item,
  id: 5000 + index,
  active: true,
  coverUrl: null,
}));

const COUNTED = ITEMS.filter((item) => item.onS28).slice(0, 6);

const COUNT = {
  count: { id: 1, month: '2026-10', status: 'draft', completedAt: null },
  lines: COUNTED.map((item, index) => ({
    id: 8000 + index,
    publicationId: item.id,
    opening: 10 + index,
    received: index % 2 === 0 ? 5 : 0,
    onHand: 12 + index,
  })),
};

export const FIXTURE_ITEMS = ITEMS;
export const FIXTURE_COUNT = COUNT;

// Exactly the `request` hook CountSheet is given by the real page: it resolves
// to the PARSED body (`LiteraturePage`'s request does `response.json()` before
// returning), not to a Response.
async function request(url, init = {}) {
  const path = new URL(String(url), window.location.origin).pathname;
  if (path === '/api/literature/inventory/1') {
    return init.method === 'PATCH' ? { ok: true } : COUNT;
  }
  return { ok: true };
}

export default function CountSheetExportFixture() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="content" style={{ padding: 16 }}>
        <CountSheet id={1} items={ITEMS} request={request} onBack={() => {}} />
      </div>
    </main>
  );
}
