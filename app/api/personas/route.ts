import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const db = getDb();
  const personas = db.prepare('SELECT * FROM personas ORDER BY created_at DESC').all();
  return NextResponse.json(personas);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const { name, style_vibe, occasions, color_palette, budget, body_notes } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO personas (id, name, style_vibe, occasions, color_palette, budget, body_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, style_vibe || '', occasions || '', color_palette || '', budget || '', body_notes || '');

  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
  return NextResponse.json(persona);
}
