'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STYLE_OPTIONS = [
  { label: 'Minimalist & Clean', emoji: '🤍', desc: 'Less is more' },
  { label: 'Classic & Timeless', emoji: '🎀', desc: 'Always elegant' },
  { label: 'Casual & Effortless', emoji: '☀️', desc: 'Relaxed & easy' },
  { label: 'Chic & Sophisticated', emoji: '💫', desc: 'Elevated everyday' },
  { label: 'Edgy & Bold', emoji: '⚡', desc: 'Make a statement' },
  { label: 'Romantic & Feminine', emoji: '🌸', desc: 'Soft & dreamy' },
  { label: 'Sporty & Active', emoji: '🏃‍♀️', desc: 'On-the-move' },
  { label: 'Eclectic & Creative', emoji: '🎨', desc: 'Mix & match' },
  { label: 'Professional & Polished', emoji: '💼', desc: 'Power dressing' },
  { label: 'Bohemian & Free', emoji: '🌿', desc: 'Flowy & earthy' },
];

const OCCASION_OPTIONS = [
  { label: 'Work / Office', emoji: '💼' },
  { label: 'Casual / Everyday', emoji: '🛍️' },
  { label: 'Evenings Out', emoji: '🍷' },
  { label: 'Formal Events', emoji: '✨' },
  { label: 'Gym / Active', emoji: '🏋️' },
  { label: 'Weekend / Brunch', emoji: '🥂' },
  { label: 'Travel', emoji: '✈️' },
  { label: 'Dates', emoji: '🌹' },
  { label: 'Work from Home', emoji: '🏠' },
];

