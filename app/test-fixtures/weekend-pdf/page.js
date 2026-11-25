import { notFound } from 'next/navigation';

import WeekendPdfFixture from './WeekendPdfFixture';

// LOCAL TEST ONLY — fixture route for the 週末 PDF e2e test
// (tests/e2e/weekend-pdf.e2e.mjs). It renders the real WeekendView with
// synthetic rows so the PrintStage table can be checked on a phone viewport
// without a login or a database. Never served in production.
export const dynamic = 'force-dynamic';

export default async function WeekendPdfFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <WeekendPdfFixture />;
}
