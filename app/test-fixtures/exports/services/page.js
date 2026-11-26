import { notFound } from 'next/navigation';

import ServicesExportFixture from './ServicesExportFixture';

// LOCAL TEST ONLY — fixture route for the 服務 export e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function ServicesExportFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ServicesExportFixture />;
}
