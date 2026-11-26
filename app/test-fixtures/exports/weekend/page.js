import { notFound } from 'next/navigation';

import WeekendExportFixture from './WeekendExportFixture';

// LOCAL TEST ONLY — fixture route for the 週末 export-menu e2e test
// (tests/e2e/exports.e2e.mjs). Never served in production.
export const dynamic = 'force-dynamic';

export default async function WeekendExportFixturePage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  return <WeekendExportFixture editing={params?.editing === '1'} />;
}
