import { headers } from 'next/headers';
import db from '../../lib/db';
import { calendarLinks } from '../../lib/calendarFeed.mjs';
import { publicOrigin } from '../../lib/publicOrigin.mjs';
import CopyCalendarLink from './CopyCalendarLink';
import './page.css';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '聚會行事曆',
  robots: { index: false, follow: false },
};

export default async function CalendarPage({ params }) {
  const { token } = await params;
  const feed = await db.calendarFeed.findUnique({
    where: { token },
    include: { person: true, congregation: true },
  });

  if (!feed || feed.person.congregationId !== feed.congregationId) {
    return <main className="calendar-page"><p>找不到這個行事曆連結，請向編排負責人索取新的連結。</p></main>;
  }

  const requestHeaders = await headers();
  const origin = publicOrigin({ url: 'http://localhost', headers: requestHeaders });
  const links = calendarLinks(origin, token, feed.person.name);
  return (
    <main className="calendar-page">
      <header className="calendar-page__intro">
        <h1>{feed.person.name} 的聚會安排</h1>
        <p>加入後，你的委派會自動出現在行事曆，有變動也會自動更新。</p>
      </header>
      <div className="calendar-page__actions">
        <a className="calendar-page__button calendar-page__button--primary" href={links.webcal}>加到 iPhone／Mac 行事曆</a>
        <a className="calendar-page__button" href={links.google}>加到 Google 日曆</a>
        <a className="calendar-page__button" href={links.outlook}>加到 Outlook（個人帳號）</a>
        <a className="calendar-page__button" href={links.office}>加到 Outlook（公司／學校帳號）</a>
        <CopyCalendarLink url={links.ics} />
      </div>
      <div className="calendar-page__help">
        <p>Outlook 手機 App 無法直接訂閱：請先在 outlook.com 網頁版加入一次，之後會自動同步到 App。</p>
        <p>Google 日曆請用電腦或手機瀏覽器開啟，加入後 Google 日曆 App 會自動顯示。</p>
        <p>行事曆通常每隔幾小時更新一次。</p>
      </div>
      <footer className="calendar-page__footer">{feed.congregation.name}</footer>
    </main>
  );
}
