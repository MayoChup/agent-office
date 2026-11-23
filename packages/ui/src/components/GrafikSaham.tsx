import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, LineStyle } from 'lightweight-charts';
import { apiGet } from '../kantor/connection';

/**
 * Grafik harga halaman saham: garis bergradasi warna aksen kantor (atau candlestick), timeline 1D–5Y,
 * tombol ⚙ untuk jenis grafik & indikator (MA, EMA, Bollinger di grafik utama; MACD & RSI di panel bawah), volume.
 * 1D memberi arsiran pre-market & after-hours. Pilihan diingat per perangkat.
 */
interface Candle { t: string | number; o: number; h: number; l: number; c: number; v: number; sesi?: 'pre' | 'reg' | 'post' }
export interface DataCandle { s: string; harian: boolean; candles: Candle[]; tampil: number; prevClose: number | null; ext: { sesi: 'pre' | 'post'; harga: number; chg: number; pct: number } | null }

const RENTANG = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y'] as const;
type Ind = 'ma20' | 'ma50' | 'ma200' | 'ema' | 'bb' | 'macd' | 'rsi' | 'vol';
const IND: Array<{ k: Ind; label: string; chip: string; warna: string; grup: 'Main indicator' | 'Secondary indicator' | '' }> = [
    { k: 'ma20', label: 'Moving Average (20)', chip: 'MA(20)', warna: '#a78bfa', grup: 'Main indicator' },
    { k: 'ma50', label: 'Moving Average (50)', chip: 'MA(50)', warna: '#f59e0b', grup: 'Main indicator' },
    { k: 'ma200', label: 'Moving Average (200)', chip: 'MA(200)', warna: '#38bdf8', grup: 'Main indicator' },
    { k: 'ema', label: 'Moving Average Exponential (21)', chip: 'EMA(21)', warna: '#f472b6', grup: 'Main indicator' },
    { k: 'bb', label: 'Bollinger Bands (20, 2)', chip: 'BB(20,2)', warna: '#94a3b8', grup: 'Main indicator' },
    { k: 'macd', label: 'MACD (12, 26, 9)', chip: 'MACD', warna: '#60a5fa', grup: 'Secondary indicator' },
    { k: 'rsi', label: 'Relative Strength Index (14)', chip: 'RSI(14)', warna: '#c084fc', grup: 'Secondary indicator' }
];
const LS = 'kantor:grafik2';
const BAWAAN = { rentang: '1Y', tipe: 'line' as 'line' | 'candle', ind: { ma20: false, ma50: true, ma200: false, ema: false, bb: false, macd: false, rsi: false, vol: true } as Record<Ind, boolean> };

/* ── Hitungan indikator ── */
const sma = (x: number[], n: number) => x.map((_, i) => (i < n - 1 ? null : x.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));
function ema(x: number[], n: number) { const k = 2 / (n + 1); const o: Array<number | null> = []; let e: number | null = null; x.forEach((v, i) => { if (i < n - 1) { o.push(null); return; } e = e == null ? x.slice(0, n).reduce((a, b) => a + b, 0) / n : v * k + e * (1 - k); o.push(e); }); return o; }
function bb(x: number[], n = 20, m = 2) { const mid = sma(x, n); return mid.map((md, i) => { if (md == null) return null; const s = Math.sqrt(x.slice(i - n + 1, i + 1).reduce((a, b) => a + (b - md) ** 2, 0) / n); return { atas: md + m * s, bawah: md - m * s }; }); }
function macd(x: number[]) {
    const a = ema(x, 12), b = ema(x, 26); const line = x.map((_, i) => (a[i] != null && b[i] != null ? a[i]! - b[i]! : null));
    const ada = line.filter((v): v is number => v != null); const sig0 = ema(ada, 9); const off = line.length - ada.length;
    const sig = line.map((_, i) => (i < off ? null : sig0[i - off])); return { line, sig, hist: line.map((v, i) => (v != null && sig[i] != null ? v - sig[i]! : null)) };
}
function rsi(x: number[], n = 14) { const o: Array<number | null> = x.map(() => null); let g = 0, l = 0; for (let i = 1; i < x.length; i++) { const d = x[i] - x[i - 1]; if (i <= n) { g += Math.max(0, d); l += Math.max(0, -d); if (i === n) { g /= n; l /= n; o[i] = 100 - 100 / (1 + g / (l || 1e-9)); } } else { g = (g * (n - 1) + Math.max(0, d)) / n; l = (l * (n - 1) + Math.max(0, -d)) / n; o[i] = 100 - 100 / (1 + g / (l || 1e-9)); } } return o; }

