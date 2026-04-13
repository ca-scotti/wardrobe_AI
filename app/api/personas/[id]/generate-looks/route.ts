import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { anthropic } from '@/lib/claude';
import { v4 as uuidv4 } from 'uuid';
import type Anthropic from '@anthropic-ai/sdk';

function buildItemList(items: Array<Record<string, unknown>>) {
  return items.map(i =>
    `- ID="${i.id}" | ${i.name} (${i.category}${i.subcategory ? '/' + i.subcategory : ''}) | Colors: ${i.colors || 'unknown'}`
  ).join('\n');
}

type RawLook = { name: string; occasion: string; temperature: string; description: string; item_ids: string[] };

function parseAndValidateLooks(
  text: string,
  itemsById: Map<string, Record<string, unknown>>,
  validIdSet: Set<string>,
  requiredItemId?: string
): RawLook[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  const data = JSON.parse(jsonMatch[0]) as { looks: RawLook[] };

  return data.looks
    .map(look => ({
      ...look,
      temperature: look.temperature || 'all',
      item_ids: look.item_ids.filter(iid => validIdSet.has(iid)),
    }))
    .filter(look => {
      if (look.item_ids.length < 3) return false;
      if (requiredItemId && !look.item_ids.includes(requiredItemId)) return false;

      // Sanity check: must have a proper outfit structure
      const lookItems = look.item_ids
        .map(iid => itemsById.get(iid))
        .filter(Boolean) as Array<Record<string, unknown>>;

      const cat = (i: Record<string, unknown>) => String(i.category || '').toLowerCase();
      const hasDress   = lookItems.some(i => ['dress', 'dresses'].includes(cat(i)));
      const hasTop     = lookItems.some(i => ['top', 'tops'].includes(cat(i)));
      const hasBottom  = lookItems.some(i => ['bottom', 'bottoms'].includes(cat(i)));
      const hasShoes   = lookItems.some(i => ['shoe', 'shoes'].includes(cat(i)));

      if (!hasShoes) return false;                     // every outfit needs shoes
      if (!hasDress && !hasTop) return false;          // needs a top or a dress
      if (!hasDress && !hasBottom) return false;       // needs a bottom unless it's a dress

      return true;
    });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json().catch(() => ({})) as { newItemId?: string };
  const { newItemId } = body;

  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(id) as Record<string, string> | undefined;
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 });

  const items = db.prepare(
    'SELECT * FROM wardrobe_items WHERE persona_id = ? AND is_owned = 1 ORDER BY category'
  ).all(id) as Array<Record<string, unknown>>;

  if (items.length < 3) {
    return NextResponse.json({ error: 'Need at least 3 owned items to generate looks' }, { status: 400 });
  }

  const validIdSet = new Set(items.map(i => i.id as string));
  const itemsById = new Map(items.map(i => [i.id as string, i]));

  const lookRules = `RULES:
1. Use ONLY the exact IDs listed — copy character-for-character. Never invent IDs.
2. Each look must have at least 3 items.
3. REQUIRED outfit structure — every look MUST pass ALL of these checks:
   a) Must include shoes (category: shoes/shoe)
   b) Must include a top (category: tops/top) OR a dress (category: dresses/dress)
   c) If there is NO dress, must include a bottom (category: bottoms/bottom)
   Looks missing any of these will be discarded — do not generate incomplete outfits.
4. Accessories and bags are optional extras.
5. For each look assign a temperature: "warm" (hot weather, summer), "cool" (spring/fall/mild), "cold" (winter, heavy layers), or "layered" (transitional, works across seasons).`;

  // ── INCREMENTAL: generate looks including the new item ──────────────────────
  if (newItemId) {
    const newItem = items.find(i => i.id === newItemId);
    if (!newItem) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const otherItems = items.filter(i => i.id !== newItemId);

    const prompt = `You are a stylist. A new item was just added. Generate complete outfit looks that feature it.

Wardrobe owner: ${persona.name} (style: ${persona.style_vibe}, occasions: ${persona.occasions})

NEW ITEM (must appear in every look):
- ID="${newItem.id}" | ${newItem.name} (${newItem.category}${newItem.subcategory ? '/' + newItem.subcategory : ''}) | Colors: ${newItem.colors || 'unknown'}

OTHER OWNED ITEMS:
${buildItemList(otherItems)}

${lookRules}

Return ONLY valid JSON:
{
  "looks": [
    {
      "name": "Look name",
      "occasion": "casual|work|evening|weekend|formal",
      "temperature": "warm|cool|cold|layered",
      "description": "Short styling note",
      "item_ids": ["${newItem.id}", "exact-id", "exact-id"]
    }
  ]
}

Valid IDs: ${[...validIdSet].join(', ')}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const newLooks = parseAndValidateLooks(text, itemsById, validIdSet, newItemId);

      for (const look of newLooks) {
        const id = uuidv4();
        db.prepare(`
          INSERT INTO looks (id, persona_id, name, description, occasion, temperature, item_ids, is_approved)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(id, id, look.name, look.description, look.occasion, look.temperature, JSON.stringify(look.item_ids));
      }

      const allLooks = db.prepare('SELECT * FROM looks WHERE persona_id = ? ORDER BY created_at DESC').all(id);
      return NextResponse.json({ looks: allLooks });
    } catch (error) {
      console.error('Incremental look generation error:', error);
      return NextResponse.json({ error: 'Failed to generate looks' }, { status: 500 });
    }
  }

  // ── FULL REGENERATION ────────────────────────────────────────────────────────
  const prompt = `You are a stylist creating outfits from an existing wardrobe. Only use listed items.

Wardrobe owner: ${persona.name} (style: ${persona.style_vibe}, occasions: ${persona.occasions})

OWNED ITEMS (${items.length} total):
${buildItemList(items)}

${lookRules}
6. Be exhaustive — generate every complete, distinct outfit the wardrobe can support.

Return ONLY valid JSON:
{
  "looks": [
    {
      "name": "Look name",
      "occasion": "casual|work|evening|weekend|formal",
      "temperature": "warm|cool|cold|layered",
      "description": "Short styling note",
      "item_ids": ["exact-id", "exact-id", "exact-id"]
    }
  ]
}

Valid IDs: ${[...validIdSet].join(', ')}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const looks = parseAndValidateLooks(text, itemsById, validIdSet);

    // Only delete pending looks on full regen — keep what the user already approved
    db.prepare('DELETE FROM looks WHERE persona_id = ? AND is_approved = 0').run(id);

    for (const look of looks) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO looks (id, persona_id, name, description, occasion, temperature, item_ids, is_approved)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, id, look.name, look.description, look.occasion, look.temperature, JSON.stringify(look.item_ids));
    }

    const allLooks = db.prepare('SELECT * FROM looks WHERE persona_id = ? ORDER BY created_at DESC').all(id);
    return NextResponse.json({ looks: allLooks });
  } catch (error) {
    console.error('Look generation error:', error);
    return NextResponse.json({ error: 'Failed to generate looks' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const looks = db.prepare('SELECT * FROM looks WHERE persona_id = ? ORDER BY created_at DESC').all(id);
  return NextResponse.json(looks);
}
