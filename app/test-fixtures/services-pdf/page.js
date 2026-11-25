import { notFound } from 'next/navigation';

import ServicesPdfFixture from './ServicesPdfFixture';

// LOCAL TEST ONLY — fixture route for the 服務 PDF/JPG e2e test
// (tests/e2e/services-pdf.e2e.mjs). It mounts the real ServicesPage behind a
// mocked API so the print sheet and the 匯出 menu can be exercised on a phone
// viewport without a login or a database. Never served in production.
export const dynamic = 'force-dynamic';

export default async function ServicesPdfFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ServicesPdfFixture />;
}
