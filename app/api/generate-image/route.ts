import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { anthropic } from '@/lib/claude';
import type Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const { name, colors, category, description } = await req.json();

  const subject = [colors, name, description].filter(Boolean).join(', ');
  const prompt =
    `Draw a SIMPLE minimal SVG fashion illustration of: ${subject} (${category}).\n` +
    `Rules: viewBox="0 0 300 380", start with <rect width="300" height="380" fill="#FAF6F2"/>, ` +
    `use at most 15 path/shape elements, flat design with 2-3 colors, no gradients, no text, no fine details.\n` +
    `Return ONLY the complete SVG element, nothing else.`;

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

    const match = text.match(/<svg[\s\S]*?<\/svg>/);
    if (!match) throw new Error('No SVG in response');

    const filename = `${uuidv4()}.svg`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await writeFile(path.join(uploadDir, filename), match[0]);

    return NextResponse.json({ path: `/uploads/${filename}` });
  } catch {
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }
}
