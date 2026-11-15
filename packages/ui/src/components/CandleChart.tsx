import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi } from 'lightweight-charts';
import { apiGet } from '../kantor/connection';

interface Candle { t: string | number; o: number; h: number; l: number; c: number; v: number }
interface Data { s: string; nama: string; bursa: string; harian: boolean; interval: string; candles: Candle[]; ma20: (number | null)[]; ma50: (number | null)[]; ma200: (number | null)[]; tampil: number }

const RENTANG = ['1H', '5H', '1B', '3B', '6B', '1T', '5T'];
const LABEL: Record<string, string> = { '1H': '1 hari', '5H': '5 hari', '1B': '1 bulan', '3B': '3 bulan', '6B': '6 bulan', '1T': '1 tahun', '5T': '5 tahun' };
const MA = [
    { k: 'ma20' as const, label: 'MA20', warna: '#a78bfa' },
    { k: 'ma50' as const, label: 'MA50', warna: '#f59e0b' },
    { k: 'ma200' as const, label: 'MA200', warna: '#38bdf8' }
];
const LS = 'kantor:candle';

/** Grafik candlestick interaktif (geser, cubit untuk zoom, ketuk untuk melihat OHLC). */
export function CandleChart({ simbol }: { simbol: string }) {
    const pref = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
    const [rentang, setRentang] = useState<string>(pref.rentang || '6B');
    const [ma, setMa] = useState<Record<string, boolean>>(pref.ma || { ma20: false, ma50: true, ma200: true });
    const [data, setData] = useState<Data | null>(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [ohlc, setOhlc] = useState<Candle | null>(null);
    const box = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ rentang, ma })); } catch { /* */ } }, [rentang, ma]);
    useEffect(() => {
        let alive = true;
        setLoading(true); setErr('');
        apiGet<Data>(`/api/kantor/candle/${encodeURIComponent(simbol)}?r=${rentang}`)
            .then((d) => { if (alive) { setData(d); setOhlc(null); } })
            .catch((e) => alive && setErr(String(e.message || e)))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [simbol, rentang]);

    useEffect(() => {
        if (!box.current || !data || !data.candles.length) return;
        const chart = createChart(box.current, {
            autoSize: true,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8', fontSize: 11 },
            grid: { vertLines: { color: 'rgba(148,163,184,0.07)' }, horzLines: { color: 'rgba(148,163,184,0.07)' } },
            rightPriceScale: { borderColor: 'rgba(148,163,184,0.2)' },
            timeScale: { borderColor: 'rgba(148,163,184,0.2)', timeVisible: !data.harian, secondsVisible: false, rightOffset: 3 },
            crosshair: { mode: CrosshairMode.Normal },
            handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
            handleScroll: { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: true, pressedMouseMove: true }
        });
        chartRef.current = chart;
        const time = (t: string | number) => t as any;
        const candle = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444' });
        candle.setData(data.candles.map((k) => ({ time: time(k.t), open: k.o, high: k.h, low: k.l, close: k.c })));
        const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        candle.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });
        vol.setData(data.candles.map((k) => ({ time: time(k.t), value: k.v, color: k.c >= k.o ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)' })));
        for (const m of MA) {
            if (!ma[m.k]) continue;
            const line = chart.addLineSeries({ color: m.warna, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
            line.setData(data.candles.map((k, i) => ({ time: time(k.t), value: data[m.k][i] })).filter((p) => p.value != null) as any);
        }
        const n = data.candles.length;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - data.tampil) - 0.5, to: n + 2 });
        chart.subscribeCrosshairMove((p) => {
            const d: any = p.seriesData?.get(candle);
            if (!d || p.time === undefined) { setOhlc(null); return; }
            const k = data.candles.find((x) => x.t === p.time) || null;
            setOhlc(k);
        });
        return () => { chart.remove(); chartRef.current = null; };
    }, [data, ma]);

    const last = data?.candles[data.candles.length - 1];
    const prev = data?.candles[Math.max(0, data.candles.length - 1 - (data?.tampil || 1))];
    const show = ohlc || last;
    const naik = last && prev ? last.c >= prev.c : true;
    const tglLabel = (t: string | number) => (typeof t === 'number' ? new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' WIB' : t);

    return (
        <div className="cc">
            <div className="cc-top">
                <div className="cc-ohlc">
                    {show ? (
                        <>
                            <span>{tglLabel(show.t)}</span>
                            <span>B <b>{show.o.toFixed(2)}</b></span><span>T <b>{show.h.toFixed(2)}</b></span><span>R <b>{show.l.toFixed(2)}</b></span>
                            <span>P <b className={show.c >= show.o ? 'up' : 'down'}>{show.c.toFixed(2)}</b></span>
                            <span>Vol <b>{(show.v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt</b></span>
                        </>
                    ) : <span>{loading ? 'Memuat…' : ''}</span>}
                </div>
                {!ohlc && last && prev && <div className={`cc-chg ${naik ? 'up' : 'down'}`}>{naik ? '▲' : '▼'} {Math.abs((last.c / prev.c - 1) * 100).toFixed(2).replace('.', ',')}% · {LABEL[rentang]}</div>}
            </div>
            <div className="cc-box" ref={box}>{err && <div className="error" style={{ margin: 12 }}>{err}</div>}</div>
            <div className="cc-bar">
                <div className="cc-ranges">{RENTANG.map((r) => <button key={r} className={r === rentang ? 'on' : ''} onClick={() => setRentang(r)}>{r}</button>)}</div>
                <div className="cc-mas">{MA.map((m) => <button key={m.k} className={ma[m.k] ? 'on' : ''} style={{ ['--c' as any]: m.warna }} onClick={() => setMa({ ...ma, [m.k]: !ma[m.k] })}>{m.label}</button>)}</div>
            </div>
            <div className="cc-hint">Geser untuk melihat ke belakang · cubit/scroll untuk zoom · ketuk candle untuk detail (B=buka, T=tertinggi, R=terendah, P=penutupan){data && !data.harian ? ' · waktu WIB' : ''}</div>
        </div>
    );
}
