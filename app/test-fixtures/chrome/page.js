import { notFound } from 'next/navigation';

import ChromeFixture from './ChromeFixture';

// LOCAL TEST ONLY — chrome-clad fixture pages for the iPad rail audit.
export const dynamic = 'force-dynamic';

export default async function ChromeFixturePage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  return <ChromeFixture name={params?.page ?? 'overview'} />;
}