const css = (v: string, cadangan: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || cadangan; } catch { return cadangan; } };
function alpha(warna: string, a: number) { const m = warna.match(/^#([0-9a-f]{6})$/i); if (!m) return warna; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
const fmt = (v: number | null | undefined, d = 2) => (v == null ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const waktu = (t: string | number, harian: boolean) => (typeof t === 'number' ? new Date(t * 1000).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' WIB' : new Date(`${t}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short', year: harian ? 'numeric' : undefined }));

export function GrafikSaham({ simbol }: { simbol: string }) {
    const pref = useMemo(() => { try { const p = JSON.parse(localStorage.getItem(LS) || '{}'); return { ...BAWAAN, ...p, ind: { ...BAWAAN.ind, ...(p.ind || {}) } }; } catch { return BAWAAN; } }, []);
    const [rentang, setRentang] = useState<string>(pref.rentang);
    const [tipe, setTipe] = useState<'line' | 'candle'>(pref.tipe);
    const [ind, setInd] = useState<Record<Ind, boolean>>(pref.ind);
    const [atur, setAtur] = useState(false);
    const [data, setData] = useState<DataCandle | null>(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [hover, setHover] = useState<Candle | null>(null);
    const box = useRef<HTMLDivElement>(null), boxMacd = useRef<HTMLDivElement>(null), boxRsi = useRef<HTMLDivElement>(null), aturRef = useRef<HTMLDivElement>(null);

    useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ rentang, tipe, ind })); } catch { /* */ } }, [rentang, tipe, ind]);
    useEffect(() => {
        let alive = true; setLoading(true); setErr('');
        apiGet<DataCandle>(`/api/kantor/candle/${encodeURIComponent(simbol)}?r=${rentang}`)
            .then((d) => { if (alive) { setData(d); setHover(null); } })
            .catch((e) => alive && setErr(String(e.message || e)))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [simbol, rentang]);
    // Tutup panel pengaturan saat klik di luar / Esc.
    useEffect(() => {
        if (!atur) return;
        const klik = (e: PointerEvent) => { if (aturRef.current && !aturRef.current.contains(e.target as Node)) setAtur(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAtur(false); };
        document.addEventListener('pointerdown', klik); document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('pointerdown', klik); document.removeEventListener('keydown', esc); };
    }, [atur]);

    const hitung = useMemo(() => {
        if (!data?.candles.length) return null;
        const c = data.candles.map((k) => k.c);
        return { ma20: sma(c, 20), ma50: sma(c, 50), ma200: sma(c, 200), ema: ema(c, 21), bb: bb(c), macd: macd(c), rsi: rsi(c) };
    }, [data]);

    useEffect(() => {
        if (!box.current || !data || !data.candles.length || !hitung) return;
        const aksen = css('--accent', '#4d8dff'), teks = css('--muted', '#94a3b8'), naik = '#22c55e', turun = '#ef4444';
        const dasar = {
            autoSize: true,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: teks, fontSize: 11 },
            localization: { locale: 'en-US' },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(148,163,184,0.07)' } },
            rightPriceScale: { borderVisible: false, minimumWidth: 64 },
            timeScale: { borderVisible: false, timeVisible: !data.harian, secondsVisible: false, rightOffset: 2 },
            crosshair: { mode: CrosshairMode.Magnet },
            handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
            handleScroll: { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: true, pressedMouseMove: true }
        } as const;
        const t = (x: string | number) => x as any;
        const n = data.candles.length, dari = Math.max(0, n - data.tampil);
        const chart = createChart(box.current, dasar);
        const semua: IChartApi[] = [chart];

        // Arsiran sesi (1D): pre-market & after-hours.
        if (data.candles.some((k) => k.sesi && k.sesi !== 'reg')) {
            for (const [ss, w] of [['pre', alpha(aksen, 0.09)], ['post', 'rgba(168,85,247,0.09)']] as const) {
                const bg = chart.addAreaSeries({ priceScaleId: 'sesi', lineColor: 'transparent', topColor: w, bottomColor: w, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
                bg.setData(data.candles.map((k) => (k.sesi === ss ? { time: t(k.t), value: 1 } : { time: t(k.t) })) as any);
                bg.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }) } as any);
            }
            chart.priceScale('sesi').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });

        }
        // Harga dasar (garis putus-putus): penutupan sebelumnya untuk 1D, harga awal rentang untuk lainnya.
        const basis = rentang === '1D' && data.prevClose ? data.prevClose : data.candles[Math.max(0, dari - 1)].c;
        const main = tipe === 'line'
            ? chart.addAreaSeries({ lineColor: aksen, topColor: alpha(aksen, 0.32), bottomColor: alpha(aksen, 0.0), lineWidth: 2, priceLineVisible: false, crosshairMarkerRadius: 4 })
            : chart.addCandlestickSeries({ upColor: naik, downColor: turun, borderVisible: false, wickUpColor: naik, wickDownColor: turun, priceLineVisible: false });
        if (tipe === 'line') main.setData(data.candles.map((k) => ({ time: t(k.t), value: k.c })) as any);
        else main.setData(data.candles.map((k) => ({ time: t(k.t), open: k.o, high: k.h, low: k.l, close: k.c })) as any);
        main.createPriceLine({ price: basis, color: alpha(aksen, 0.55), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: ind.vol ? 0.2 : 0.05 } });
        if (ind.vol) {
            const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
            chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
            vol.setData(data.candles.map((k) => ({ time: t(k.t), value: k.v, color: k.c >= k.o ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)' })));
        }
        const garis = (vals: Array<number | null>, warna: string, w: 1 | 2 = 1, ch = chart, gaya: LineStyle = LineStyle.Solid) => {
            const s = ch.addLineSeries({ color: warna, lineWidth: w, lineStyle: gaya, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
            s.setData(data.candles.map((k, i) => (vals[i] == null ? { time: t(k.t) } : { time: t(k.t), value: vals[i] })) as any); // titik kosong menjaga urutan sejajar antar panel
            return s;
        };
        for (const m of IND) if (ind[m.k] && (m.k === 'ma20' || m.k === 'ma50' || m.k === 'ma200' || m.k === 'ema')) garis(hitung[m.k], m.warna);
        if (ind.bb) { garis(hitung.bb.map((x) => x?.atas ?? null), '#94a3b8', 1, chart, LineStyle.Dotted); garis(hitung.bb.map((x) => x?.bawah ?? null), '#94a3b8', 1, chart, LineStyle.Dotted); }

        // Panel bawah (MACD / RSI) — waktu disinkronkan dengan grafik utama.
        const sub = (el: HTMLDivElement | null) => { if (!el) return null; const c = createChart(el, { ...dasar, layout: { ...dasar.layout, attributionLogo: false } as any, timeScale: { ...dasar.timeScale, visible: false }, handleScroll: false, handleScale: false }); semua.push(c); return c; };
        if (ind.macd) {
            const c = sub(boxMacd.current);
            if (c) {
                const h = c.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
                h.setData(data.candles.map((k, i) => (hitung.macd.hist[i] == null ? { time: t(k.t) } : { time: t(k.t), value: hitung.macd.hist[i], color: hitung.macd.hist[i]! >= 0 ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)' })) as any);
                garis(hitung.macd.line, '#60a5fa', 1, c); garis(hitung.macd.sig, '#f59e0b', 1, c);
            }
        }
        if (ind.rsi) {
            const c = sub(boxRsi.current);
            if (c) {
                const s = garis(hitung.rsi, '#c084fc', 1, c);
                s.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
                s.createPriceLine({ price: 30, color: 'rgba(34,197,94,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' });
            }
        }
        const rangeAwal = { from: dari - 0.5, to: n - 0.5 + 2 };
        chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r) for (const c of semua.slice(1)) c.timeScale().setVisibleLogicalRange(r); });
        chart.timeScale().setVisibleLogicalRange(rangeAwal);
        for (const c of semua.slice(1)) c.timeScale().setVisibleLogicalRange(rangeAwal);
        chart.subscribeCrosshairMove((p) => {
            if (p.time === undefined || !p.point) { setHover(null); return; }
            setHover(data.candles.find((x) => x.t === p.time) || null);
        });
        return () => { for (const c of semua) c.remove(); };
    }, [data, hitung, tipe, ind, rentang]);

    const n = data?.candles.length || 0;
    const akhir = data?.candles[n - 1];
    const awal = data && n ? (rentang === '1D' && data.prevClose ? data.prevClose : data.candles[Math.max(0, n - data.tampil - 1)].c) : null;
    const tampil = hover || akhir;
    const chg = tampil && awal ? tampil.c - awal : null;
    const i = hover && data ? data.candles.indexOf(hover) : n - 1;
    const chip = (k: Ind) => {
        if (!hitung) return '';
        const v = k === 'macd' ? hitung.macd.line[i] : k === 'rsi' ? hitung.rsi[i] : k === 'bb' ? null : (hitung as any)[k][i];
        return v == null ? '' : k === 'rsi' ? fmt(v, 1) : k === 'macd' ? fmt(v, 2) : `$${fmt(v)}`;
    };
    const aktif = IND.filter((m) => ind[m.k]);
    return (
        <div className="gs">
            <div className="gs-top">
                <div className="gs-hover">
                    {tampil ? <>
                        <span>{waktu(tampil.t, !!data?.harian)}{tampil.sesi === 'pre' ? ' · Pre-market' : tampil.sesi === 'post' ? ' · After-hours' : ''}</span>
                        {tipe === 'candle' || hover ? <span className="mono">O {fmt(tampil.o)} · H {fmt(tampil.h)} · L {fmt(tampil.l)} · C <b>{fmt(tampil.c)}</b></span> : <span className="mono"><b>${fmt(tampil.c)}</b></span>}
                        {chg != null && <span className={`mono ${chg >= 0 ? 'up' : 'down'}`}>{chg >= 0 ? '↗' : '↘'} {chg >= 0 ? '+' : '−'}${fmt(Math.abs(chg))} ({fmt(Math.abs(chg / awal!) * 100)}%) · {rentang}</span>}
                    </> : <span>{loading ? 'Loading…' : ''}</span>}
                </div>
                {aktif.length > 0 && <div className="gs-chips">{aktif.map((m) => <span key={m.k} style={{ ['--c' as any]: m.warna }}>{m.chip}{chip(m.k) && <b className="mono"> {chip(m.k)}</b>}</span>)}</div>}
            </div>
            <div className={`gs-box ${loading ? 'muat' : ''}`} ref={box}>{err && <div className="error" style={{ margin: 12 }}>{err}</div>}</div>
            {ind.macd && <div className="gs-sub"><small>MACD (12, 26, 9)</small><div ref={boxMacd} /></div>}
            {ind.rsi && <div className="gs-sub"><small>RSI (14)</small><div ref={boxRsi} /></div>}
            <div className="gs-bar">
                <div className="gs-ranges" role="tablist" aria-label="Rentang waktu">
                    {RENTANG.map((r) => <button key={r} role="tab" aria-selected={r === rentang} className={r === rentang ? 'on' : ''} onClick={() => setRentang(r)}>{r}</button>)}
                </div>
                <div className="gs-atur-w" ref={aturRef}>
                    <button className={`gs-gear ${atur ? 'on' : ''}`} aria-label="Chart settings" aria-expanded={atur} onClick={() => setAtur(!atur)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    </button>
                    {atur && (
                        <div className="gs-atur" role="dialog" aria-label="Chart settings">
                            <b>Chart type</b>
                            {(['candle', 'line'] as const).map((x) => (
                                <label key={x} className="gs-opt"><span>{x === 'candle' ? 'Candlestick' : 'Line'}</span><input type="radio" name="gs-tipe" checked={tipe === x} onChange={() => setTipe(x)} /></label>
                            ))}
                            {(['Main indicator', 'Secondary indicator'] as const).map((g) => (
                                <React.Fragment key={g}>
                                    <b>{g}</b>
                                    {IND.filter((m) => m.grup === g).map((m) => (
                                        <label key={m.k} className="gs-opt"><span><i style={{ background: m.warna }} />{m.label}</span><input type="checkbox" role="switch" checked={ind[m.k]} onChange={() => setInd({ ...ind, [m.k]: !ind[m.k] })} /></label>
                                    ))}
                                </React.Fragment>
                            ))}
                            <label className="gs-opt gs-opt-akhir"><span>Show volume</span><input type="checkbox" role="switch" checked={ind.vol} onChange={() => setInd({ ...ind, vol: !ind.vol })} /></label>
                        </div>
                    )}
                </div>
            </div>
            {data && !data.harian && <small className="gs-note">Times in WIB{rentang === '1D' ? ' · shaded: pre-market (left) & after-hours (right)' : ''}</small>}
        </div>
    );
}
