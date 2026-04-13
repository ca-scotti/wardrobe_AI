'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Persona, WardrobeItem, Look } from '@/lib/db';

type Tab = 'build' | 'wardrobe' | 'looks';

type ReferenceImage = {
  url: string;
  thumb: string;
  alt: string;
  credit: string;
  link: string;
};

type ParsedAI = {
  message?: string;
  recommendation?: {
    why: string;
    what_to_look_for?: string;
    body_fit_notes?: string;
    options: Array<{
      item_type: string;
      description: string;
      colors: string[];
      search_query: string;
      category: string;
      subcategory: string;
      reference_images?: ReferenceImage[];
    }>;
  };
  looks_possible?: string[];
  wardrobe_progress?: string;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  parsed?: ParsedAI;
};

type ItemOption = {
  item_type: string;
  description: string;
  colors: string[];
  search_query: string;
  category: string;
  subcategory: string;
  reference_images?: ReferenceImage[];
  selected_image?: string;
};

const CATEGORY_EMOJI: Record<string, string> = {
  top: '👕', tops: '👕',
  bottom: '👖', bottoms: '👖',
  dress: '👗', dresses: '👗',
  outerwear: '🧥',
  shoe: '👟', shoes: '👟',
  bag: '👜', bags: '👜',
  accessory: '💍', accessories: '💍',
  jewelry: '💎',
};

// Map color words to hex for placeholder backgrounds
function colorToHex(colorStr: string): string {
  const map: Record<string, string> = {
    white: '#f5f0eb', cream: '#f5ede0', beige: '#e8d9c0', ivory: '#f2ead8',
    black: '#2c2c2c', charcoal: '#3d3d3d', grey: '#9a9a9a', gray: '#9a9a9a',
    navy: '#1a2744', blue: '#4a7abf', 'light blue': '#a8c4e0', 'sky blue': '#87ceeb',
    red: '#c94040', burgundy: '#7a1f2e', wine: '#6b1f35', rust: '#b85c38',
    pink: '#e8a0b0', blush: '#e8c5b8', rose: '#d4748a',
    green: '#4a7a5a', olive: '#6b7c4d', sage: '#a8b5a0', khaki: '#b5a882',
    yellow: '#e8c84a', mustard: '#c8a030', gold: '#d4a830',
    orange: '#d4784a', terracotta: '#c97050', camel: '#c9967f',
    purple: '#7c5cbf', lavender: '#b0a0d0', lilac: '#c4b0d8',
    brown: '#8b5e3c', tan: '#c4a882', chocolate: '#5c3a1e',
    denim: '#4a6080', 'dark wash': '#2a3a50', 'light wash': '#8a9ab0',
  };
  const lower = colorStr.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (lower.includes(k)) return v;
  }
  return '#e8d5cc';
}

function getItemBg(item: { colors: string; category: string }): { bg: string; fg: string } {
  const c = item.colors?.split(',')[0]?.trim() || '';
  const bg = colorToHex(c);
  // Dark backgrounds get light text/emoji
  const dark = ['#2c2c2c','#3d3d3d','#1a2744','#2a3a50','#5c3a1e','#7a1f2e','#6b1f35'].includes(bg);
  return { bg, fg: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.5)' };
}

// Build a generic item name from the option
function buildItemName(opt: { item_type: string; colors: string[] }, selectedColor?: string): string {
  const color = selectedColor || opt.colors[0] || '';
  const type = opt.item_type || '';
  // Avoid duplicating color if item_type already starts with it
  if (color && !type.toLowerCase().startsWith(color.toLowerCase())) {
    return `${color} ${type}`.trim();
  }
  return type.trim();
}

function catEmoji(cat: string) {
  return CATEGORY_EMOJI[cat?.toLowerCase()] || '👔';
}

