import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();

  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(params.id) as Record<string, string> | undefined;
  if (!persona) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items = db.prepare(
    'SELECT * FROM wardrobe_items WHERE persona_id = ? ORDER BY category, name'
  ).all(params.id) as Array<Record<string, unknown>>;

  const looks = db.prepare(
    'SELECT * FROM looks WHERE persona_id = ? ORDER BY occasion, name'
  ).all(params.id) as Array<Record<string, unknown>>;

  const itemsById = new Map(items.map(i => [i.id as string, i]));

  // Sheet 1: Looks
  const looksRows = looks.map(look => {
    const itemIds: string[] = JSON.parse(look.item_ids as string);
    const itemNames = itemIds
      .map(id => {
        const item = itemsById.get(id);
        return item ? (item.name as string) : null;
      })
      .filter(Boolean)
      .join('; ');

    return {
      Name: look.name,
      Occasion: look.occasion,
      Temperature: look.temperature,
      Status: (look.is_approved as number) === 1 ? 'Approved' : 'Pending',
      Items: itemNames,
      Description: look.description ?? '',
    };
  });

  // Sheet 2: Wardrobe Items
  const wardrobeRows = items.map(item => ({
    Name: item.name,
    Category: item.category,
    Subcategory: item.subcategory ?? '',
    Colors: item.colors ?? '',
    Status: (item.is_owned as number) === 1 ? 'Owned' : 'Wishlist',
    'Key Piece': (item.is_key_piece as number) === 1 ? 'Yes' : 'No',
    Notes: item.notes ?? '',
  }));

  const wb = XLSX.utils.book_new();

  const wsLooks = XLSX.utils.json_to_sheet(looksRows);
  // Column widths
  wsLooks['!cols'] = [
    { wch: 28 }, // Name
    { wch: 10 }, // Occasion
    { wch: 10 }, // Temperature
    { wch: 10 }, // Status
    { wch: 60 }, // Items
    { wch: 50 }, // Description
  ];
  XLSX.utils.book_append_sheet(wb, wsLooks, 'Looks');

  const wsWardrobe = XLSX.utils.json_to_sheet(wardrobeRows);
  wsWardrobe['!cols'] = [
    { wch: 40 }, // Name
    { wch: 12 }, // Category
    { wch: 14 }, // Subcategory
    { wch: 20 }, // Colors
    { wch: 10 }, // Status
    { wch: 10 }, // Key Piece
    { wch: 30 }, // Notes
  ];
  XLSX.utils.book_append_sheet(wb, wsWardrobe, 'Wardrobe');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawBuffer: any = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([rawBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = `${persona.name.replace(/\s+/g, '-').toLowerCase()}-wardrobe.xlsx`;

  return new NextResponse(blob, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
