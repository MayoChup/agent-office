import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../kantor/api';
import { FunnelBerita, type Related, type Fokus } from './FunnelBerita';
import { Info as InfoI } from './InfoI';

interface Berita { id: string; t: string; tgl: string; url: string; sent: number; saham: string[] }
interface Saham { s: string; n: number; nama: string; chg: number; sektor: string }
interface Data { total: number; at: number; berita: Berita[]; saham: Saham[]; related: Related | null; pantau: string[] }
type Mode = 'direct' | 'gabung' | 'related';
type Sent = 'semua' | 'pos' | 'neg';
/** Satu "berita" di peta: news direct (artikel yang menyebut saham) atau news related (info unik dari berita dunia). */
interface Item { id: string; jenis: 'direct' | 'related'; label: string; url?: string; tgl?: string; sub?: string }
interface Tautan { item: string; s: string; arah: number; alasan?: string }
interface Node { id: string; jenis: 'pusat' | 'berita' | 'saham'; x: number; y: number; z: number; r: number; label: string; item?: Item; s?: string }

const KUNING = '#facc15', BIRU = '#38bdf8', PINK = '#f472b6';
const TEKS_DIRECT = 'News direct: berita yang langsung menyebut saham itu (kode atau nama perusahaannya ada di judul). Sentimennya dinilai per berita.';
const TEKS_RELATED = 'News related: kejadian dunia yang tidak menyebut sahamnya, tapi diperkirakan merembet lewat sektor/industri (efek domino). Satu titik = satu info unik, walau diberitakan banyak media.';

