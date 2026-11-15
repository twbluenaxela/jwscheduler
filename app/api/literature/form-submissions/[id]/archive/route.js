import { setFormArchived } from '../../../../../lib/literatureFormArchive';
export const dynamic = 'force-dynamic';
export async function POST(request, context) { return setFormArchived(request, context, true); }
