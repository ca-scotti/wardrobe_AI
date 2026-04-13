import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const items = db.prepare(
    'SELECT * FROM wardrobe_items WHERE persona_id = ? ORDER BY created_at ASC'
  ).all(id);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const {
    name, category, subcategory, colors, description,
    image_path, is_owned, is_key_piece, notes
  } = body;

  if (!name || !category) {
    return NextResponse.json({ error: 'Name and category are required' }, { status: 400 });
  }

  const itemId = uuidv4();
  db.prepare(`
    INSERT INTO wardrobe_items
      (id, persona_id, name, category, subcategory, colors, description, image_path, is_owned, is_key_piece, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId, id, name, category,
    subcategory || '', colors || '', description || '',
    image_path || '', is_owned ? 1 : 0, is_key_piece ? 1 : 0, notes || ''
  );


  const item = db.prepare('SELECT * FROM wardrobe_items WHERE id = ?').get(itemId);
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const { itemId, is_owned, name, colors, description, notes, image_path } = body;

  db.prepare(`
    UPDATE wardrobe_items SET
      is_owned = COALESCE(?, is_owned),
      name = COALESCE(?, name),
      colors = COALESCE(?, colors),
      description = COALESCE(?, description),
      notes = COALESCE(?, notes),
      image_path = COALESCE(?, image_path)
    WHERE id = ? AND persona_id = ?
  `).run(
    is_owned !== undefined ? (is_owned ? 1 : 0) : null,
    name || null, colors || null, description || null, notes || null, image_path || null,
    itemId, id
  );

  const item = db.prepare('SELECT * FROM wardrobe_items WHERE id = ?').get(itemId);
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  db.prepare('DELETE FROM wardrobe_items WHERE id = ? AND persona_id = ?').run(itemId, id);
  return NextResponse.json({ success: true });
}
