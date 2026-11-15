import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Baris, ScreenerData, usd } from './types';

type Periode = '1H' | '1M' | '1B' | '3B' | '1T';
const PERIODE: Array<{ k: Periode; label: string }> = [{ k: '1H', label: 'Harian' }, { k: '1M', label: 'Mingguan' }, { k: '1B', label: 'Bulanan' }, { k: '3B', label: '3 bulan' }, { k: '1T', label: '1 tahun' }];
const nilai = (b: Baris, p: Periode) => (p === '1H' ? b.chg1d : p === '1M' ? (b.x?.mom.w1 ?? 0) : p === '1B' ? b.chg1m : p === '3B' ? b.chg3m : b.chg1y);
const SKALA: Record<Periode, number> = { '1H': 3, '1M': 6, '1B': 10, '3B': 20, '1T': 40 };

/** Warna kotak: hijau = naik, merah = turun, makin pekat makin besar geraknya. */
function warna(v: number, max: number) {
    const t = Math.min(1, Math.abs(v) / max);
    if (Math.abs(v) < max * 0.04) return '#3f4651';
    return v > 0 ? `hsl(142, ${45 + t * 30}%, ${34 - t * 14}%)` : `hsl(356, ${50 + t * 30}%, ${40 - t * 16}%)`;
}

