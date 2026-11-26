import { notFound } from 'next/navigation';

import HeatmapExportFixture from './HeatmapExportFixture';

// LOCAL TEST ONLY — fixture route for the 指派分布 export e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function HeatmapExportFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <HeatmapExportFixture />;
}
