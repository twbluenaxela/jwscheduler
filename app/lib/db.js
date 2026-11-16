import { PrismaClient } from '@prisma/client';
import { retryTransient, withDbParams } from './dbRetry.mjs';

const globalForPrisma = globalThis;

const databaseUrl = process.env.DATABASE_URL;
const db = globalForPrisma.prisma ?? (typeof databaseUrl === 'string' && databaseUrl.trim()
  ? new PrismaClient({ datasources: { db: { url: withDbParams(databaseUrl) } } })
  : new PrismaClient()).$extends({
  query: {
    $allOperations({ args, query }) {
      return retryTransient(() => query(args));
    },
  },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export default db;