const PALETTE_OPTIONS = [
  { label: 'Neutrals', desc: 'Black, white, beige, grey', swatch: ['#2c2c2c', '#f5f0eb', '#c4b5a0', '#8a8078'] },
  { label: 'Earth Tones', desc: 'Brown, terracotta, olive', swatch: ['#8b5e3c', '#c9835a', '#6b7c4d', '#d4a76a'] },
  { label: 'Cool & Minimal', desc: 'Navy, grey, white, black', swatch: ['#1a2744', '#6b7c9a', '#c0c8d8', '#f5f5f5'] },
  { label: 'Warm & Cozy', desc: 'Camel, cream, rust, blush', swatch: ['#c9967f', '#e8c5b8', '#d4a76a', '#f5ece4'] },
  { label: 'Bold & Colorful', desc: 'Rich, saturated hues', swatch: ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a'] },
  { label: 'Pastels', desc: 'Soft, light tones', swatch: ['#ffc8dd', '#bde0fe', '#caffbf', '#fdffb6'] },
  { label: 'Monochromatic', desc: 'One color, many shades', swatch: ['#1a1a2e', '#16213e', '#0f3460', '#533483'] },
  { label: 'Dark & Moody', desc: 'Deep, rich, dramatic', swatch: ['#0d0d0d', '#1a0a0a', '#2d1b1b', '#3d2b3d'] },
];

const STEPS = [
  { title: "What's your persona's name?", hint: "Give this style journey a name — it could be you, a version of you, or a whole new character." },
  { title: "What's the vibe?", hint: "Pick as many as you like — your wardrobe can cover all of them." },
  { title: "What occasions does she dress for?", hint: "Pick as many as you like — this builds a truly functional wardrobe." },
  { title: "Choose a color palette", hint: "A cohesive palette is the secret to a wardrobe that always works." },
  { title: "Any fit or body notes?", hint: "Completely optional — skip this if you prefer. It only helps us tailor silhouette suggestions to your shape." },
];

export default function NewPersonaPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', style_vibes: [] as string[], occasions: [] as string[],
    color_palettes: [] as string[], body_notes: '',
  });

  const toggleVibe = (v: string) => setForm(f => ({
    ...f,
    style_vibes: f.style_vibes.includes(v) ? f.style_vibes.filter(x => x !== v) : [...f.style_vibes, v],
  }));

  const toggleOccasion = (o: string) => setForm(f => ({
    ...f,
    occasions: f.occasions.includes(o) ? f.occasions.filter(x => x !== o) : [...f.occasions, o],
  }));

  const togglePalette = (p: string) => setForm(f => ({
    ...f,
    color_palettes: f.color_palettes.includes(p) ? f.color_palettes.filter(x => x !== p) : [...f.color_palettes, p],
  }));

  const canNext = () => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1) return form.style_vibes.length > 0;
    if (step === 2) return form.occasions.length > 0;
    if (step === 3) return form.color_palettes.length > 0;
    return true;
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          style_vibe: form.style_vibes.join(', '),
          occasions: form.occasions.join(', '),
          color_palette: form.color_palettes.join(', '),
          body_notes: form.body_notes,
        }),
      });
      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      const p = await res.json();
      router.push(`/persona/${p.id}`);
    } catch {
      setError('Could not reach the server. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(160deg, #faf6f2 0%, #f5ece4 60%, #eef3ec 100%)' }}>

      {/* Left panel – decorative */}
      <div className="hidden lg:flex w-80 flex-col items-center justify-center p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #c9967f22 0%, #a8b5a022 100%)', borderRight: '1px solid #f0e8e0' }}>
        <div className="absolute inset-0 opacity-10">
          {['👗','👟','👜','💍','🧥','👒','🕶️','💄'].map((e, i) => (
            <span key={i} className="absolute text-4xl" style={{
              top: `${10 + i * 11}%`,
              left: `${20 + (i % 3) * 25}%`,
              transform: `rotate(${-15 + i * 7}deg)`,
              opacity: 0.6,
            }}>{e}</span>
          ))}
        </div>
        <div className="relative text-center">
          <div className="text-5xl mb-4">👗</div>
          <p className="font-display text-xl font-semibold mb-2" style={{ color: '#2c2c2c' }}>Vestia</p>
          <p className="text-sm leading-relaxed" style={{ color: '#8a8078' }}>
            Your personal AI stylist building a wardrobe from scratch — piece by piece.
          </p>
        </div>
      </div>

      {/* Right panel – form */}
      <div className="flex-1 flex flex-col">

        {/* Top bar */}
        <div className="flex items-center justify-between px-8 py-5" style={{ borderBottom: '1px solid #f0e8e0' }}>
          <Link href="/" className="text-sm flex items-center gap-1.5 hover:opacity-70 transition-opacity" style={{ color: '#8a8078' }}>
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            {STEPS.map((_, i) => (
              <div key={i} className="rounded-full transition-all duration-500" style={{
                width: i === step ? 24 : 8,
                height: 8,
                background: i < step ? '#a8b5a0' : i === step ? '#c9967f' : '#e8d5cc',
              }} />
            ))}
          </div>
          <span className="text-sm" style={{ color: '#8a8078' }}>{step + 1} / {STEPS.length}</span>
        </div>

        {/* Form content */}
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-2xl fade-up" key={step}>

            <p className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: '#c9967f' }}>
              Step {step + 1}
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold mb-2" style={{ color: '#2c2c2c' }}>
              {STEPS[step].title}
            </h2>
            <p className="text-sm mb-8" style={{ color: '#8a8078' }}>{STEPS[step].hint}</p>

            {/* Step 0: Name */}
            {step === 0 && (
              <div>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Work Me, Weekend Camila, Evening Glam..."
                  className="w-full text-2xl font-light outline-none bg-transparent pb-3"
                  style={{ borderBottom: '2px solid #e8d5cc', color: '#2c2c2c' }}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && canNext() && setStep(1)}
                  onFocus={e => (e.target.style.borderBottomColor = '#c9967f')}
                  onBlur={e => (e.target.style.borderBottomColor = '#e8d5cc')}
                />
              </div>
            )}

            {/* Step 1: Vibe */}
            {step === 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {STYLE_OPTIONS.map(o => {
                  const selected = form.style_vibes.includes(o.label);
                  return (
                    <button key={o.label} onClick={() => toggleVibe(o.label)}
                      className="flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 text-center transition-all relative"
                      style={{
                        borderColor: selected ? '#c9967f' : '#f0e8e0',
                        background: selected ? '#fdf0eb' : 'white',
                      }}>
                      {selected && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white" style={{ background: '#c9967f' }}>✓</span>
                      )}
                      <span className="text-2xl">{o.emoji}</span>
                      <span className="text-sm font-medium" style={{ color: '#2c2c2c' }}>{o.label}</span>
                      <span className="text-xs" style={{ color: '#8a8078' }}>{o.desc}</span>
                    </button>
                  );
                })}
                {form.style_vibes.length > 0 && (
                  <div className="col-span-2 sm:col-span-3 flex items-center gap-2 px-1">
                    <span className="text-xs" style={{ color: '#8a8078' }}>Selected:</span>
                    {form.style_vibes.map(v => (
                      <span key={v} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#fdf0eb', color: '#c9967f' }}>{v}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Occasions */}
            {step === 2 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {OCCASION_OPTIONS.map(o => (
                  <button key={o.label} onClick={() => toggleOccasion(o.label)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                    style={{
                      borderColor: form.occasions.includes(o.label) ? '#c9967f' : '#f0e8e0',
                      background: form.occasions.includes(o.label) ? '#fdf0eb' : 'white',
                    }}>
                    <span className="text-lg">{o.emoji}</span>
                    <span className="text-sm font-medium" style={{ color: '#2c2c2c' }}>{o.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Step 3: Palette */}
            {step === 3 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PALETTE_OPTIONS.map(p => {
                  const selected = form.color_palettes.includes(p.label);
                  return (
                    <button key={p.label} onClick={() => togglePalette(p.label)}
                      className="flex items-center gap-4 px-4 py-4 rounded-xl border-2 text-left transition-all relative"
                      style={{
                        borderColor: selected ? '#c9967f' : '#f0e8e0',
                        background: selected ? '#fdf0eb' : 'white',
                      }}>
                      {selected && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white" style={{ background: '#c9967f' }}>✓</span>
                      )}
                      <div className="flex gap-1 flex-shrink-0">
                        {p.swatch.map(c => (
                          <div key={c} className="w-5 h-5 rounded-full" style={{ background: c }} />
                        ))}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#2c2c2c' }}>{p.label}</p>
                        <p className="text-xs" style={{ color: '#8a8078' }}>{p.desc}</p>
                      </div>
                    </button>
                  );
                })}
                {form.color_palettes.length > 0 && (
                  <div className="col-span-1 sm:col-span-2 flex items-center gap-2 flex-wrap px-1">
                    <span className="text-xs" style={{ color: '#8a8078' }}>Selected:</span>
                    {form.color_palettes.map(p => (
                      <span key={p} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#fdf0eb', color: '#c9967f' }}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Body notes */}
            {step === 4 && (
              <div>
                <textarea value={form.body_notes}
                  onChange={e => setForm(f => ({ ...f, body_notes: e.target.value }))}
                  placeholder={`e.g. I'm petite (5'2"), prefer high-waisted bottoms, love oversized fits on top, avoiding fitted dresses...`}
                  rows={5}
                  className="w-full rounded-2xl p-5 text-sm outline-none resize-none"
                  style={{ border: '2px solid #f0e8e0', background: 'white', color: '#2c2c2c' }}
                />
                <p className="text-xs mt-3" style={{ color: '#b0a090' }}>
                  You can always add this later — just leave it blank and continue.
                </p>
              </div>
            )}

            {error && (
              <p className="mt-4 text-sm text-red-500">{error}</p>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10">
              <button onClick={() => setStep(s => Math.max(0, s - 1))}
                className="px-6 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-70"
                style={{ color: '#8a8078', visibility: step === 0 ? 'hidden' : 'visible' }}>
                ← Back
              </button>

              {step < STEPS.length - 1 ? (
                <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
                  className="px-8 py-3 rounded-full text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-30 disabled:scale-100"
                  style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)' }}>
                  Continue →
                </button>
              ) : (
                <button onClick={submit} disabled={loading}
                  className="px-8 py-3 rounded-full text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)' }}>
                  {loading ? 'Creating...' : 'Create Persona ✨'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
