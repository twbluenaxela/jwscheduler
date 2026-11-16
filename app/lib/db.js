import { PrismaClient } from '@prisma/client';
import { retryTransient, withDbParams } from './dbRetry.mjs';

const globalForPrisma = globalThis;

const db = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: withDbParams(process.env.DATABASE_URL) } },
}).$extends({
  query: {
    $allOperations({ args, query }) {
      return retryTransient(() => query(args));
    },
  },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export default db;
