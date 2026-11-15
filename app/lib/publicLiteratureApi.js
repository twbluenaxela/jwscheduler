import { NextResponse } from 'next/server';
import db from './db';

export const publicHeaders = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
export function publicJson(data, status = 200) {
  return NextResponse.json(data, { status, headers: publicHeaders });
}
export async function publicCongregation(context) {
  const { token } = await context.params;
  return token ? db.congregation.findUnique({ where: { literatureFormToken: token } }) : null;
}
export const disabled = () => publicJson({ error: '這個連結已停用' }, 404);
