import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// PATCH /api/personas/[id]/looks  { lookId, is_approved: 1 }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const { lookId, is_approved } = await req.json();
  if (!lookId) return NextResponse.json({ error: 'lookId required' }, { status: 400 });

  db.prepare('UPDATE looks SET is_approved = ? WHERE id = ? AND persona_id = ?')
    .run(is_approved, lookId, id);

  return NextResponse.json({ success: true });
}

// DELETE /api/personas/[id]/looks?lookId=xxx
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const lookId = new URL(req.url).searchParams.get('lookId');
  if (!lookId) return NextResponse.json({ error: 'lookId required' }, { status: 400 });

  db.prepare('DELETE FROM looks WHERE id = ? AND persona_id = ?').run(lookId, id);
  return NextResponse.json({ success: true });
}
