import { notFound } from 'next/navigation';

import MidweekExportFixture from './MidweekExportFixture';

// LOCAL TEST ONLY — fixture route for the 週中 export-menu e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function MidweekExportFixturePage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const weekIndex = Number(params?.week ?? 0) || 0;
  return <MidweekExportFixture weekIndex={weekIndex} editing={params?.editing === '1'} />;
}
