import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) return NextResponse.json({ images: [] });

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ images: [] });
  }

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=4&orientation=portrait&client_id=${accessKey}`;
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ images: [] });

    const data = await res.json();
    const images = (data.results || []).map((photo: {
      urls: { regular: string; thumb: string };
      alt_description: string;
      user: { name: string };
      links: { html: string };
    }) => ({
      url: photo.urls.regular,
      thumb: photo.urls.thumb,
      alt: photo.alt_description || query,
      credit: photo.user.name,
      link: photo.links.html,
    }));

    return NextResponse.json({ images });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
