import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { anthropic } from '@/lib/claude';
import { v4 as uuidv4 } from 'uuid';
import { writeFile } from 'fs/promises';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';

async function generateItemSVG(name: string, colors: string, category: string, description: string): Promise<string | null> {
  const subject = [colors, name, description].filter(Boolean).join(', ');
  const prompt =
    `Draw a SIMPLE minimal SVG fashion illustration of: ${subject} (${category}).\n` +
    `Rules: viewBox="0 0 300 380", start with <rect width="300" height="380" fill="#FAF6F2"/>, ` +
    `use at most 15 path/shape elements, flat design with 2-3 colors, no gradients, no text, no fine details.\n` +
    `Return ONLY the complete SVG element, nothing else.`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const match = text.match(/<svg[\s\S]*?<\/svg>/);
  return match ? match[0] : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const items = db.prepare(
    'SELECT * FROM wardrobe_items WHERE persona_id = ? ORDER BY created_at ASC'
  ).all(params.id);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const body = await req.json();
  const {
    name, category, subcategory, colors, description,
    image_path, is_owned, is_key_piece, notes
  } = body;

  if (!name || !category) {
    return NextResponse.json({ error: 'Name and category are required' }, { status: 400 });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO wardrobe_items
      (id, persona_id, name, category, subcategory, colors, description, image_path, is_owned, is_key_piece, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, params.id, name, category,
    subcategory || '', colors || '', description || '',
    image_path || '', is_owned ? 1 : 0, is_key_piece ? 1 : 0, notes || ''
  );

  // Auto-generate SVG illustration in the background (don't block the response)
  if (!image_path) {
    generateItemSVG(name, colors || '', category, description || '')
      .then(async svg => {
        if (!svg) return;
        const filename = `${id}.svg`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await writeFile(path.join(uploadDir, filename), svg);
        db.prepare('UPDATE wardrobe_items SET image_path=? WHERE id=?').run(`/uploads/${filename}`, id);
      })
      .catch(() => {}); // silently fail — item still shows placeholder until image arrives
  }

  const item = db.prepare('SELECT * FROM wardrobe_items WHERE id = ?').get(id);
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    itemId, params.id
  );

  const item = db.prepare('SELECT * FROM wardrobe_items WHERE id = ?').get(itemId);
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
  db.prepare('DELETE FROM wardrobe_items WHERE id = ? AND persona_id = ?').run(itemId, params.id);
  return NextResponse.json({ success: true });
}
