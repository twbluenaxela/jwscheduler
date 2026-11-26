import { notFound } from 'next/navigation';

import ReimportFixture from './ReimportFixture';

export const dynamic = 'force-dynamic';

export default async function ReimportFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ReimportFixture />;
}
