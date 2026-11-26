import { notFound } from 'next/navigation';

import ImportExportFixture from './ImportExportFixture';

// LOCAL TEST ONLY — fixture route for the 匯出 page e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function ImportExportFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ImportExportFixture />;
}
