import { notFound } from 'next/navigation';

import CountSheetExportFixture from './CountSheetExportFixture';

// LOCAL TEST ONLY — fixture route for the 書刊 S-28 列印 e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function CountSheetExportFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CountSheetExportFixture />;
}
