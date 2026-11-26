import { notFound } from 'next/navigation';

import PeopleExportFixture from './PeopleExportFixture';

// LOCAL TEST ONLY — fixture route for the 人員 iCal / calendar-link e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function PeopleExportFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PeopleExportFixture />;
}
