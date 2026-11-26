import { notFound } from 'next/navigation';

import OverviewExportFixture from './OverviewExportFixture';

// LOCAL TEST ONLY — fixture route for the 總覽 複製文字 e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function OverviewExportFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <OverviewExportFixture />;
}
