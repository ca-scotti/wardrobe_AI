import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch image');

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const filename = `${uuidv4()}.${ext}`;
    const buffer = Buffer.from(await res.arrayBuffer());

    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    writeFileSync(join(uploadsDir, filename), buffer);

    return NextResponse.json({ path: `/uploads/${filename}` });
  } catch {
    return NextResponse.json({ error: 'Could not save image' }, { status: 500 });
  }
}
