import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../kantor/api';

interface Berita { id: string; t: string; tgl: string; url: string; sent: number; saham: string[] }
interface Saham { s: string; n: number; nama: string; chg: number; sektor: string }
interface Data { total: number; at: number; berita: Berita[]; saham: Saham[] }
interface Node { id: string; jenis: 'pusat' | 'berita' | 'saham'; x: number; y: number; z: number; r: number; label: string; ref?: Berita | Saham }

const KUNING = '#facc15', PINK = '#f472b6';

/** "Tata surya" berita: matahari = semua berita, cincin dalam = berita, cincin luar = saham. Seret untuk memutar. */
export function PetaBerita({ onOpen }: { onOpen: (s: string) => void }) {
    const { data, error, loading } = useApi<Data>('/api/kantor/peta-berita', 600_000);
    const [pilih, setPilih] = useState<Node | null>(null);
    const [hover, setHover] = useState<Node | null>(null);
    const [putar, setPutar] = useState(true);
    const cv = useRef<HTMLCanvasElement>(null);
    const st = useRef({ a: 0, tilt: -0.42, drag: false, lx: 0, ly: 0, moved: 0, zoom: 1 });
    const proj = useRef<Array<{ n: Node; sx: number; sy: number; sr: number }>>([]);

    const nodes = useMemo(() => {
        if (!data) return [] as Node[];
        const out: Node[] = [{ id: 'pusat', jenis: 'pusat', x: 0, y: 0, z: 0, r: 14, label: `Semua berita · ${data.total}` }];
        const nb = data.berita.length;
        data.berita.forEach((b, i) => {
            const ang = (i / Math.max(1, nb)) * Math.PI * 2;
            const ring = 150 + (i % 3) * 26;
            out.push({ id: b.id, jenis: 'berita', x: Math.cos(ang) * ring, y: ((i % 5) - 2) * 6, z: Math.sin(ang) * ring, r: 3 + Math.min(6, b.saham.length * 1.2), label: b.t, ref: b });
        });
        const ns = data.saham.length;
        data.saham.forEach((s, i) => {
            const ang = (i / Math.max(1, ns)) * Math.PI * 2 + 0.2;
            const ring = 260 + (i % 4) * 22;
            const lift = Math.sin(i * 1.7) * 110; // menyebar ke atas/bawah seperti kulit bola
            out.push({ id: `s:${s.s}`, jenis: 'saham', x: Math.cos(ang) * ring, y: lift, z: Math.sin(ang) * ring, r: 2.5 + Math.min(7, s.n * 1.3), label: s.s, ref: s });
        });
        return out;
    }, [data]);
    const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

    const tetangga = useMemo(() => {
        const m = new Map<string, Set<string>>();
        const add = (a: string, b: string) => { m.set(a, (m.get(a) || new Set()).add(b)); };
        for (const b of data?.berita || []) for (const s of b.saham) { add(b.id, `s:${s}`); add(`s:${s}`, b.id); }
        return m;
    }, [data]);

    useEffect(() => {
        const c = cv.current; if (!c || !nodes.length) return;
        let raf = 0;
        const ctx = c.getContext('2d')!;
        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const W = c.clientWidth, H = c.clientHeight;
            if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            const s = st.current;
            if (putar && !s.drag && !pilih) s.a += 0.0016;
            const scale = (Math.min(W, H) / 700) * s.zoom;
            const cx = W / 2, cy = H / 2 + 10;
            const ca = Math.cos(s.a), sa = Math.sin(s.a), ct = Math.cos(s.tilt), stt = Math.sin(s.tilt);
            const P = (n: { x: number; y: number; z: number }) => {
                const x1 = n.x * ca + n.z * sa, z1 = -n.x * sa + n.z * ca;
                const y2 = n.y * ct - z1 * stt, z2 = n.y * stt + z1 * ct;
                const f = 900 / (900 + z2 * scale);
                return { sx: cx + x1 * scale * f, sy: cy + y2 * scale * f, f, z: z2 };
            };
            // Orbit (cincin)
            ctx.lineWidth = 1;
            for (const [r, col] of [[163, 'rgba(250,204,21,0.18)'], [293, 'rgba(244,114,182,0.14)']] as Array<[number, string]>) {
                ctx.beginPath();
                for (let k = 0; k <= 96; k++) { const t = (k / 96) * Math.PI * 2; const p = P({ x: Math.cos(t) * r, y: 0, z: Math.sin(t) * r }); k ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }
                ctx.strokeStyle = col; ctx.stroke();
            }
            const pr = nodes.map((n) => ({ n, ...P(n) }));
            const map = new Map(pr.map((p) => [p.n.id, p]));
            const fokus = pilih || hover;
            const dekat = fokus ? tetangga.get(fokus.id) || new Set<string>() : null;
            // Garis berita → saham (melengkung seperti lintasan)
            for (const b of data?.berita || []) {
                const a = map.get(b.id); if (!a) continue;
                for (const sym of b.saham) {
                    const z = map.get(`s:${sym}`); if (!z) continue;
                    const on = fokus && (fokus.id === b.id || fokus.id === `s:${sym}`);
                    if (fokus && !on) continue;
                    ctx.beginPath(); ctx.moveTo(a.sx, a.sy);
                    ctx.quadraticCurveTo((a.sx + z.sx) / 2, Math.min(a.sy, z.sy) - 40 * scale, z.sx, z.sy);
                    ctx.strokeStyle = on ? 'rgba(244,114,182,0.85)' : 'rgba(244,114,182,0.10)';
                    ctx.lineWidth = on ? 1.4 : 0.7; ctx.stroke();
                }
            }
            // Titik, dari belakang ke depan
            pr.sort((p, q) => q.z - p.z);
            const kecil = W < 600;
            for (const p of pr) {
                const n = p.n, r = n.r * p.f * Math.max(0.7, scale);
                const redup = dekat && !(dekat.has(n.id) || fokus!.id === n.id || n.jenis === 'pusat');
                ctx.globalAlpha = redup ? 0.18 : 1;
                const col = n.jenis === 'pusat' ? '#fb923c' : n.jenis === 'berita' ? KUNING : PINK;
                const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3);
                g.addColorStop(0, col); g.addColorStop(0.35, col + 'aa'); g.addColorStop(1, col + '00');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1.2, r * 0.45), 0, Math.PI * 2); ctx.fill();
                const tampil = n.jenis === 'pusat' || n.jenis === 'saham' && (!kecil || ((n.ref as Saham).n >= 2)) || (n.jenis === 'berita' && (!dekat ? (n.ref as Berita).saham.length >= (kecil ? 4 : 3) : !redup));
                if (tampil && !redup) {
                    ctx.font = `${n.jenis === 'saham' ? 600 : 500} ${n.jenis === 'pusat' ? 12 : 10.5}px 'JetBrains Mono', monospace`;
                    ctx.fillStyle = n.jenis === 'saham' ? '#fbcfe8' : n.jenis === 'pusat' ? '#fed7aa' : '#fef9c3';
                    const txt = n.jenis === 'berita' ? (n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label) : n.label;
                    ctx.fillText(txt, p.sx + r + 4, p.sy + 3.5);
                }
            }
            ctx.globalAlpha = 1;
            proj.current = pr.map((p) => ({ n: p.n, sx: p.sx, sy: p.sy, sr: Math.max(8, p.n.r * p.f * scale + 6) }));
            raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [nodes, pilih, hover, putar, tetangga, data]);

    const kena = (e: { clientX: number; clientY: number }) => {
        const r = cv.current!.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        let best: Node | null = null, bd = Infinity;
        for (const p of proj.current) { const d = Math.hypot(p.sx - x, p.sy - y); if (d < p.sr && d < bd) { bd = d; best = p.n; } }
        return best;
    };
    const down = (e: React.PointerEvent) => { const s = st.current; s.drag = true; s.lx = e.clientX; s.ly = e.clientY; s.moved = 0; (e.target as Element).setPointerCapture(e.pointerId); };
    const move = (e: React.PointerEvent) => {
        const s = st.current;
        if (s.drag) {
            s.a -= (e.clientX - s.lx) * 0.006; s.tilt = Math.max(-1.3, Math.min(0.3, s.tilt + (e.clientY - s.ly) * 0.004));
            s.moved += Math.abs(e.clientX - s.lx) + Math.abs(e.clientY - s.ly); s.lx = e.clientX; s.ly = e.clientY;
        } else if (e.pointerType === 'mouse') setHover(kena(e));
    };
    const up = (e: React.PointerEvent) => { const s = st.current; s.drag = false; if (s.moved < 6) { const n = kena(e); setPilih(n && n.jenis !== 'pusat' ? n : null); } };

    const terkait = (b: Berita) => (data?.berita || []).filter((x) => x.id !== b.id && x.saham.some((s) => b.saham.includes(s)));
    const ref = pilih?.ref;

    return (
        <>
            <section className="sb-hero row-hero">
                <div><h1>Peta berita</h1><p>Matahari = semua berita pekan ini, titik kuning = berita, titik pink = saham. Garis menunjukkan berita menyebut saham mana. Seret untuk memutar, ketuk titik untuk detail.</p></div>
            </section>
            {error && <div className="error">Gagal memuat: {error}</div>}
            {loading && !data && <div className="fin-empty">Memuat peta…</div>}
            {data && data.berita.length === 0 && <div className="sb-card fin-empty">Belum ada berita. Berita diambil setelah data pasar diperbarui (tombol ↻ di atas).</div>}
            {data && data.berita.length > 0 && (
                <div className="pb">
                    <div className="pb-canvas">
                        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={(e) => { st.current.zoom = Math.max(0.6, Math.min(2.4, st.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }} />
                        <div className="pb-hud mono">berita {data.berita.length} · saham {data.saham.length} · total {data.total}</div>
                        <div className="pb-ctrl">
                            <button onClick={() => setPutar(!putar)}>{putar ? '⏸' : '▶'}</button>
                            <button onClick={() => { st.current.zoom = Math.min(2.4, st.current.zoom * 1.2); }}>＋</button>
                            <button onClick={() => { st.current.zoom = Math.max(0.6, st.current.zoom / 1.2); }}>－</button>
                        </div>
                    </div>
                    <aside className="sb-card pb-side">
                        {!pilih && (
                            <>
                                <h3>Paling sering disebut</h3>
                                {data.saham.slice(0, 12).map((s) => (
                                    <button key={s.s} className="pb-row" onClick={() => setPilih(byId.get(`s:${s.s}`) || null)}>
                                        <b className="mono">{s.s}</b><small>{s.nama}</small><span className="mono">{s.n}×</span>
                                        <i style={{ width: `${(s.n / data.saham[0].n) * 100}%` }} />
                                    </button>
                                ))}
                            </>
                        )}
                        {pilih?.jenis === 'saham' && ref && (() => {
                            const s = ref as Saham;
                            const list = data.berita.filter((b) => b.saham.includes(s.s));
                            return (
                                <>
                                    <div className="pb-head"><span className="pb-dot pink" /><b className="mono">{s.s}</b><button onClick={() => setPilih(null)}>✕</button></div>
                                    <div className="pb-sub">{s.nama} · <span className={s.chg >= 0 ? 'up' : 'down'}>{s.chg >= 0 ? '+' : ''}{s.chg.toFixed(2)}%</span></div>
                                    <div className="pb-big"><b className="mono">{list.length}</b><span>kali disebut di berita pekan ini</span></div>
                                    {list.map((b) => <a key={b.id} className="pb-news" href={b.url} target="_blank" rel="noreferrer"><span className={`sent ${b.sent > 0 ? 'pos' : b.sent < 0 ? 'neg' : ''}`}>{b.sent > 0 ? '+' : b.sent < 0 ? '−' : '•'}</span>{b.t}<small className="mono">{b.tgl}</small></a>)}
                                    <button className="btn primary" style={{ marginTop: 10 }} onClick={() => onOpen(s.s)}>Buka {s.s}</button>
                                </>
                            );
                        })()}
                        {pilih?.jenis === 'berita' && ref && (() => {
                            const b = ref as Berita;
                            const rel = terkait(b);
                            return (
                                <>
                                    <div className="pb-head"><span className="pb-dot kuning" /><b>Berita</b><button onClick={() => setPilih(null)}>✕</button></div>
                                    <a className="pb-title" href={b.url} target="_blank" rel="noreferrer">{b.t}</a>
                                    <div className="pb-sub mono">{b.tgl} · sentimen {b.sent > 0 ? 'positif' : b.sent < 0 ? 'negatif' : 'netral'}</div>
                                    <div className="pb-big"><b className="mono">{b.saham.length}</b><span>saham terkait</span></div>
                                    <div className="pb-chips">{b.saham.map((s) => <button key={s} onClick={() => setPilih(byId.get(`s:${s}`) || null)} className="mono">{s} <small>{data.saham.find((x) => x.s === s)?.n || 1}×</small></button>)}</div>
                                    <h4>Berkaitan dengan {rel.length} berita lain</h4>
                                    {rel.slice(0, 8).map((x) => <button key={x.id} className="pb-news" onClick={() => setPilih(byId.get(x.id) || null)}>{x.t}<small className="mono">{x.saham.filter((s) => b.saham.includes(s)).join(', ')}</small></button>)}
                                </>
                            );
                        })()}
                    </aside>
                </div>
            )}
        </>
    );
}