/** "Tata surya" berita: matahari = semua berita, cincin dalam = berita/info, cincin luar = saham. Seret untuk memutar. */
export function PetaBerita({ onOpen }: { onOpen: (s: string) => void }) {
    const { data, error, loading } = useApi<Data>('/api/kantor/peta-berita', 600_000);
    const [modeDipilih, setMode] = useState<Mode>(() => { try { return (localStorage.getItem('kantor:peta-mode') as Mode) || 'gabung'; } catch { return 'gabung'; } });
    const [sent, setSent] = useState<Sent>('semua');
    // Kalau News related belum ada, tampil sebagai News direct.
    const mode: Mode = data && !data.related ? 'direct' : modeDipilih;
    const [pilih, setPilih] = useState<Node | null>(null);
    const [hover, setHover] = useState<Node | null>(null);
    const [putar, setPutar] = useState(true);
    const [funnel, setFunnel] = useState<Fokus | null>(null);
    const cv = useRef<HTMLCanvasElement>(null);
    const st = useRef({ a: 0, tilt: -0.42, drag: false, lx: 0, ly: 0, moved: 0, zoom: 1 });
    const proj = useRef<Array<{ n: Node; sx: number; sy: number; sr: number }>>([]);
    const gantiMode = (m: Mode) => { setMode(m); setPilih(null); try { localStorage.setItem('kantor:peta-mode', m); } catch { /* */ } };

    /** Berita & tautan sesuai saklar mode + filter sentimen. */
    const g = useMemo(() => {
        const items: Item[] = [], tautan: Tautan[] = [];
        const lolos = (a: number) => sent === 'semua' || (sent === 'pos' ? a > 0 : a < 0);
        if (data && mode !== 'related') for (const b of data.berita) {
            const ts = b.saham.map((s) => ({ item: b.id, s, arah: Math.sign(b.sent) })).filter((t) => lolos(t.arah));
            if (ts.length) { items.push({ id: b.id, jenis: 'direct', label: b.t, url: b.url, tgl: b.tgl }); tautan.push(...ts); }
        }
        if (data?.related && mode !== 'direct') for (const i of data.related.info) {
            const per = new Map<string, Tautan>();
            for (const d of i.dampak) for (const s of d.saham) {
                if (!lolos(d.arah)) continue;
                const lama = per.get(s); if (!lama || Math.abs(d.arah) > Math.abs(lama.arah)) per.set(s, { item: i.id, s, arah: Math.sign(d.arah), alasan: d.alasan });
            }
            if (per.size) { items.push({ id: i.id, jenis: 'related', label: i.judul, sub: i.ringkas }); tautan.push(...per.values()); }
        }
        // Peringkat saham: berapa berita yang berpengaruh (positif/negatif) ke tiap saham.
        const rank = new Map<string, { pos: number; neg: number; net: number }>();
        for (const t of tautan) { const e = rank.get(t.s) || { pos: 0, neg: 0, net: 0 }; if (t.arah > 0) e.pos++; else if (t.arah < 0) e.neg++; else e.net++; rank.set(t.s, e); }
        const saham = [...rank.entries()].map(([s, v]) => ({ s, ...v, total: v.pos + v.neg + v.net })).sort((a, b) => b.total - a.total || b.pos - a.pos).slice(0, 80);
        const ada = new Set(saham.map((x) => x.s));
        return { items, tautan: tautan.filter((t) => ada.has(t.s)), saham };
    }, [data, mode, sent]);
    const infoSaham = (s: string) => { const a = data?.saham.find((x) => x.s === s); const b = data?.related?.meta[s]; return { nama: a?.nama || b?.nama || s, chg: a?.chg ?? b?.chg ?? 0 }; };

    const nodes = useMemo(() => {
        if (!data) return [] as Node[];
        const out: Node[] = [{ id: 'pusat', jenis: 'pusat', x: 0, y: 0, z: 0, r: 14, label: `Semua berita · ${g.items.length}` }];
        const per = new Map<string, number>(); for (const t of g.tautan) per.set(t.item, (per.get(t.item) || 0) + 1);
        const nb = g.items.length;
        g.items.forEach((it, i) => {
            const ang = (i / Math.max(1, nb)) * Math.PI * 2;
            const ring = 150 + (i % 3) * 26;
            out.push({ id: it.id, jenis: 'berita', x: Math.cos(ang) * ring, y: ((i % 5) - 2) * 6, z: Math.sin(ang) * ring, r: 3 + Math.min(6, (per.get(it.id) || 1) * 1.2), label: it.label, item: it });
        });
        const ns = g.saham.length;
        g.saham.forEach((s, i) => {
            const ang = (i / Math.max(1, ns)) * Math.PI * 2 + 0.2;
            const ring = 260 + (i % 4) * 22;
            out.push({ id: `s:${s.s}`, jenis: 'saham', x: Math.cos(ang) * ring, y: Math.sin(i * 1.7) * 110, z: Math.sin(ang) * ring, r: 2.5 + Math.min(7, s.total * 1.3), label: s.s, s: s.s });
        });
        return out;
    }, [data, g]);
    const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
    const tetangga = useMemo(() => {
        const m = new Map<string, Set<string>>();
        const add = (a: string, b: string) => { m.set(a, (m.get(a) || new Set()).add(b)); };
        for (const t of g.tautan) { add(t.item, `s:${t.s}`); add(`s:${t.s}`, t.item); }
        return m;
    }, [g]);
    useEffect(() => { if (pilih && !byId.has(pilih.id)) setPilih(null); }, [byId, pilih]);

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
            ctx.lineWidth = 1;
            for (const [r, col] of [[163, 'rgba(250,204,21,0.18)'], [293, 'rgba(244,114,182,0.14)']] as Array<[number, string]>) {
                ctx.beginPath();
                for (let k = 0; k <= 96; k++) { const t = (k / 96) * Math.PI * 2; const p = P({ x: Math.cos(t) * r, y: 0, z: Math.sin(t) * r }); k ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }
                ctx.strokeStyle = col; ctx.stroke();
            }
            const pr = nodes.map((n) => ({ n, ...P(n) }));
            const map = new Map(pr.map((p): [string, typeof p] => [p.n.id, p]));
            const fokus = pilih || hover;
            const dekat = fokus ? tetangga.get(fokus.id) || new Set<string>() : null;
            // Garis berita → saham: hijau = positif, merah = negatif, pink = netral.
            for (const t of g.tautan) {
                const a = map.get(t.item), z = map.get(`s:${t.s}`); if (!a || !z) continue;
                const on = fokus && (fokus.id === t.item || fokus.id === `s:${t.s}`);
                if (fokus && !on) continue;
                const warna = t.arah > 0 ? '74,222,128' : t.arah < 0 ? '248,113,113' : '244,114,182';
                ctx.beginPath(); ctx.moveTo(a.sx, a.sy);
                ctx.quadraticCurveTo((a.sx + z.sx) / 2, Math.min(a.sy, z.sy) - 40 * scale, z.sx, z.sy);
                ctx.strokeStyle = `rgba(${warna},${on ? 0.85 : 0.12})`;
                ctx.lineWidth = on ? 1.4 : 0.7; ctx.stroke();
            }
            pr.sort((p, q) => q.z - p.z);
            const kecil = W < 600;
            const label: Array<{ txt: string; x: number; y: number; jenis: string; z: number; w: number }> = [];
            const banyak = new Map<string, number>(); for (const t of g.tautan) banyak.set(t.item, (banyak.get(t.item) || 0) + 1);
            for (const p of pr) {
                const n = p.n, r = n.r * p.f * Math.max(0.7, scale);
                const redup = dekat && !(dekat.has(n.id) || fokus!.id === n.id || n.jenis === 'pusat');
                ctx.globalAlpha = redup ? 0.18 : 1;
                const col = n.jenis === 'pusat' ? '#fb923c' : n.jenis === 'berita' ? (n.item?.jenis === 'related' ? BIRU : KUNING) : PINK;
                const gr = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3);
                gr.addColorStop(0, col); gr.addColorStop(0.35, col + 'aa'); gr.addColorStop(1, col + '00');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1.2, r * 0.45), 0, Math.PI * 2); ctx.fill();
                const tampil = n.jenis === 'pusat' || n.jenis === 'saham' || (n.jenis === 'berita' && (!dekat ? (banyak.get(n.id) || 0) >= (kecil ? 4 : 3) : !redup));
                if (tampil && !redup) {
                    const max = kecil ? 22 : 34;
                    const txt = n.jenis === 'berita' ? (n.label.length > max ? `${n.label.slice(0, max - 1)}…` : n.label) : n.label;
                    label.push({ txt, x: p.sx + r + 4, y: p.sy + 3.5, jenis: n.jenis, z: p.z, w: txt.length * 6.4 });
                }
            }
            ctx.globalAlpha = 1;
            const urut = { pusat: 0, saham: 1, berita: 2 } as Record<string, number>;
            label.sort((a, b) => urut[a.jenis] - urut[b.jenis] || a.z - b.z);
            const kotak: Array<[number, number, number, number]> = [];
            for (const l of label) {
                const k: [number, number, number, number] = [l.x - 2, l.y - 10, l.x + l.w + 2, l.y + 3];
                if (l.jenis !== 'pusat' && kotak.some((q) => k[0] < q[2] && k[2] > q[0] && k[1] < q[3] && k[3] > q[1])) continue;
                kotak.push(k);
                ctx.font = `${l.jenis === 'saham' ? 600 : 500} ${l.jenis === 'pusat' ? 12 : 10.5}px 'JetBrains Mono', monospace`;
                ctx.fillStyle = l.jenis === 'saham' ? '#fbcfe8' : l.jenis === 'pusat' ? '#fed7aa' : '#fef9c3';
                ctx.fillText(l.txt, l.x, l.y);
            }
            proj.current = pr.map((p) => ({ n: p.n, sx: p.sx, sy: p.sy, sr: Math.max(8, p.n.r * p.f * scale + 6) }));
            raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [nodes, pilih, hover, putar, tetangga, g]);

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

    const tanda = (a: number) => (a > 0 ? '+' : a < 0 ? '−' : '•');
    const kelas = (a: number) => (a > 0 ? 'pos' : a < 0 ? 'neg' : '');
    const maks = g.saham[0]?.total || 1;
    const adaRelated = !!data?.related;

    return (
        <>
            <section className="sb-hero row-hero">
                <div><h1>Peta berita</h1><p>Matahari = semua berita, titik <b style={{ color: KUNING }}>kuning</b> = news direct, titik <b style={{ color: BIRU }}>biru</b> = news related (info unik), titik pink = saham. Garis hijau = berdampak positif, merah = negatif. Seret untuk memutar, ketuk titik untuk detail.</p></div>
            </section>
            <div className="pb-saklar">
                <div className="seg" role="radiogroup" aria-label="Jenis berita">
                    <button role="radio" aria-checked={mode === 'direct'} className={mode === 'direct' ? 'on' : ''} onClick={() => gantiMode('direct')}>News direct</button>
                    <button role="radio" aria-checked={mode === 'gabung'} className={mode === 'gabung' ? 'on' : ''} onClick={() => gantiMode('gabung')} disabled={!adaRelated}>Direct + related</button>
                    <button role="radio" aria-checked={mode === 'related'} className={mode === 'related' ? 'on' : ''} onClick={() => gantiMode('related')} disabled={!adaRelated}>News related</button>
                </div>
                <InfoI teks={`${TEKS_DIRECT}\n\n${TEKS_RELATED}`} />
                <div className="seg" role="radiogroup" aria-label="Sentimen">
                    {([['semua', 'All'], ['pos', 'Positive'], ['neg', 'Negative']] as Array<[Sent, string]>).map(([k, l]) => <button key={k} role="radio" aria-checked={sent === k} className={`${sent === k ? 'on' : ''} ${k}`} onClick={() => { setSent(k); setPilih(null); }}>{l}</button>)}
                </div>
                {!adaRelated && <small className="sb-note">News related belum ada (fitur mati atau belum dipetakan).</small>}
            </div>
            {error && <div className="error">Gagal memuat: {error}</div>}
            {loading && !data && <div className="fin-empty">Memuat peta…</div>}
            {data && g.items.length === 0 && <div className="sb-card fin-empty">Tidak ada berita untuk pilihan ini. {mode === 'direct' ? 'Berita diambil setelah data pasar diperbarui (tombol ↻ di atas).' : 'Coba ganti filter sentimen atau mode.'}</div>}
            {data && g.items.length > 0 && (
                <div className="pb">
                    <div className="pb-canvas">
                        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={(e) => { st.current.zoom = Math.max(0.6, Math.min(2.4, st.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }} />
                        <div className="pb-hud mono">berita {g.items.length} · saham {g.saham.length}</div>
                        <div className="pb-ctrl">
                            <button onClick={() => setPutar(!putar)}>{putar ? '⏸' : '▶'}</button>
                            <button onClick={() => { st.current.zoom = Math.min(2.4, st.current.zoom * 1.2); }}>＋</button>
                            <button onClick={() => { st.current.zoom = Math.max(0.6, st.current.zoom / 1.2); }}>－</button>
                        </div>
                    </div>
                    <aside className="sb-card pb-side">
                        {!pilih && (
                            <>
                                <h3>Berita yang berpengaruh ke saham <InfoI teks={`Jumlah berita (${mode === 'direct' ? 'news direct' : mode === 'related' ? 'news related' : 'news direct + related'}) yang berdampak ke tiap saham, sesuai filter ${sent === 'semua' ? 'semua sentimen' : sent === 'pos' ? 'positif' : 'negatif'}. ▲ = positif, ▼ = negatif.`} /></h3>
                                {g.saham.slice(0, 15).map((s) => (
                                    <button key={s.s} className="pb-row" onClick={() => setPilih(byId.get(`s:${s.s}`) || null)}>
                                        <b className="mono">{s.s}</b><small>{infoSaham(s.s).nama}</small>
                                        <span className="mono pb-pn">{s.pos > 0 && <em className="up">▲{s.pos}</em>}{s.neg > 0 && <em className="down">▼{s.neg}</em>}{s.net > 0 && <em>•{s.net}</em>}</span>
                                        <i style={{ width: `${(s.total / maks) * 100}%` }} />
                                    </button>
                                ))}
                            </>
                        )}
                        {pilih?.jenis === 'saham' && pilih.s && (() => {
                            const s = pilih.s, inf = infoSaham(s);
                            const list = g.tautan.filter((t) => t.s === s).map((t) => ({ t, it: g.items.find((x) => x.id === t.item)! })).filter((x) => x.it);
                            const ar = [...new Set(list.filter((x) => x.it.jenis === 'related' && x.t.arah).map((x) => x.t.arah))] as Array<1 | -1>;
                            return (
                                <>
                                    <div className="pb-head"><span className="pb-dot pink" /><b className="mono">{s}</b><button onClick={() => setPilih(null)}>✕</button></div>
                                    <div className="pb-sub">{inf.nama} · <span className={inf.chg >= 0 ? 'up' : 'down'}>{inf.chg >= 0 ? '+' : ''}{inf.chg.toFixed(2)}%</span></div>
                                    <div className="pb-big"><b className="mono">{list.length}</b><span>berita berpengaruh ({list.filter((x) => x.t.arah > 0).length} positif, {list.filter((x) => x.t.arah < 0).length} negatif)</span></div>
                                    {list.map(({ t, it }) => it.jenis === 'direct'
                                        ? <a key={it.id} className="pb-news" href={it.url} target="_blank" rel="noreferrer"><span className={`sent ${kelas(t.arah)}`}>{tanda(t.arah)}</span><span><small className="pb-jenis">direct</small> {it.label}</span><small className="mono">{it.tgl}</small></a>
                                        : <button key={it.id} className="pb-news" onClick={() => setFunnel({ nama: s, arah: t.arah > 0 ? 1 : -1 })}><span className={`sent ${kelas(t.arah)}`}>{tanda(t.arah)}</span><span><small className="pb-jenis rel">related</small> {it.label}{t.alasan && <em> — {t.alasan}</em>}</span></button>)}
                                    <div className="pb-aksi">
                                        {ar.map((a) => <button key={a} className="btn small" onClick={() => setFunnel({ nama: s, arah: a })}>Kenapa {s} {a > 0 ? 'positif' : 'negatif'}?</button>)}
                                        <button className="btn primary small" onClick={() => onOpen(s)}>Buka {s}</button>
                                    </div>
                                </>
                            );
                        })()}
                        {pilih?.jenis === 'berita' && pilih.item && (() => {
                            const it = pilih.item, ts = g.tautan.filter((t) => t.item === it.id);
                            const info = it.jenis === 'related' ? data.related?.info.find((x) => x.id === it.id) : null;
                            const art = new Map((data.related?.artikel || []).map((a) => [a.id, a]));
                            return (
                                <>
                                    <div className="pb-head"><span className={`pb-dot ${it.jenis === 'related' ? 'biru' : 'kuning'}`} /><b>{it.jenis === 'related' ? 'News related' : 'News direct'}</b><button onClick={() => setPilih(null)}>✕</button></div>
                                    {it.url ? <a className="pb-title" href={it.url} target="_blank" rel="noreferrer">{it.label}</a> : <b className="pb-title">{it.label}</b>}
                                    {it.sub && <p className="pb-sub">{it.sub}</p>}
                                    {info && <div className="pb-sub">Dirangkum dari {info.bukti.length} berita: {info.bukti.slice(0, 6).map((id) => art.get(id)).filter(Boolean).map((a) => <a key={a!.id} href={a!.url} target="_blank" rel="noreferrer" className="pb-src">{a!.sumber || 'berita'}</a>)}</div>}
                                    <div className="pb-big"><b className="mono">{ts.length}</b><span>saham terdampak</span></div>
                                    <div className="pb-chips">{ts.map((t) => <button key={t.s} onClick={() => setPilih(byId.get(`s:${t.s}`) || null)} className={`mono ${kelas(t.arah)}`}>{tanda(t.arah)} {t.s}</button>)}</div>
                                </>
                            );
                        })()}
                    </aside>
                </div>
            )}
            {funnel && data?.related && (
                <div className="fb-modal" onClick={(e) => { if (e.target === e.currentTarget) setFunnel(null); }} role="dialog" aria-modal="true">
                    <div className="fb-modal-isi">
                        <div className="pb-head"><b>Kenapa {funnel.nama} {funnel.arah > 0 ? 'positif' : 'negatif'}?</b><button onClick={() => setFunnel(null)}>✕</button></div>
                        <FunnelBerita r={data.related} fokus={funnel} />
                    </div>
                </div>
            )}
        </>
    );
}
