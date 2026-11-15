import { createHash } from 'node:crypto';
import db from './db';
import { canLiterature } from './roles.mjs';

export function hashMcpToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function resolveMcpUser(token) {
  if (typeof token !== 'string' || !/^jwl_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const record = await db.mcpToken.findUnique({ where: { tokenHash: hashMcpToken(token) }, include: { user: true } });
  if (!record || record.revokedAt || !record.user.congregationId || !canLiterature(record.user)) return null;
  const cutoff = new Date(Date.now() - 600000);
  await db.mcpToken.updateMany({
    where: { id: record.id, revokedAt: null, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] },
    data: { lastUsedAt: new Date() },
  });
  return record.user;
}
