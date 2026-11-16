import { isTransientDbError } from './dbRetry.mjs';

export function dbErrorResponse(error, status = 500) {
  if (isTransientDbError(error)) {
    return Response.json({ error: '伺服器剛啟動，正在連線資料庫，請稍候再試。' }, { status: 503 });
  }
  if (/^PrismaClient.*Error$/.test(error?.name || '') || /^P\d{4}$/.test(error?.code || '')) {
    console.error(error);
    return Response.json({ error: '資料庫暫時出錯，請再試一次。' }, { status: 500 });
  }
  return Response.json({ error: error?.message || '發生錯誤，請再試一次。' }, { status });
}