function tryParse(text: string): ParsedAI | undefined {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return undefined;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n');
    if (lines.some(l => /^[-•*]\s/.test(l))) {
      return (
        <ul key={pi} className="list-disc list-inside space-y-0.5 my-1 pl-1">
          {lines.filter(l => l.trim()).map((line, li) => (
            <li key={li}>{renderInline(line.replace(/^[-•*]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={pi} className={pi > 0 ? 'mt-2' : undefined}>
        {lines.map((line, li) => (
          <span key={li}>{renderInline(line)}{li < lines.length - 1 && <br />}</span>
        ))}
      </p>
    );
  });
}

function displayText(msg: Message): React.ReactNode {
  const raw = msg.parsed?.message ?? msg.content ?? '';
  const text = msg.parsed?.message ? raw : (raw.replace(/\{[\s\S]*\}/, '').trim() || raw);
  return renderMarkdown(text);
}

export default function PersonaPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [persona, setPersona] = useState<Persona | null>(null);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [looks, setLooks] = useState<Look[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<Tab>('build');
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [looksLoading, setLooksLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [similarTarget, setSimilarTarget] = useState<ItemOption | null>(null);
  const [similarDesc, setSimilarDesc] = useState('');
  const [similarImage, setSimilarImage] = useState<File | null>(null);
  const [similarImagePreview, setSimilarImagePreview] = useState<string | null>(null);
  const [wardrobeFilter, setWardrobeFilter] = useState<'all' | 'owned' | 'wishlist'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  // Per-option reference images: key is "msgIdx-optIdx"
  const [refImages, setRefImages] = useState<Record<string, ReferenceImage[]>>({});
  const [refImagesLoading, setRefImagesLoading] = useState<Record<string, boolean>>({});
  // Selected reference image per option: key is "msgIdx-optIdx", value is image URL
  const [selectedRefImage, setSelectedRefImage] = useState<Record<string, string>>({});
  // Looks UI
  const [filterOccasion, setFilterOccasion] = useState('all');
  const [filterTemp, setFilterTemp] = useState('all');
  const [expandedLook, setExpandedLook] = useState<Look | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const similarFileRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    const [pRes, iRes, cRes, lRes] = await Promise.all([
      fetch(`/api/personas/${id}`),
      fetch(`/api/personas/${id}/items`),
      fetch(`/api/personas/${id}/chat`),
      fetch(`/api/personas/${id}/generate-looks`),
    ]);
    if (pRes.ok) setPersona(await pRes.json());
    if (iRes.ok) setItems(await iRes.json());
    if (cRes.ok) {
      const { messages: msgs } = await cRes.json();
      setMessages((msgs as Array<{ role: string; content: string }>).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        parsed: m.role === 'assistant' ? tryParse(m.content) : undefined,
      })));
    }
    if (lRes.ok) setLooks(await lRes.json());
  }, [id]);

  useEffect(() => {
    loadAll().then(() => {
      // One-time initial generation: if the wardrobe has items but no looks saved yet
      setItems(currentItems => {
        setLooks(currentLooks => {
          if (currentLooks.length === 0) {
            const ownedCount = currentItems.filter(i => i.is_owned).length;
            if (ownedCount >= 3) {
              setLooksLoading(true);
              fetch(`/api/personas/${id}/generate-looks`, { method: 'POST' })
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data?.looks) setLooks(data.looks); })
                .catch(() => {})
                .finally(() => setLooksLoading(false));
            }
          }
          return currentLooks;
        });
        return currentItems;
      });
    });
  }, [loadAll, id]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, aiLoading]);

  const sendMsg = async (override?: string) => {
    const msg = override ?? input;
    if (!msg.trim() && !imageFile) return;
    setAiLoading(true);
    setInput('');

    let imageBase64: string | undefined;
    let mimeType: string | undefined;
    if (imageFile) {
      imageBase64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
      mimeType = imageFile.type;
      setImageFile(null);
      setImagePreview(null);
    }

    const displayMsg = imageFile ? `📷 ${msg}` : msg;
    setMessages(m => [...m, { role: 'user', content: displayMsg }]);

    try {
      const res = await fetch(`/api/personas/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: msg, imageBase64, mimeType }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(m => [...m, { role: 'assistant', content: `Something went wrong: ${data.error}. Please check that your ANTHROPIC_API_KEY is set in .env.local.` }]);
      } else {
        if (data.items_changed) refreshItems();
        if (data.looks_changed) refreshLooks();
        // Compute the index the new assistant message will have
        const newMsgIdx = messages.length + 1; // +1 for user msg already added above
        setMessages(m => [...m, {
          role: 'assistant' as const,
          content: data.raw || data.message || '',
          parsed: data.parsed,
        }]);

        // Kick off image searches after state update — outside setState callback
        const options = data.parsed?.recommendation?.options;
        if (options?.length) {
          options.forEach((opt: ItemOption, oi: number) => {
            // Build a search query — use provided one or fall back to item description
            const query = opt.search_query
              || `${(opt.colors?.[0] || '')} ${opt.item_type || ''} ${opt.category || ''} women fashion outfit`.trim();
            if (!query.trim()) return;
            const key = `${newMsgIdx}-${oi}`;
            setRefImagesLoading(l => ({ ...l, [key]: true }));
            fetch('/api/image-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query }),
            })
              .then(r => r.ok ? r.json() : { images: [] })
              .then(d => setRefImages(r => ({ ...r, [key]: d.images || [] })))
              .catch(() => setRefImages(r => ({ ...r, [key]: [] })))
              .finally(() => setRefImagesLoading(l => ({ ...l, [key]: false })));
          });
        }
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Could not reach the server. Please try again.' }]);
    } finally {
      setAiLoading(false);
    }
  };

  const startBuild = () => {
    const msg = `Hi! I'm ${persona?.name}. My style is ${persona?.style_vibe}, I dress for ${persona?.occasions}, my palette is ${persona?.color_palette}. ${persona?.body_notes ? 'Body notes: ' + persona.body_notes + '.' : ''} What can you help me with?`;
    sendMsg(msg);
  };

  const addItemAndContinue = async (opt: ItemOption, owned: boolean, selectedImgUrl?: string) => {
    const itemName = buildItemName(opt);
    let imagePath = '';

    // If a reference image was selected, download and save it
    if (selectedImgUrl) {
      try {
        const proxyRes = await fetch('/api/proxy-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: selectedImgUrl }),
        });
        if (proxyRes.ok) {
          const d = await proxyRes.json();
          imagePath = d.path || '';
        }
      } catch { /* image fetch failed, continue without */ }
    }

    const res = await fetch(`/api/personas/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: itemName,
        category: opt.category,
        subcategory: opt.subcategory || '',
        colors: (opt.colors || []).join(', '),
        description: opt.description || '',
        image_path: imagePath,
        is_owned: owned,
      }),
    });
    if (res.ok) {
      const item = await res.json();
      setItems(p => [...p, item]);
      // Incrementally add looks featuring the new item (needs 3+ owned for a complete outfit)
      if (owned) {
        const newOwned = items.filter(i => i.is_owned).length + 1;
        if (newOwned >= 3) {
          fetch(`/api/personas/${id}/generate-looks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newItemId: item.id }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.looks) setLooks(data.looks); })
            .catch(() => {});
        }
      }
      const msg = owned
        ? `Great, I already have a "${itemName}". What should I add next?`
        : `I added "${itemName}" to my wishlist. What's the next priority piece to own?`;
      await sendMsg(msg);
    }
  };

  const confirmSimilar = async () => {
    if (!similarTarget || !similarDesc.trim()) return;
    let imagePath = '';
    if (similarImage) {
      const fd = new FormData();
      fd.append('file', similarImage);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (r.ok) { const d = await r.json(); imagePath = d.path; }
    }
    await fetch(`/api/personas/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: similarDesc.split(' ').slice(0, 5).join(' '),
        category: similarTarget.category,
        subcategory: similarTarget.subcategory || '',
        colors: '',
        description: similarDesc,
        image_path: imagePath,
        is_owned: true,
      }),
    });
    await loadAll();
    setSimilarTarget(null);
    setSimilarDesc('');
    setSimilarImage(null);
    setSimilarImagePreview(null);
    await sendMsg(`I have something similar to "${similarTarget.item_type}": ${similarDesc}. What should I add next?`);
  };

  const toggleOwned = async (item: WardrobeItem) => {
    await fetch(`/api/personas/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, is_owned: !item.is_owned }),
    });
    setItems(p => p.map(i => i.id === item.id ? { ...i, is_owned: i.is_owned ? 0 : 1 } : i));
  };

  const deleteItem = async (itemId: string) => {
    await fetch(`/api/personas/${id}/items?itemId=${itemId}`, { method: 'DELETE' });
    setItems(p => p.filter(i => i.id !== itemId));
  };

  const startEdit = (item: WardrobeItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const saveEdit = async (itemId: string) => {
    const name = editingName.trim();
    if (!name) { setEditingId(null); return; }
    await fetch(`/api/personas/${id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, name }),
    });
    setItems(p => p.map(i => i.id === itemId ? { ...i, name } : i));
    setEditingId(null);
  };

  const handleItemImageUpload = async (file: File, itemId: string) => {
    setUploadingItemId(itemId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) return;
      const { path: imagePath } = await r.json();
      await fetch(`/api/personas/${id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, image_path: imagePath }),
      });
      setItems(p => p.map(i => i.id === itemId ? { ...i, image_path: imagePath } : i));
    } finally {
      setUploadingItemId(null);
    }
  };


  const generateLooks = async () => {
    setLooksLoading(true);
    try {
      const res = await fetch(`/api/personas/${id}/generate-looks`, { method: 'POST' });
      if (res.ok) { const { looks: l } = await res.json(); setLooks(l); setTab('looks'); }
    } finally { setLooksLoading(false); }
  };

  const refreshLooks = async () => {
    const res = await fetch(`/api/personas/${id}/generate-looks`);
    if (res.ok) setLooks(await res.json());
  };

  const refreshItems = async () => {
    const res = await fetch(`/api/personas/${id}/items`);
    if (res.ok) setItems(await res.json());
  };

  const downloadExcel = () => {
    window.location.href = `/api/personas/${id}/export`;
  };

  const approveLook = async (lookId: string) => {
    await fetch(`/api/personas/${id}/looks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookId, is_approved: 1 }),
    });
    setLooks(l => l.map(x => x.id === lookId ? { ...x, is_approved: 1 } : x));
  };

  const rejectLook = async (lookId: string) => {
    await fetch(`/api/personas/${id}/looks?lookId=${lookId}`, { method: 'DELETE' });
    setLooks(l => l.filter(x => x.id !== lookId));
  };

  const deletePersona = async () => {
    if (!confirm(`Delete "${persona?.name}"? This can't be undone.`)) return;
    await fetch(`/api/personas/${id}`, { method: 'DELETE' });
    router.push('/');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, forSimilar = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (forSimilar) { setSimilarImage(file); setSimilarImagePreview(reader.result as string); }
      else { setImageFile(file); setImagePreview(reader.result as string); }
    };
    reader.readAsDataURL(file);
  };

  if (!persona) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf6f2' }}>
      <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#c9967f', borderTopColor: 'transparent' }} />
    </div>
  );

  const owned = items.filter(i => i.is_owned);
  const wishlist = items.filter(i => !i.is_owned);
  const lastMsgIdx = messages.length - 1;
  const itemIdSet = new Set(items.map(i => i.id));
  function parseLookIds(look: Look): string[] {
    try { return JSON.parse(look.item_ids || '[]'); } catch {
      return (look.item_ids || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }
  // Filter out looks whose items are no longer in the wardrobe
  const validLooks = looks.filter(look => parseLookIds(look).filter(iid => itemIdSet.has(iid)).length >= 3);
  const pendingLooks = validLooks.filter(l => !l.is_approved);
  const approvedLooks = validLooks.filter(l => l.is_approved);

  function applyLookFilters(list: Look[]) {
    const filtered = list.filter(l => {
      if (filterOccasion !== 'all' && l.occasion?.toLowerCase() !== filterOccasion) return false;
      if (filterTemp !== 'all' && (l.temperature || 'all') !== filterTemp) return false;
      return true;
    });
    if (shuffleSeed === 0) return filtered;
    // Use shuffleSeed as a multiplier with a per-item random offset so each click gives a new order
    return [...filtered].sort((a, b) => {
      const ra = Math.sin(shuffleSeed * 9301 + a.id.charCodeAt(0) * 49297) * 233280;
      const rb = Math.sin(shuffleSeed * 9301 + b.id.charCodeAt(0) * 49297) * 233280;
      return (ra - Math.floor(ra)) - (rb - Math.floor(rb));
    });
  }
  const filteredApproved = applyLookFilters(approvedLooks);
  const filteredPending  = applyLookFilters(pendingLooks);

  const CATEGORIES = ['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'bags', 'accessories', 'jewelry'];
  // Match both plural and singular, e.g. "shoes"/"shoe", "tops"/"top"
  const matchCat = (itemCat: string, cat: string) => {
    const c = itemCat?.toLowerCase() || '';
    return c === cat || c === cat.slice(0, -1) || c === cat + 's';
  };
  const filteredItems = wardrobeFilter === 'owned' ? owned : wardrobeFilter === 'wishlist' ? wishlist : items;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#faf6f2' }}>

      {/* Top nav */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ background: 'rgba(250,246,242,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #f0e8e0' }}>
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-60" style={{ color: '#8a8078' }}>
            <span>←</span> <span className="font-display font-semibold" style={{ color: '#2c2c2c' }}>Vestia</span>
          </Link>
          <span style={{ color: '#e8d5cc' }}>|</span>
          <div>
            <p className="font-semibold text-sm leading-tight" style={{ color: '#2c2c2c' }}>{persona.name}</p>
            <p className="text-xs leading-tight" style={{ color: '#8a8078' }}>{persona.style_vibe}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full" style={{ background: '#f5ece4', color: '#c9967f' }}>
            <span>✓ {owned.length} owned</span>
            <span style={{ color: '#e8d5cc' }}>·</span>
            <span>♡ {wishlist.length} wishlist</span>
          </div>

          <button onClick={deletePersona} className="text-xs transition-opacity hover:opacity-60" style={{ color: '#c9a09c' }}>
            Delete
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #f0e8e0', background: 'rgba(250,246,242,0.9)' }}>
        {([
          { id: 'build',    label: 'Build Wardrobe', icon: '🏗️' },
          { id: 'wardrobe', label: `Wardrobe (${items.length})`, icon: '👗' },
          { id: 'looks',    label: `Looks (${approvedLooks.length})${pendingLooks.length > 0 ? ` · ${pendingLooks.length} new` : ''}`, icon: '✨' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative"
            style={{ color: tab === t.id ? '#c9967f' : '#8a8078' }}>
            <span>{t.icon}</span> {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#c9967f' }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content area */}
      <div className="flex-1 overflow-hidden flex flex-col">

      {/* ── BUILD TAB ── */}
      {tab === 'build' && (
        <div className="flex flex-1 gap-0 overflow-hidden">

          {/* Chat column */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center fade-up">
                  <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mb-6"
                    style={{ background: 'linear-gradient(135deg, #fdf0eb, #eef3ec)' }}>
                    👗
                  </div>
                  <h3 className="font-display text-2xl font-semibold mb-2" style={{ color: '#2c2c2c' }}>
                    Ready to build your wardrobe?
                  </h3>
                  <p className="text-sm leading-relaxed mb-8 max-w-xs" style={{ color: '#8a8078' }}>
                    Your AI stylist will guide you from zero to a complete, cohesive wardrobe — one perfect piece at a time.
                  </p>
                  <button onClick={startBuild} disabled={aiLoading}
                    className="px-8 py-3.5 rounded-full text-white font-medium transition-all hover:scale-105 hover:shadow-lg disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)' }}>
                    {aiLoading ? 'Starting...' : "Let's start building ✨"}
                  </button>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-up`}>
                    {msg.role === 'user' ? (
                      <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-2xl rounded-tr-sm text-sm text-white"
                        style={{ background: 'linear-gradient(135deg, #c9967f, #b88a70)' }}>
                        {msg.content}
                      </div>
                    ) : (
                      <div className="max-w-xl space-y-3">
                        {/* AI text bubble */}
                        <div className="px-5 py-4 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                          style={{ background: 'white', border: '1px solid #f0e8e0', color: '#2c2c2c' }}>
                          {displayText(msg)}
                        </div>

                        {/* Why this next + what to look for */}
                        {msg.parsed?.recommendation && (
                          <div className="space-y-2">
                            {msg.parsed.recommendation.why && (
                              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#fef9ec', border: '1px solid #f0dfa0' }}>
                                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#b07d2a' }}>Why this next</p>
                                <p style={{ color: '#7a5c1a' }}>{msg.parsed.recommendation.why}</p>
                              </div>
                            )}
                            {msg.parsed.recommendation.what_to_look_for && (
                              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#f5f0fb', border: '1px solid #e0d5f0' }}>
                                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#7c5cbf' }}>What to look for</p>
                                <p style={{ color: '#4a3570' }}>{msg.parsed.recommendation.what_to_look_for}</p>
                              </div>
                            )}
                            {msg.parsed.recommendation.body_fit_notes && (
                              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#eef3ec', border: '1px solid #c8dcc4' }}>
                                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#4a7a50' }}>Fit for your shape</p>
                                <p style={{ color: '#2d4d30' }}>{msg.parsed.recommendation.body_fit_notes}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Option cards */}
                        {msg.parsed?.recommendation?.options && (
                          <div className="space-y-3">
                            <p className="text-xs font-medium px-1" style={{ color: '#8a8078' }}>
                              {msg.parsed.recommendation.options.length > 1 ? 'Style options — pick what resonates:' : 'What to look for:'}
                            </p>
                            {msg.parsed.recommendation.options.map((opt, oi) => {
                              const isLast = idx === lastMsgIdx;
                              const imgKey = `${idx}-${oi}`;
                              const images = refImages[imgKey] || [];
                              const isLoadingImgs = refImagesLoading[imgKey];
                              const chosenImg = selectedRefImage[imgKey];
                              return (
                                <div key={oi} className="rounded-2xl overflow-hidden transition-all"
                                  style={{ background: 'white', border: `1.5px solid ${isLast ? '#f0e8e0' : '#f5f0eb'}` }}>
                                  <div className="p-4">
                                    <div className="flex items-start gap-3 mb-3">
                                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                                        style={{ background: '#faf6f2' }}>
                                        {catEmoji(opt.category)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm mb-1" style={{ color: '#2c2c2c' }}>
                                          {opt.item_type}
                                        </p>
                                        <p className="text-xs leading-relaxed mb-2" style={{ color: '#8a8078' }}>{opt.description}</p>
                                        {opt.colors?.length > 0 && (
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-xs" style={{ color: '#8a8078' }}>
                                              {opt.colors.length > 1 ? 'Any of these work:' : 'Color:'}
                                            </span>
                                            {opt.colors.map(c => (
                                              <div key={c} className="flex items-center gap-1.5 px-2 py-1 rounded-full border" style={{ background: '#faf6f2', borderColor: '#e8d5cc' }}>
                                                <div className="w-3 h-3 rounded-full border border-white shadow-sm flex-shrink-0" style={{ background: colorToHex(c) }} />
                                                <span className="text-xs font-medium" style={{ color: '#2c2c2c' }}>{c}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Reference images */}
                                    {(images.length > 0 || isLoadingImgs) && (
                                      <div className="mb-3">
                                        <p className="text-xs font-medium mb-2" style={{ color: '#8a8078' }}>
                                          Reference photos{isLast ? ' — tap one to use as your item photo' : ''}:
                                        </p>
                                        {isLoadingImgs ? (
                                          <div className="grid grid-cols-2 gap-2">
                                            {[0,1,2,3].map(i => (
                                              <div key={i} className="rounded-xl animate-pulse" style={{ height: 160, background: '#f0e8e0' }} />
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-2 gap-2">
                                            {images.map((img, ii) => (
                                              <button key={ii} onClick={() => isLast && setSelectedRefImage(r => ({
                                                ...r,
                                                [imgKey]: r[imgKey] === img.url ? '' : img.url,
                                              }))}
                                                className="relative rounded-xl overflow-hidden transition-all"
                                                style={{
                                                  height: 180,
                                                  outline: chosenImg === img.url ? '3px solid #c9967f' : '2px solid transparent',
                                                  cursor: isLast ? 'pointer' : 'default',
                                                }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                                                {chosenImg === img.url && (
                                                  <div className="absolute inset-0 flex items-center justify-center"
                                                    style={{ background: 'rgba(201,150,127,0.3)' }}>
                                                    <span className="text-white text-2xl font-bold drop-shadow">✓</span>
                                                  </div>
                                                )}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                        {chosenImg && isLast && (
                                          <p className="text-xs mt-1.5" style={{ color: '#c9967f' }}>
                                            Photo selected — it will be saved with the item
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {isLast && (
                                      <div className="flex gap-2 flex-wrap">
                                        <button onClick={() => addItemAndContinue(opt, true, chosenImg)} disabled={aiLoading}
                                          className="text-xs px-3 py-1.5 rounded-full text-white font-medium transition-all hover:scale-105 disabled:opacity-50"
                                          style={{ background: '#c9967f' }}>
                                          ✓ I have this
                                        </button>
                                        <button onClick={() => addItemAndContinue(opt, false, chosenImg)} disabled={aiLoading}
                                          className="text-xs px-3 py-1.5 rounded-full font-medium transition-all hover:opacity-80 disabled:opacity-50"
                                          style={{ background: '#f5ece4', color: '#c9967f' }}>
                                          ♡ Add to wishlist
                                        </button>
                                        <button onClick={() => setSimilarTarget(opt)} disabled={aiLoading}
                                          className="text-xs px-3 py-1.5 rounded-full font-medium transition-all hover:opacity-80 disabled:opacity-50"
                                          style={{ background: '#eef3ec', color: '#6a8c64' }}>
                                          ~ I have something similar
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Looks possible */}
                        {msg.parsed?.looks_possible && msg.parsed.looks_possible.length > 0 && (
                          <div className="px-4 py-3 rounded-xl" style={{ background: '#f5f0fb', border: '1px solid #e0d5f0' }}>
                            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#7c5cbf' }}>Looks you can form</p>
                            {msg.parsed.looks_possible.map((l, li) => (
                              <p key={li} className="text-xs mb-1 flex gap-2" style={{ color: '#5a3e8a' }}>
                                <span>•</span> {l}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Typing indicator */}
              {aiLoading && (
                <div className="flex justify-start fade-up">
                  <div className="px-5 py-4 rounded-2xl rounded-tl-sm flex gap-1.5 items-center"
                    style={{ background: 'white', border: '1px solid #f0e8e0' }}>
                    <div className="w-2 h-2 rounded-full typing-dot" style={{ background: '#c9967f' }} />
                    <div className="w-2 h-2 rounded-full typing-dot" style={{ background: '#c9967f' }} />
                    <div className="w-2 h-2 rounded-full typing-dot" style={{ background: '#c9967f' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Similar item panel */}
            {similarTarget && (
              <div className="mx-4 mb-3 p-4 rounded-2xl fade-up" style={{ background: '#eef3ec', border: '1px solid #c8dcc4' }}>
                <p className="text-sm font-semibold mb-3" style={{ color: '#3d6b38' }}>
                  Describe your version of &quot;{similarTarget.item_type}&quot;:
                </p>
                <textarea value={similarDesc} onChange={e => setSimilarDesc(e.target.value)}
                  placeholder="e.g. A cream linen oversized button-down shirt, slightly boxy fit, falls to mid-hip..."
                  rows={3} className="w-full rounded-xl p-3 text-sm outline-none resize-none mb-3"
                  style={{ border: '1px solid #c8dcc4', background: 'white', color: '#2c2c2c' }} />
                <div className="flex items-center gap-3 mb-3">
                  <button onClick={() => similarFileRef.current?.click()}
                    className="text-xs px-3 py-1.5 rounded-full font-medium transition-all hover:opacity-80"
                    style={{ background: 'white', color: '#6a8c64', border: '1px solid #c8dcc4' }}>
                    📷 Attach Photo (optional)
                  </button>
                  {similarImagePreview && (
                    <div className="relative">
                      <Image src={similarImagePreview} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover" />
                      <button onClick={() => { setSimilarImage(null); setSimilarImagePreview(null); }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-xs flex items-center justify-center"
                        style={{ background: '#2c2c2c' }}>×</button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmSimilar} disabled={!similarDesc.trim() || aiLoading}
                    className="text-xs px-4 py-2 rounded-full text-white font-medium transition-all disabled:opacity-40"
                    style={{ background: '#6a8c64' }}>
                    Add to my wardrobe
                  </button>
                  <button onClick={() => { setSimilarTarget(null); setSimilarDesc(''); }}
                    className="text-xs px-4 py-2 rounded-full font-medium transition-all hover:opacity-70"
                    style={{ background: 'white', color: '#8a8078' }}>
                    Cancel
                  </button>
                </div>
                <input ref={similarFileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => handleFileSelect(e, true)} />
              </div>
            )}

            {/* Chat input */}
            {messages.length > 0 && !similarTarget && (
              <div className="px-4 pb-4">
                {imagePreview && (
                  <div className="flex items-center gap-2 mb-2 px-2">
                    <Image src={imagePreview} alt="" width={40} height={40} className="w-10 h-10 rounded-xl object-cover" />
                    <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                      className="text-xs hover:opacity-70" style={{ color: '#8a8078' }}>Remove</button>
                  </div>
                )}
                <div className="flex gap-2 items-end rounded-2xl p-2"
                  style={{ background: 'white', border: '1.5px solid #f0e8e0' }}>
                  <button onClick={() => fileRef.current?.click()}
                    className="p-2 rounded-xl transition-all hover:opacity-70 flex-shrink-0"
                    style={{ color: '#c9967f' }} title="Attach photo">
                    📷
                  </button>
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                    placeholder="Ask your stylist anything, or describe a piece you have..."
                    disabled={aiLoading} rows={1}
                    className="flex-1 outline-none text-sm bg-transparent resize-none py-2"
                    style={{ color: '#2c2c2c', minHeight: 36, maxHeight: 120 }} />
                  <button onClick={() => sendMsg()} disabled={aiLoading || (!input.trim() && !imageFile)}
                    className="px-4 py-2 rounded-xl text-white text-sm font-medium transition-all hover:scale-105 disabled:opacity-30 flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)' }}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Wardrobe sidebar */}
          <div className="w-64 hidden lg:flex flex-col border-l" style={{ borderColor: '#f0e8e0', background: 'rgba(255,255,255,0.6)' }}>
            <div className="p-4 border-b" style={{ borderColor: '#f0e8e0' }}>
              <p className="font-semibold text-sm" style={{ color: '#2c2c2c' }}>Your Wardrobe</p>
              <p className="text-xs mt-0.5" style={{ color: '#8a8078' }}>{owned.length} owned · {wishlist.length} to buy</p>
              {owned.length > 0 && (
                <div className="mt-3 rounded-full overflow-hidden h-1.5" style={{ background: '#f0e8e0' }}>
                  <div className="h-full rounded-full progress-bar" style={{ width: `${Math.min(100, (owned.length / 20) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {items.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: '#c4b5a0' }}>Items appear here as you build</p>
              ) : (
                <>
                  {owned.length > 0 && (
                    <>
                      <p className="text-xs font-semibold px-2 pt-2 pb-1 uppercase tracking-wide" style={{ color: '#a8b5a0' }}>Owned</p>
                      {owned.map(item => (
                        <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white transition-colors">
                          <span className="text-base">{catEmoji(item.category)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: '#2c2c2c' }}>{item.name}</p>
                            <p className="text-xs truncate" style={{ color: '#c4b5a0' }}>{item.colors}</p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {wishlist.length > 0 && (
                    <>
                      <p className="text-xs font-semibold px-2 pt-3 pb-1 uppercase tracking-wide" style={{ color: '#e8c5b8' }}>Wishlist</p>
                      {wishlist.map(item => (
                        <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl opacity-60">
                          <span className="text-base">{catEmoji(item.category)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: '#2c2c2c' }}>{item.name}</p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── WARDROBE TAB ── */}
      {tab === 'wardrobe' && (
        <div className="flex-1 h-full px-6 py-6 overflow-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-5xl mb-4">🧺</div>
              <p className="font-display text-xl font-semibold mb-2" style={{ color: '#2c2c2c' }}>Your wardrobe is empty</p>
              <p className="text-sm mb-5" style={{ color: '#8a8078' }}>Use the Build tab to start adding pieces with your AI stylist.</p>
              <button onClick={() => setTab('build')} className="text-sm px-5 py-2.5 rounded-full text-white"
                style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)' }}>
                Start Building →
              </button>
            </div>
          ) : (
            <>
              {/* Filter */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-2">
                  {(['all', 'owned', 'wishlist'] as const).map(f => (
                    <button key={f} onClick={() => setWardrobeFilter(f)}
                      className="text-xs px-4 py-1.5 rounded-full font-medium capitalize transition-all"
                      style={wardrobeFilter === f
                        ? { background: '#c9967f', color: 'white' }
                        : { background: 'white', color: '#8a8078', border: '1px solid #f0e8e0' }}>
                      {f === 'all' ? `All (${items.length})` : f === 'owned' ? `✓ Owned (${owned.length})` : `♡ Wishlist (${wishlist.length})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items by category */}
              {CATEGORIES.map(cat => {
                const catItems = filteredItems.filter(i => matchCat(i.category, cat));
                if (!catItems.length) return null;
                return (
                  <div key={cat} className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xl">{catEmoji(cat)}</span>
                      <h3 className="font-semibold text-sm uppercase tracking-wide" style={{ color: '#2c2c2c' }}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f5ece4', color: '#c9967f' }}>{catItems.length}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {catItems.map(item => (
                        <div key={item.id} className="rounded-2xl overflow-hidden card-hover"
                          style={{ background: 'white', border: `1.5px solid ${item.is_owned ? '#f0e8e0' : '#f0e8e0'}`, opacity: item.is_owned ? 1 : 0.7 }}>
                          {/* Item photo — real or AI generated */}
                          {item.image_path ? (
                            <div className="h-28 overflow-hidden relative group">
                              <Image src={item.image_path} alt={item.name} width={160} height={112} className="w-full h-full object-cover" />
                              {uploadingItemId === item.id ? (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                </div>
                              ) : (
                                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center">
                                  <span className="text-white text-xs font-semibold bg-black/50 px-3 py-1.5 rounded-full">Change Photo</span>
                                  <input type="file" accept="image/*" className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleItemImageUpload(f, item.id); e.target.value = ''; }} />
                                </label>
                              )}
                            </div>
                          ) : (() => {
                            const { bg, fg } = getItemBg(item);
                            const isUploading = uploadingItemId === item.id;
                            return (
                              <div className="h-28 flex flex-col items-center justify-center gap-1 relative overflow-hidden group"
                                style={{ background: bg }}>
                                <div className="absolute inset-0 opacity-10"
                                  style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, white 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                                {isUploading ? (
                                  <div className="flex flex-col items-center gap-2 relative">
                                    <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                    <span className="text-xs text-white font-medium">Uploading…</span>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-4xl relative group-hover:opacity-20 transition-opacity">{catEmoji(item.category)}</span>
                                    {item.colors && (
                                      <span className="text-xs font-medium relative group-hover:opacity-0 transition-opacity" style={{ color: fg }}>
                                        {item.colors.split(',')[0].trim()}
                                      </span>
                                    )}
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <label className="cursor-pointer flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm"
                                        style={{ background: 'rgba(255,255,255,0.92)', color: '#2c2c2c' }}>
                                        📷 Upload
                                        <input type="file" accept="image/*" className="hidden"
                                          onChange={e => { const f = e.target.files?.[0]; if (f) handleItemImageUpload(f, item.id); e.target.value = ''; }} />
                                      </label>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                          <div className="p-3">
                            {editingId === item.id ? (
                              <input
                                autoFocus
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onBlur={() => saveEdit(item.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveEdit(item.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                className="text-xs font-semibold w-full rounded-lg px-1.5 py-0.5 mb-1 outline-none"
                                style={{ border: '1.5px solid #c9967f', color: '#2c2c2c', background: '#fdf5f0' }}
                              />
                            ) : (
                              <p
                                onClick={() => startEdit(item)}
                                title="Click to rename"
                                className="text-xs font-semibold leading-tight mb-1 line-clamp-2 cursor-text hover:text-rose-400 transition-colors"
                                style={{ color: '#2c2c2c' }}
                              >
                                {item.name}
                              </p>
                            )}
                            {item.description && (
                              <p className="text-xs mb-2 line-clamp-2 leading-relaxed" style={{ color: '#8a8078' }}>{item.description}</p>
                            )}
                            <div className="flex items-center justify-between">
                              <button onClick={() => toggleOwned(item)}
                                className="text-xs px-2 py-0.5 rounded-full font-medium transition-all"
                                style={item.is_owned
                                  ? { background: '#eef3ec', color: '#6a8c64' }
                                  : { background: '#fdf5f0', color: '#c9967f' }}>
                                {item.is_owned ? '✓ Owned' : '♡ Wish'}
                              </button>
                              <button onClick={() => deleteItem(item.id)}
                                className="text-xs transition-opacity hover:opacity-100 opacity-30" style={{ color: '#8a8078' }}>×</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── LOOKS TAB ── */}
      {tab === 'looks' && (() => {
        const OCCASION_COLORS: Record<string, { bg: string; color: string }> = {
          casual:  { bg: '#fdf5f0', color: '#c9967f' },
          work:    { bg: '#f0f4fb', color: '#5c7abf' },
          evening: { bg: '#f3f0fb', color: '#7c5cbf' },
          weekend: { bg: '#eef3ec', color: '#6a8c64' },
          formal:  { bg: '#fef9ec', color: '#b07d2a' },
        };
        const TEMP_CONFIG: Record<string, { label: string; emoji: string; bg: string; color: string }> = {
          warm:    { label: 'Warm',    emoji: '☀️',  bg: '#fef9ec', color: '#b07d2a' },
          cool:    { label: 'Cool',    emoji: '🍂',  bg: '#eef3ec', color: '#5a7a5a' },
          cold:    { label: 'Cold',    emoji: '❄️',  bg: '#f0f4fb', color: '#4a6abf' },
          layered: { label: 'Layered', emoji: '🧣',  bg: '#f5f0fb', color: '#7c5cbf' },
          all:     { label: 'All seasons', emoji: '🌡️', bg: '#f5ece4', color: '#c9967f' },
        };

        const LookCard = ({ look, pending }: { look: Look; pending: boolean }) => {
          const lookItems = parseLookIds(look).map(iid => items.find(i => i.id === iid)).filter(Boolean) as WardrobeItem[];
          const occ = look.occasion?.toLowerCase().split('/')[0].trim();
          const occStyle = OCCASION_COLORS[occ] || { bg: '#f5ece4', color: '#c9967f' };
          const tempCfg = TEMP_CONFIG[look.temperature] || TEMP_CONFIG.all;
          return (
            <div className="rounded-2xl overflow-hidden fade-up"
              style={{ background: 'white', border: `1.5px solid ${pending ? '#f0dfa0' : '#f0e8e0'}` }}>
              {/* Collage — clickable */}
              <button className="w-full text-left" onClick={() => setExpandedLook(look)}>
                <div className="h-48 relative overflow-hidden"
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(lookItems.length, 2)}, 1fr)`, gridTemplateRows: lookItems.length > 2 ? 'repeat(2, 1fr)' : '1fr', gap: '2px', background: '#f0e8e0' }}>
                  {lookItems.slice(0, 4).map(item => {
                    const { bg } = getItemBg(item);
                    return item.image_path ? (
                      <div key={item.id} className="overflow-hidden">
                        <Image src={item.image_path} alt={item.name} width={200} height={120} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div key={item.id} className="flex items-center justify-center text-3xl" style={{ background: bg }}>
                        {catEmoji(item.category)}
                      </div>
                    );
                  })}
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium shadow-sm" style={{ background: occStyle.bg, color: occStyle.color }}>{look.occasion}</span>
                    {look.temperature && look.temperature !== 'all' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium shadow-sm" style={{ background: tempCfg.bg, color: tempCfg.color }}>{tempCfg.emoji} {tempCfg.label}</span>
                    )}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.15)' }}>
                    <span className="text-white text-sm font-semibold bg-black/40 px-3 py-1.5 rounded-full">View look →</span>
                  </div>
                </div>
              </button>
              <div className="p-4">
                <h3 className="font-display font-semibold text-sm mb-1" style={{ color: '#2c2c2c' }}>{look.name}</h3>
                <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: '#8a8078' }}>{look.description}</p>
                {pending ? (
                  <div className="flex gap-2">
                    <button onClick={() => approveLook(look.id)}
                      className="flex-1 text-xs py-2 rounded-xl font-medium transition-all hover:scale-105"
                      style={{ background: '#eef3ec', color: '#4a7a50' }}>
                      ✓ Keep this look
                    </button>
                    <button onClick={() => rejectLook(look.id)}
                      className="text-xs px-3 py-2 rounded-xl font-medium transition-all hover:opacity-70"
                      style={{ background: '#faf6f2', color: '#b0a090' }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {lookItems.slice(0, 3).map(item => (
                        <span key={item.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#faf6f2', color: '#8a8078' }}>
                          {catEmoji(item.category)} {item.name.split(' ').slice(0, 3).join(' ')}
                        </span>
                      ))}
                      {lookItems.length > 3 && <span className="text-xs" style={{ color: '#c4b5a0' }}>+{lookItems.length - 3}</span>}
                    </div>
                    <button onClick={() => rejectLook(look.id)} className="text-xs opacity-30 hover:opacity-70 ml-2" style={{ color: '#8a8078' }}>×</button>
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="flex-1 h-full px-6 py-6 overflow-auto">
            {looksLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4" style={{ borderColor: '#c9967f', borderTopColor: 'transparent' }} />
                <p className="text-sm" style={{ color: '#8a8078' }}>Building your looks…</p>
              </div>
            ) : validLooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-5xl mb-4">✨</div>
                <p className="font-display text-xl font-semibold mb-2" style={{ color: '#2c2c2c' }}>No looks yet</p>
                <p className="text-sm" style={{ color: '#8a8078' }}>
                  {owned.length < 3
                    ? `Own at least 3 items for complete outfit looks — you have ${owned.length} so far.`
                    : 'Looks will appear as you add owned items.'}
                </p>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="mb-6 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-medium" style={{ color: '#8a8078' }}>Occasion:</span>
                    {['all', 'casual', 'work', 'evening', 'weekend', 'formal'].map(occ => (
                      <button key={occ} onClick={() => setFilterOccasion(occ)}
                        className="text-xs px-3 py-1 rounded-full capitalize transition-all"
                        style={filterOccasion === occ
                          ? { background: '#c9967f', color: 'white' }
                          : { background: 'white', color: '#8a8078', border: '1px solid #f0e8e0' }}>
                        {occ === 'all' ? 'All occasions' : occ}
                      </button>
                    ))}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => setShuffleSeed(s => s + 1)}
                        className="text-xs px-3 py-1.5 rounded-full font-medium transition-all hover:scale-105 flex items-center gap-1.5"
                        style={{ background: shuffleSeed > 0 ? '#c9967f' : 'white', color: shuffleSeed > 0 ? 'white' : '#8a8078', border: '1px solid #f0e8e0' }}
                        title="Shuffle looks">
                        🔀 Shuffle
                      </button>
                      <button onClick={downloadExcel}
                        className="text-xs px-3 py-1.5 rounded-full font-medium transition-all hover:scale-105 flex items-center gap-1.5"
                        style={{ background: 'white', color: '#8a8078', border: '1px solid #f0e8e0' }}
                        title="Download as Excel">
                        ⬇ Excel
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-medium" style={{ color: '#8a8078' }}>Temperature:</span>
                    {['all', 'warm', 'cool', 'cold', 'layered'].map(tmp => (
                      <button key={tmp} onClick={() => setFilterTemp(tmp)}
                        className="text-xs px-3 py-1 rounded-full capitalize transition-all"
                        style={filterTemp === tmp
                          ? { background: '#c9967f', color: 'white' }
                          : { background: 'white', color: '#8a8078', border: '1px solid #f0e8e0' }}>
                        {tmp === 'all' ? 'All temps' : `${TEMP_CONFIG[tmp]?.emoji} ${tmp}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pending review */}
                {filteredPending.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full" style={{ background: '#e8c84a' }} />
                      <p className="font-semibold text-sm" style={{ color: '#2c2c2c' }}>Review new looks ({filteredPending.length})</p>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#fef9ec', color: '#b07d2a' }}>Tap to preview · Keep or skip</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredPending.map(look => <LookCard key={look.id} look={look} pending={true} />)}
                    </div>
                  </div>
                )}

                {/* Approved looks */}
                {filteredApproved.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full" style={{ background: '#a8b5a0' }} />
                      <p className="font-semibold text-sm" style={{ color: '#2c2c2c' }}>My looks ({filteredApproved.length})</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredApproved.map(look => <LookCard key={look.id} look={look} pending={false} />)}
                    </div>
                  </div>
                )}

                {filteredPending.length === 0 && filteredApproved.length === 0 && (
                  <p className="text-center py-12 text-sm" style={{ color: '#c4b5a0' }}>No looks match these filters.</p>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ── LOOK MODAL ── */}
      {expandedLook && (() => {
        const look = expandedLook;
        const lookItems = parseLookIds(look).map(iid => items.find(i => i.id === iid)).filter(Boolean) as WardrobeItem[];
        const TEMP_CONFIG: Record<string, { label: string; emoji: string; bg: string; color: string }> = {
          warm:    { label: 'Warm',    emoji: '☀️',  bg: '#fef9ec', color: '#b07d2a' },
          cool:    { label: 'Cool',    emoji: '🍂',  bg: '#eef3ec', color: '#5a7a5a' },
          cold:    { label: 'Cold',    emoji: '❄️',  bg: '#f0f4fb', color: '#4a6abf' },
          layered: { label: 'Layered', emoji: '🧣',  bg: '#f5f0fb', color: '#7c5cbf' },
        };
        const tempCfg = TEMP_CONFIG[look.temperature];
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setExpandedLook(null)}>
            <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
              style={{ background: 'white' }}
              onClick={e => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display text-xl font-semibold" style={{ color: '#2c2c2c' }}>{look.name}</h2>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="text-xs px-2.5 py-1 rounded-full capitalize" style={{ background: '#f5ece4', color: '#c9967f' }}>{look.occasion}</span>
                      {tempCfg && <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: tempCfg.bg, color: tempCfg.color }}>{tempCfg.emoji} {tempCfg.label}</span>}
                    </div>
                  </div>
                  <button onClick={() => setExpandedLook(null)} className="text-xl leading-none p-1" style={{ color: '#8a8078' }}>×</button>
                </div>
                {look.description && (
                  <p className="text-sm leading-relaxed mb-5" style={{ color: '#8a8078' }}>{look.description}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {lookItems.map(item => {
                    const { bg } = getItemBg(item);
                    return (
                      <div key={item.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0e8e0' }}>
                        {item.image_path ? (
                          <Image src={item.image_path} alt={item.name} width={200} height={200} className="w-full object-cover" style={{ height: 180 }} />
                        ) : (
                          <div className="flex items-center justify-center text-4xl" style={{ height: 180, background: bg }}>
                            {catEmoji(item.category)}
                          </div>
                        )}
                        <div className="p-2.5">
                          <p className="text-xs font-semibold leading-tight" style={{ color: '#2c2c2c' }}>{item.name}</p>
                          {item.colors && <p className="text-xs mt-0.5" style={{ color: '#c4b5a0' }}>{item.colors.split(',')[0].trim()}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!look.is_approved && (
                  <div className="flex gap-2 mt-5">
                    <button onClick={() => { approveLook(look.id); setExpandedLook(null); }}
                      className="flex-1 py-3 rounded-2xl font-medium text-sm transition-all hover:scale-105"
                      style={{ background: 'linear-gradient(135deg, #c9967f, #a8b5a0)', color: 'white' }}>
                      ✓ Keep this look
                    </button>
                    <button onClick={() => { rejectLook(look.id); setExpandedLook(null); }}
                      className="py-3 px-4 rounded-2xl font-medium text-sm"
                      style={{ background: '#faf6f2', color: '#b0a090' }}>
                      Skip
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      </div>{/* end tab content area */}

      {/* Hidden inputs */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e)} />
    </div>
  );
}
