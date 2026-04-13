'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Persona } from '@/lib/db';

const LEVEL_CONFIG = [
  { label: 'Just Starting', color: '#e8c5b8', bg: '#fdf0eb' },
  { label: 'Building Basics', color: '#c4b5a0', bg: '#f5efe8' },
  { label: 'Well Rounded', color: '#a8b5a0', bg: '#eef3ec' },
  { label: 'Sophisticated', color: '#9b8fb0', bg: '#f0edf6' },
  { label: 'Complete', color: '#c9967f', bg: '#fdeee8' },
];

const STYLE_EMOJI: Record<string, string> = {
  'minimalist': '🤍',
  'classic': '🎀',
  'casual': '☀️',
  'chic': '💫',
  'edgy': '⚡',
  'romantic': '🌸',
  'sporty': '⚡',
  'eclectic': '🎨',
  'professional': '💼',
  'bohemian': '🌿',
};

function getStyleEmoji(vibe: string) {
  const lower = vibe?.toLowerCase() || '';
  for (const [k, v] of Object.entries(STYLE_EMOJI)) {
    if (lower.includes(k)) return v;
  }
  return '✨';
}

export default function Home() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deletePersona = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm('Delete this persona? This cannot be undone.')) return;
    setDeletingId(id);
    await fetch(`/api/personas/${id}`, { method: 'DELETE' });
    setPersonas(p => p.filter(x => x.id !== id));
    setDeletingId(null);
  };

  useEffect(() => {
    fetch('/api/personas')
      .then(async r => {
        if (!r.ok) return [];
        try { return await r.json(); } catch { return []; }
      })
      .then(async (data: Persona[]) => {
        if (!Array.isArray(data)) { setLoading(false); return; }
        setPersonas(data);
        // Load item counts
        const counts: Record<string, number> = {};
        await Promise.all(data.map(async p => {
          try {
            const r = await fetch(`/api/personas/${p.id}/items`);
            const items = r.ok ? await r.json() : [];
            counts[p.id] = Array.isArray(items) ? items.filter((i: { is_owned: number }) => i.is_owned).length : 0;
          } catch { counts[p.id] = 0; }
        }));
        setItemCounts(counts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #faf6f2 0%, #f5ece4 50%, #eef3ec 100%)' }}>

      {/* Hero header */}
      <header className="px-8 pt-12 pb-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👗</span>
              <span className="font-display text-2xl font-semibold" style={{ color: '#2c2c2c' }}>Vestia</span>
            </div>
            <Link
              href="/persona/new"
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)' }}
            >
              <span>+</span> New Persona
            </Link>
          </div>

          <div className="mb-12">
            <h1 className="font-display text-5xl md:text-6xl font-semibold leading-tight mb-4" style={{ color: '#2c2c2c' }}>
              Your wardrobe,<br />
              <em className="gradient-text not-italic">perfectly curated.</em>
            </h1>
            <p className="text-lg max-w-lg" style={{ color: '#8a8078' }}>
              Build intentional wardrobes for every version of you — guided by AI, one perfect piece at a time.
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-8 pb-16">
        <div className="max-w-5xl mx-auto">

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#c9967f', borderTopColor: 'transparent' }} />
            </div>
          ) : personas.length === 0 ? (
            <div className="text-center py-20 fade-up">
              <div className="text-7xl mb-6">✨</div>
              <h2 className="font-display text-3xl font-semibold mb-3" style={{ color: '#2c2c2c' }}>Start your style journey</h2>
              <p className="mb-8 max-w-sm mx-auto text-base leading-relaxed" style={{ color: '#8a8078' }}>
                Create a persona and let your AI stylist guide you from a bare closet to a complete, cohesive wardrobe.
              </p>
              <Link
                href="/persona/new"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-medium text-base transition-all hover:scale-105 hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)' }}
              >
                Create Your First Persona →
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm font-medium" style={{ color: '#8a8078' }}>
                  {personas.length} {personas.length === 1 ? 'persona' : 'personas'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {personas.map((p, i) => {
                  const level = LEVEL_CONFIG[Math.min(p.wardrobe_level, 4)];
                  const emoji = getStyleEmoji(p.style_vibe);
                  const ownedCount = itemCounts[p.id] || 0;
                  return (
                    <div key={p.id} className="relative group fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
                      <Link href={`/persona/${p.id}`} className="block card-hover">
                        <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0e8e0', opacity: deletingId === p.id ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                          <div className="h-2" style={{ background: `linear-gradient(90deg, ${level.color}, #f0e8e0)` }} />
                          <div className="p-6">
                            <div className="flex items-start justify-between mb-5">
                              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: level.bg }}>
                                {emoji}
                              </div>
                              <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: level.bg, color: level.color }}>
                                {level.label}
                              </span>
                            </div>
                            <h3 className="font-display text-xl font-semibold mb-1" style={{ color: '#2c2c2c' }}>{p.name}</h3>
                            {p.style_vibe && (
                              <p className="text-sm mb-4 line-clamp-2" style={{ color: '#8a8078' }}>{p.style_vibe}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex gap-1 flex-wrap">
                                {p.occasions?.split(',').slice(0, 2).map(o => (
                                  <span key={o} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f5ece4', color: '#c9967f' }}>
                                    {o.trim()}
                                  </span>
                                ))}
                              </div>
                              <span className="text-xs font-medium" style={{ color: '#a8b5a0' }}>
                                {ownedCount} piece{ownedCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                      <button
                        onClick={e => deletePersona(e, p.id)}
                        disabled={deletingId === p.id}
                        className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                        style={{ background: 'white', color: '#c9a09c', border: '1px solid #f0e8e0', zIndex: 10 }}
                        title="Delete persona">
                        ×
                      </button>
                    </div>
                  );
                })}

                {/* New persona card */}
                <Link href="/persona/new" className="block card-hover" style={{ animationDelay: `${personas.length * 0.08}s` }}>
                  <div className="rounded-2xl h-full min-h-[200px] flex flex-col items-center justify-center gap-3 border-2 border-dashed transition-colors"
                    style={{ borderColor: '#e8d5cc', background: 'rgba(255,255,255,0.5)' }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                      style={{ background: '#f5ece4', color: '#c9967f' }}>
                      +
                    </div>
                    <p className="text-sm font-medium" style={{ color: '#c9967f' }}>New Persona</p>
                  </div>
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
