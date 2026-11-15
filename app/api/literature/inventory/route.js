export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail, mapped } from '../../../lib/literatureApi';
import { countData, validateMonth } from '../../../lib/inventoryServer';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const counts = await db.inventoryCount.findMany({ where: { congregationId }, orderBy: { month: 'desc' }, include: { lines: true } });
    return NextResponse.json(mapped({ counts: counts.map(({ lines, ...count }) => ({
      ...count, counted: lines.filter((line) => line.onHand !== null).length, total: lines.length,
    })) }));
  } catch (error) { return fail(error); }
}
export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const month = validateMonth((await request.json()).month);
    const { lines } = await countData(congregationId, month);
    const count = await db.inventoryCount.create({ data: { congregationId, month, lines: { create: lines } }, include: { lines: true } });
    return NextResponse.json(mapped({ count, lines: count.lines }));
  } catch (error) { return fail(error); }
}
