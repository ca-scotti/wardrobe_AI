import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(params.id);
  if (!persona) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(persona);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const body = await req.json();
  const { name, style_vibe, occasions, color_palette, budget, body_notes, wardrobe_level } = body;

  db.prepare(`
    UPDATE personas SET
      name = COALESCE(?, name),
      style_vibe = COALESCE(?, style_vibe),
      occasions = COALESCE(?, occasions),
      color_palette = COALESCE(?, color_palette),
      budget = COALESCE(?, budget),
      body_notes = COALESCE(?, body_notes),
      wardrobe_level = COALESCE(?, wardrobe_level)
    WHERE id = ?
  `).run(name, style_vibe, occasions, color_palette, budget, body_notes, wardrobe_level, params.id);

  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(params.id);
  return NextResponse.json(persona);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  db.prepare('DELETE FROM personas WHERE id = ?').run(params.id);
  return NextResponse.json({ success: true });
}