interface Kotak { x: number; y: number; w: number; h: number }
/** Treemap "squarified" (Bruls dkk.): kotak sedekat mungkin dengan persegi. */
function squarify<T extends { v: number }>(items: T[], r: Kotak): Array<T & Kotak> {
    const out: Array<T & Kotak> = [];
    const total = items.reduce((a, i) => a + i.v, 0);
    if (!total || r.w <= 0 || r.h <= 0) return out;
    const scale = (r.w * r.h) / total;
    let rest = items.map((i) => ({ ...i, a: i.v * scale })).sort((a, b) => b.a - a.a);
    let { x, y, w, h } = r;
    const worst = (row: number[], side: number) => {
        const s = row.reduce((a, b) => a + b, 0);
        const mx = Math.max(...row), mn = Math.min(...row);
        return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    while (rest.length) {
        const side = Math.min(w, h);
        const row = [rest[0]];
        let i = 1;
        while (i < rest.length && worst([...row, rest[i]].map((z) => z.a), side) <= worst(row.map((z) => z.a), side)) { row.push(rest[i]); i++; }
        const s = row.reduce((a, z) => a + z.a, 0);
        if (w >= h) {
            const cw = s / h; let cy = y;
            for (const z of row) { const ch = z.a / cw; out.push({ ...z, x, y: cy, w: cw, h: ch }); cy += ch; }
            x += cw; w -= cw;
        } else {
            const rh = s / w; let cx = x;
            for (const z of row) { const cw = z.a / rh; out.push({ ...z, x: cx, y, w: cw, h: rh }); cx += cw; }
            y += rh; h -= rh;
        }
        rest = rest.slice(row.length);
    }
    return out;
}

export function PetaPanas({ data, onOpen, watch }: { data: ScreenerData; onOpen: (s: string) => void; watch: string[] }) {
    const [periode, setPeriode] = useState<Periode>('1H');
    const [ukuran, setUkuran] = useState<'kap' | 'rata'>('kap');
    const [lingkup, setLingkup] = useState<'semua' | 'watch'>('semua');
    const [hover, setHover] = useState<{ b: Baris; x: number; y: number } | null>(null);
    const box = useRef<HTMLDivElement>(null);
    const [dim, setDim] = useState({ w: 800, h: 560 });
    useEffect(() => {
        const el = box.current; if (!el) return;
        const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientWidth < 600 ? 640 : Math.max(520, Math.round(el.clientWidth * 0.56)) }));
        ro.observe(el); return () => ro.disconnect();
    }, []);
    const baris = data.baris.filter((b) => lingkup === 'semua' || watch.includes(b.s));
    const max = SKALA[periode];

    const layout = useMemo(() => {
        const sek = new Map<string, Baris[]>();
        for (const b of baris) { const k = b.sektor || 'Lainnya'; sek.set(k, [...(sek.get(k) || []), b]); }
        const size = (b: Baris) => (ukuran === 'kap' ? Math.max(1, b.f?.mcap || 1000) : 1);
        const grup = Array.from(sek.entries()).map(([nama, list]) => ({ nama, list, v: list.reduce((a, b) => a + size(b), 0) }));
        const sektorBox = squarify(grup, { x: 0, y: 0, w: dim.w, h: dim.h });
        return sektorBox.map((g) => {
            const head = g.h > 40 && g.w > 60 ? 18 : 0;
            const tiles = squarify(g.list.map((b) => ({ b, v: size(b) })), { x: g.x + 1, y: g.y + head + 1, w: g.w - 2, h: g.h - head - 2 });
            const avg = g.list.reduce((a, b) => a + nilai(b, periode) * size(b), 0) / Math.max(1, g.list.reduce((a, b) => a + size(b), 0));
            return { ...g, head, tiles, avg };
        });
    }, [baris, dim, ukuran, periode]);

    const urut = [...baris].sort((a, b) => nilai(b, periode) - nilai(a, periode));
    const naik = urut.slice(0, 10), turun = urut.slice(-10).reverse();

    return (
        <>
            <section className="sb-hero row-hero">
                <div><h1>Peta panas</h1><p>Besar kotak = kapitalisasi pasar, warna = naik (hijau) atau turun (merah). Ketuk kotak untuk membuka sahamnya.</p></div>
            </section>
            <div className="sb-tools">
                <div className="sb-seg scroll">{PERIODE.map((p) => <button key={p.k} className={periode === p.k ? 'on' : ''} onClick={() => setPeriode(p.k)}>{p.label}</button>)}</div>
                <div className="sb-seg"><button className={ukuran === 'kap' ? 'on' : ''} onClick={() => setUkuran('kap')}>Kapitalisasi</button><button className={ukuran === 'rata' ? 'on' : ''} onClick={() => setUkuran('rata')}>Sama rata</button></div>
                <div className="sb-seg"><button className={lingkup === 'semua' ? 'on' : ''} onClick={() => setLingkup('semua')}>Semua</button><button className={lingkup === 'watch' ? 'on' : ''} onClick={() => setLingkup('watch')}>Watchlist</button></div>
            </div>
            <div className="hm-legend mono">{[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((t) => <span key={t} style={{ background: warna(t * max, max) }}>{t > 0 ? '+' : t < 0 ? '−' : ''}{Math.abs(Math.round(t * max))}%</span>)}</div>
            <div className="hm" ref={box} style={{ height: dim.h }} onMouseLeave={() => setHover(null)}>
                {layout.map((g) => (
                    <div key={g.nama} className="hm-sek" style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
                        {g.head > 0 && <div className="hm-sek-h"><b>{g.nama}</b><span className="mono">{g.avg >= 0 ? '+' : ''}{g.avg.toFixed(2)}%</span></div>}
                    </div>
                ))}
                {layout.flatMap((g) => g.tiles.map((t) => {
                    const v = nilai(t.b, periode);
                    const big = t.w > 54 && t.h > 34, mid = t.w > 30 && t.h > 18;
                    return (
                        <button key={t.b.s} className="hm-t" style={{ left: t.x, top: t.y, width: Math.max(0, t.w - 1), height: Math.max(0, t.h - 1), background: warna(v, max), fontSize: Math.max(9, Math.min(26, Math.sqrt(t.w * t.h) / 5)) }}
                            onClick={() => onOpen(t.b.s)} onMouseMove={(e) => { const r = box.current!.getBoundingClientRect(); setHover({ b: t.b, x: e.clientX - r.left, y: e.clientY - r.top }); }}>
                            {mid && <b className="mono">{t.b.s}</b>}
                            {big && <span className="mono">{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>}
                        </button>
                    );
                }))}
                {hover && (
                    <div className="hm-tip" style={{ left: Math.min(hover.x + 12, dim.w - 200), top: Math.min(hover.y + 12, dim.h - 90) }}>
                        <b className="mono">{hover.b.s}</b> <small>{hover.b.nama}</small>
                        <div className="mono">{usd(hover.b.harga)} · <span className={nilai(hover.b, periode) >= 0 ? 'up' : 'down'}>{nilai(hover.b, periode) >= 0 ? '+' : ''}{nilai(hover.b, periode).toFixed(2)}%</span></div>
                        <small>{hover.b.sektor}</small>
                    </div>
                )}
            </div>
            <div className="hm-lists">
                {[{ judul: `Naik terbesar · ${PERIODE.find((p) => p.k === periode)!.label.toLowerCase()}`, list: naik }, { judul: `Turun terbesar · ${PERIODE.find((p) => p.k === periode)!.label.toLowerCase()}`, list: turun }].map((x) => (
                    <section key={x.judul} className="sb-card">
                        <h3 className="hm-h">{x.judul}</h3>
                        {x.list.map((b, i) => {
                            const v = nilai(b, periode);
                            return (
                                <button key={b.s} className="hm-row" onClick={() => onOpen(b.s)}>
                                    <span className="mono rank">{i + 1}</span><b className="mono">{b.s}</b><small>{b.nama}</small>
                                    <span className="mono">{usd(b.harga)}</span><em className={`mono ${v >= 0 ? 'up' : 'down'}`}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</em>
                                </button>
                            );
                        })}
                    </section>
                ))}
            </div>
        </>
    );
}
