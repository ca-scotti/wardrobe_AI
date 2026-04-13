import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { anthropic, WARDROBE_SYSTEM_PROMPT } from '@/lib/claude';
import { v4 as uuidv4 } from 'uuid';
import type Anthropic from '@anthropic-ai/sdk';
import type { Database } from 'better-sqlite3';

// ── Tool definitions ─────────────────────────────────────────────────────────

const LOOK_TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_item',
    description: 'Add a clothing or accessory item to the wardrobe. Use this whenever the user confirms they own an item or wants to add one. Returns the new item ID which can immediately be used in add_look.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Descriptive name, e.g. "white linen t-shirt"' },
        category: {
          type: 'string',
          enum: ['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'bags', 'accessories', 'jewelry'],
        },
        subcategory: { type: 'string', description: 'Optional subcategory, e.g. "ankle boots", "blazer"' },
        colors: { type: 'string', description: 'Color(s), e.g. "white" or "navy, white stripe"' },
        description: { type: 'string', description: 'Brief style note' },
        is_owned: { type: 'boolean', description: 'true if the user already owns it, false for wishlist' },
      },
      required: ['name', 'category', 'is_owned'],
    },
  },
  {
    name: 'edit_item',
    description: 'Update details of an existing wardrobe item. Use item IDs from the wardrobe context.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID of the item to edit' },
        name: { type: 'string', description: 'New name (optional)' },
        colors: { type: 'string', description: 'New color(s) (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        notes: { type: 'string', description: 'New notes (optional)' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'delete_item',
    description: 'Remove an item from the wardrobe. Use item IDs from the wardrobe context.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID of the item to delete' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'get_looks',
    description: 'Get all looks for this wardrobe with full item details. Use this to list, review, or audit looks before making changes.',
    input_schema: {
      type: 'object',
      properties: {
        occasion: {
          type: 'string',
          enum: ['all', 'casual', 'work', 'evening', 'weekend', 'formal'],
          description: 'Filter by occasion. Omit or use "all" for no filter.',
        },
      },
      required: [],
    },
  },
  {
    name: 'add_look',
    description: 'Add a new outfit look to the wardrobe database. Must include valid item IDs from the wardrobe (use the IDs listed in the wardrobe context). The look must have shoes, a top or dress, and a bottom (unless wearing a dress).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Descriptive name for the look' },
        occasion: { type: 'string', enum: ['casual', 'work', 'evening', 'weekend', 'formal'] },
        temperature: { type: 'string', enum: ['warm', 'cool', 'cold', 'layered'] },
        description: { type: 'string', description: 'Short styling note for this look' },
        item_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of exact item IDs from the wardrobe (minimum 3)',
        },
      },
      required: ['name', 'occasion', 'temperature', 'description', 'item_ids'],
    },
  },
  {
    name: 'delete_look',
    description: 'Delete a look from the database. Use get_looks first to find the look ID.',
    input_schema: {
      type: 'object',
      properties: {
        look_id: { type: 'string', description: 'The ID of the look to delete' },
      },
      required: ['look_id'],
    },
  },
  {
    name: 'find_duplicate_looks',
    description: 'Find groups of looks that use the exact same item combination. Returns each duplicate group with look IDs and names so you can decide which to delete.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Tool execution ───────────────────────────────────────────────────────────

function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  db: Database,
  personaId: string,
  items: Array<Record<string, unknown>>,
): unknown {
  const itemsById = new Map(items.map(i => [i.id as string, i]));
  const validIdSet = new Set(items.map(i => i.id as string));

  switch (toolName) {
    case 'add_item': {
      const { name, category, subcategory, colors, description, is_owned } = toolInput as {
        name: string; category: string; subcategory?: string;
        colors?: string; description?: string; is_owned: boolean;
      };
      const itemId = uuidv4();
      db.prepare(`
        INSERT INTO wardrobe_items
          (id, persona_id, name, category, subcategory, colors, description, image_path, is_owned, is_key_piece, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, personaId, name, category, subcategory || '', colors || '', description || '', '', is_owned ? 1 : 0, 0, '');
      return { success: true, item_id: itemId, message: `Added "${name}" to the wardrobe.` };
    }

    case 'edit_item': {
      const { item_id, name, colors, description, notes } = toolInput as {
        item_id: string; name?: string; colors?: string; description?: string; notes?: string;
      };
      const item = db.prepare('SELECT * FROM wardrobe_items WHERE id = ? AND persona_id = ?').get(item_id, personaId) as Record<string, unknown> | undefined;
      if (!item) return { error: `Item with ID "${item_id}" not found.` };
      db.prepare(`
        UPDATE wardrobe_items SET
          name = COALESCE(?, name),
          colors = COALESCE(?, colors),
          description = COALESCE(?, description),
          notes = COALESCE(?, notes)
        WHERE id = ? AND persona_id = ?
      `).run(name || null, colors || null, description || null, notes || null, item_id, personaId);
      return { success: true, message: `Updated "${name || item.name}".` };
    }

    case 'delete_item': {
      const { item_id } = toolInput as { item_id: string };
      const item = db.prepare('SELECT * FROM wardrobe_items WHERE id = ? AND persona_id = ?').get(item_id, personaId) as Record<string, unknown> | undefined;
      if (!item) return { error: `Item with ID "${item_id}" not found.` };
      db.prepare('DELETE FROM wardrobe_items WHERE id = ? AND persona_id = ?').run(item_id, personaId);
      return { success: true, message: `Deleted "${item.name}" from the wardrobe.` };
    }

    case 'get_looks': {
      const occasion = toolInput.occasion as string | undefined;
      const looksRaw = (occasion && occasion !== 'all')
        ? db.prepare('SELECT * FROM looks WHERE persona_id = ? AND occasion = ? ORDER BY name').all(personaId, occasion)
        : db.prepare('SELECT * FROM looks WHERE persona_id = ? ORDER BY occasion, name').all(personaId);

      return (looksRaw as Array<Record<string, unknown>>).map(look => {
        const itemIds: string[] = JSON.parse(look.item_ids as string);
        const itemNames = itemIds.map(id => {
          const item = itemsById.get(id);
          return item ? `${item.name} (${item.category})` : `[unknown ID: ${id}]`;
        });
        return {
          id: look.id,
          name: look.name,
          occasion: look.occasion,
          temperature: look.temperature,
          status: (look.is_approved as number) === 1 ? 'approved' : 'pending',
          description: look.description,
          item_ids: itemIds,
          items: itemNames,
        };
      });
    }

    case 'add_look': {
      const { name, occasion, temperature, description, item_ids } = toolInput as {
        name: string; occasion: string; temperature: string; description: string; item_ids: string[];
      };

      const invalidIds = item_ids.filter(id => !validIdSet.has(id));
      if (invalidIds.length > 0) {
        return { error: `Invalid item IDs: ${invalidIds.join(', ')}. Only IDs from the wardrobe context are valid.` };
      }
      if (item_ids.length < 3) {
        return { error: 'A look must include at least 3 items.' };
      }

      const lookItems = item_ids.map(id => itemsById.get(id)).filter(Boolean) as Array<Record<string, unknown>>;
      const cat = (i: Record<string, unknown>) => String(i.category || '').toLowerCase();
      const hasDress  = lookItems.some(i => ['dress', 'dresses'].includes(cat(i)));
      const hasTop    = lookItems.some(i => ['top', 'tops'].includes(cat(i)));
      const hasBottom = lookItems.some(i => ['bottom', 'bottoms'].includes(cat(i)));
      const hasShoes  = lookItems.some(i => ['shoe', 'shoes'].includes(cat(i)));

      if (!hasShoes)              return { error: 'Look must include shoes.' };
      if (!hasDress && !hasTop)   return { error: 'Look must include a top or dress.' };
      if (!hasDress && !hasBottom) return { error: 'Look must include a bottom (unless wearing a dress).' };

      // Duplicate check
      const existing = db.prepare('SELECT * FROM looks WHERE persona_id = ?').all(personaId) as Array<Record<string, unknown>>;
      const newSet = new Set(item_ids);
      for (const ex of existing) {
        const exIds: string[] = JSON.parse(ex.item_ids as string);
        if (exIds.length === item_ids.length && exIds.every(id => newSet.has(id))) {
          return { error: `This exact item combination already exists as "${ex.name}".` };
        }
      }

      const id = uuidv4();
      db.prepare(
        'INSERT INTO looks (id, persona_id, name, description, occasion, temperature, item_ids, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
      ).run(id, personaId, name, description, occasion, temperature, JSON.stringify(item_ids));

      return { success: true, look_id: id, message: `Added look "${name}" (pending review in the Looks tab).` };
    }

    case 'delete_look': {
      const { look_id } = toolInput as { look_id: string };
      const look = db.prepare('SELECT * FROM looks WHERE id = ? AND persona_id = ?').get(look_id, personaId) as Record<string, unknown> | undefined;
      if (!look) return { error: `Look with ID "${look_id}" not found.` };

      db.prepare('DELETE FROM looks WHERE id = ? AND persona_id = ?').run(look_id, personaId);
      return { success: true, message: `Deleted look "${look.name}".` };
    }

    case 'find_duplicate_looks': {
      const allLooks = db.prepare('SELECT * FROM looks WHERE persona_id = ?').all(personaId) as Array<Record<string, unknown>>;
      const groups = new Map<string, Array<Record<string, unknown>>>();

      for (const look of allLooks) {
        const ids: string[] = JSON.parse(look.item_ids as string);
        const key = [...ids].sort().join(',');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(look);
      }

      const duplicates = [...groups.values()]
        .filter(g => g.length > 1)
        .map(group => {
          const ids: string[] = JSON.parse(group[0].item_ids as string);
          return {
            shared_items: ids.map(id => {
              const item = itemsById.get(id);
              return item ? (item.name as string) : id;
            }),
            looks: group.map(l => ({
              id: l.id,
              name: l.name,
              occasion: l.occasion,
              temperature: l.temperature,
              status: (l.is_approved as number) === 1 ? 'approved' : 'pending',
            })),
          };
        });

      return {
        duplicate_groups: duplicates,
        total_redundant_looks: duplicates.reduce((sum, g) => sum + g.looks.length - 1, 0),
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const conv = db.prepare(
    'SELECT * FROM build_conversations WHERE persona_id = ?'
  ).get(id) as { messages: string } | undefined;
  return NextResponse.json({ messages: conv ? JSON.parse(conv.messages) : [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const { userMessage, imageBase64, mimeType } = body;

  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(id) as Record<string, string> | undefined;
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 });

  const items = db.prepare(
    'SELECT * FROM wardrobe_items WHERE persona_id = ? ORDER BY created_at ASC'
  ).all(id) as Array<Record<string, unknown>>;

  const convRecord = db.prepare(
    'SELECT * FROM build_conversations WHERE persona_id = ?'
  ).get(id) as { messages: string } | undefined;
  const storedMessages: Array<{ role: string; content: unknown }> = convRecord
    ? JSON.parse(convRecord.messages)
    : [];

  // Build wardrobe context (includes IDs so Claude can use the look tools)
  const ownedItems  = items.filter(i => i.is_owned);
  const wishlistItems = items.filter(i => !i.is_owned);
  const wardrobeContext = `
PERSONA PROFILE:
- Name: ${persona.name}
- Style vibe: ${persona.style_vibe || 'not specified'}
- Occasions: ${persona.occasions || 'not specified'}
- Color palette: ${persona.color_palette || 'not specified'}
- Body notes: ${persona.body_notes || 'none'}

CURRENT WARDROBE (${ownedItems.length} owned items):
${ownedItems.length === 0
    ? 'Empty wardrobe — starting from scratch!'
    : ownedItems.map(i => `- ID="${i.id}" | ${i.name} (${i.category}${i.subcategory ? '/' + i.subcategory : ''}) | ${i.colors || 'color unknown'}`).join('\n')}

WISHLIST (${wishlistItems.length} items):
${wishlistItems.length === 0 ? 'None' : wishlistItems.map(i => `- ${i.name} (${i.category})`).join('\n')}
`;

  // Build user message content
  let userContent: unknown;
  if (imageBase64 && mimeType) {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
      { type: 'text', text: userMessage || 'Here is my item, can you add it to my wardrobe?' },
    ];
  } else {
    userContent = userMessage;
  }

  const systemWithContext = WARDROBE_SYSTEM_PROMPT + '\n\n' + wardrobeContext;

  // Build API messages (text-only history + new user message)
  let apiMessages: Anthropic.MessageParam[] = [
    ...(storedMessages as Anthropic.MessageParam[]),
    { role: 'user', content: userContent as Anthropic.MessageParam['content'] },
  ];

  let assistantText = '';
  let looksChanged = false;

  try {
    // Agentic loop — runs until Claude produces a text response (no more tool calls)
    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: systemWithContext,
        messages: apiMessages,
        tools: LOOK_TOOLS,
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(toolUse => {
          if (['add_look', 'delete_look'].includes(toolUse.name)) looksChanged = true;

          const result = executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            db,
            id,
            ownedItems,
          );

          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        });

        // Append assistant's tool-use turn and the tool results
        apiMessages = [
          ...apiMessages,
          { role: 'assistant' as const, content: response.content },
          { role: 'user' as const, content: toolResults },
        ];
      } else {
        // Final text response — exit loop
        assistantText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');
        break;
      }
    }

    // Parse JSON recommendation if present
    let parsed: Record<string, unknown> | null = null;
    try {
      const jsonMatch = assistantText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* plain text response */ }

    // Store only human-readable text messages (strip tool use internals)
    const updatedMessages = [
      ...storedMessages,
      { role: 'user', content: typeof userContent === 'string' ? userContent : '[image + message]' },
      { role: 'assistant', content: assistantText },
    ];

    if (convRecord) {
      db.prepare(
        'UPDATE build_conversations SET messages = ?, updated_at = CURRENT_TIMESTAMP WHERE persona_id = ?'
      ).run(JSON.stringify(updatedMessages), id);
    } else {
      db.prepare(
        'INSERT INTO build_conversations (id, persona_id, messages) VALUES (?, ?, ?)'
      ).run(uuidv4(), id, JSON.stringify(updatedMessages));
    }

    return NextResponse.json({
      message: parsed?.message || assistantText,
      parsed,
      raw: assistantText,
      looks_changed: looksChanged,
    });
  } catch (error) {
    console.error('Claude API error:', error);
    return NextResponse.json({ error: 'AI service error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM build_conversations WHERE persona_id = ?').run(id);
  return NextResponse.json({ success: true });
}
