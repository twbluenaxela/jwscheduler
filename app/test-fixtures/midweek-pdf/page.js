import { notFound } from 'next/navigation';

import PdfFixture from './PdfFixture';

// LOCAL TEST ONLY — a fixture route for the PDF capture e2e test
// (tests/e2e/midweek-pdf.e2e.mjs). It renders the same off-screen cards the
// 匯出 page uses, with synthetic data, so the print CSS can be tested on a
// phone viewport without a login or a database. Never served in production.
export const dynamic = 'force-dynamic';

export default async function MidweekPdfFixturePage({ searchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  // ?editing=1 puts body.editing on, so the test can prove edit-mode CSS cannot
  // leak into a capture. searchParams is a Promise from Next 15 on.
  const params = await searchParams;
  const editing = params?.editing === '1';
  return <PdfFixture editing={editing} />;
}
