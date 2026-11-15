import PublicRequestForm from '../../components/literature/PublicRequestForm';

export const metadata = { title: '書刊申請', robots: { index: false, follow: false } };

export default async function Page({ params }) {
  return <PublicRequestForm token={(await params).token} />;
}
