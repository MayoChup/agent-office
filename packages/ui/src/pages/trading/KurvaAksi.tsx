import React, { useMemo, useState } from 'react';
import { usd } from './types';

export interface TitikKurva { t: string; nilai: number; spy: number | null }
export interface AksiKurva { t: string; jenis: 'beli' | 'jual'; s: string; harga: number; nilai: number; pct?: number; untung?: number; sebab?: string }
const tgl = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pc = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;

/** Grafik nilai modal (bola salju) vs S&P 500, dengan tanda beli (▲) & jual (●) di tiap tanggal. Arahkan/ketuk untuk detail. */
export function KurvaAksi({ kurva, aksi, modal }: { kurva: TitikKurva[]; aksi: AksiKurva[]; modal: number }) {
    const [i, setI] = useState<number | null>(null);
    const W = 760, H = 250, PADX = 8, PADY = 14;
    const g = useMemo(() => {
        const vals = kurva.flatMap((x) => [x.nilai, x.spy ?? x.nilai, modal]);
        const lo = Math.min(...vals), hi = Math.max(...vals), rg = hi - lo || 1;
        const X = (k: number) => PADX + (k / Math.max(1, kurva.length - 1)) * (W - PADX * 2);
        const Y = (v: number) => H - PADY - ((v - lo) / rg) * (H - PADY * 2);
        const idx = new Map(kurva.map((x, k) => [x.t, k]));
        // Tanggal aksi → titik kurva terdekat (kurva bisa diringkas).
        const posisi = (t: string) => { const k = idx.get(t); if (k != null) return k; let best = 0; for (let j = 0; j < kurva.length; j++) if (kurva[j].t <= t) best = j; return best; };
        const perHari = new Map<number, AksiKurva[]>();
        for (const a of aksi) { const k = posisi(a.t); perHari.set(k, [...(perHari.get(k) || []), a]); }
        return { lo, hi, X, Y, perHari };
    }, [kurva, aksi, modal]);
    if (kurva.length < 2) return <div className="fin-empty">Belum cukup hari untuk digambar.</div>;
    const garis = (f: (x: TitikKurva) => number | null) => kurva.map((x, k) => { const v = f(x); return v == null ? '' : `${k ? 'L' : 'M'}${g.X(k).toFixed(1)},${g.Y(v).toFixed(1)}`; }).join(' ');
    const pilih = (e: React.PointerEvent<SVGSVGElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        setI(Math.max(0, Math.min(kurva.length - 1, Math.round(((x - PADX) / (W - PADX * 2)) * (kurva.length - 1)))));
    };
    const titik = i != null ? kurva[i] : null, aksiI = i != null ? g.perHari.get(i) || [] : [];
    return (
        <div className="ka">
            <div className="ka-wadah">
                <svg viewBox={`0 0 ${W} ${H}`} className="ka-svg" onPointerMove={pilih} onPointerDown={pilih} onPointerLeave={() => setI(null)} role="img" aria-label="Grafik nilai modal dengan tanda beli dan jual">
                    <line x1={PADX} x2={W - PADX} y1={g.Y(modal)} y2={g.Y(modal)} className="ka-modal" />
                    <path d={garis((x) => x.spy)} className="ka-spy" />
                    <path d={garis((x) => x.nilai)} className="ka-nilai" />
                    {[...g.perHari.entries()].map(([k, as]) => {
                        const x = g.X(k), y = g.Y(kurva[k].nilai);
                        const beli = as.filter((a) => a.jenis === 'beli').length, jual = as.filter((a) => a.jenis === 'jual');
                        const untung = jual.reduce((s, a) => s + (a.untung || 0), 0);
                        return (
                            <g key={k}>
                                {beli > 0 && <path d={`M${x},${y + 7} l-5,9 h10 z`} className="ka-beli" />}
                                {jual.length > 0 && <circle cx={x} cy={y - 9} r={jual.length > 1 ? 5.5 : 4.5} className={untung >= 0 ? 'ka-jual up' : 'ka-jual down'} />}
                            </g>
                        );
                    })}
                    {titik && <line x1={g.X(i!)} x2={g.X(i!)} y1={PADY / 2} y2={H - PADY / 2} className="ka-garis" />}
                </svg>
                {titik && (
                    <div className="ka-tip" style={{ left: `${(g.X(i!) / W) * 100}%` }} data-kanan={g.X(i!) > W * 0.6 ? '1' : undefined}>
                        <b>{tgl(titik.t)}</b>
                        <span>Nilai {usd(titik.nilai)} <em className={titik.nilai >= modal ? 'up' : 'down'}>{pc((titik.nilai / modal - 1) * 100)}</em></span>
                        {titik.spy != null && <span className="ka-redup">S&P 500: {usd(titik.spy)}</span>}
                        {aksiI.map((a, k) => a.jenis === 'beli'
                            ? <span key={k}>▲ Beli <b>{a.s}</b> @ {usd(a.harga)}{a.nilai > 0 ? ` (${usd(a.nilai)})` : ''}</span>
                            : <span key={k}>● Jual <b>{a.s}</b> @ {usd(a.harga)} <em className={(a.pct || 0) >= 0 ? 'up' : 'down'}>{pc(a.pct || 0)} ({(a.untung || 0) >= 0 ? '+' : '−'}{usd(Math.abs(a.untung || 0))})</em>{a.sebab ? <small> · {a.sebab}</small> : null}</span>)}
                    </div>
                )}
            </div>
            <div className="ss-legenda"><span><i className="a" />Nilai modal (untung diputar lagi)</span><span><i className="b" />S&P 500</span><span>▲ beli · ● jual (hijau untung, merah rugi)</span></div>
        </div>
    );
}
