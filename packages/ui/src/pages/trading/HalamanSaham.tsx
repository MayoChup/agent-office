import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { InfoKamus, Info } from './InfoI';
import * as K from './kamus';
import { Baris, kap, usd } from './types';
import { AcaraPasar } from './Acara';

/**
 * Bagian-bagian halaman saham versi bertab: Weekly Insight (AI, manual), Market stats, What the experts say,
 * Fundamentals lengkap, News sentiment (speedometer), Seasonality. Data dari /saham-ekstra, /sentimen, /musiman, /insight.
 */
export interface Analis { sumber?: string; catatan?: string; buy: number; hold: number; sell: number; n: number; konsensus: 'BUY' | 'HOLD' | 'SELL'; target: number | null; tinggi: number | null; rendah: number | null; bank: Array<{ nama: string; analis?: string; rating: string; arah: 'buy' | 'hold' | 'sell'; tgl: string; target: number | null }> }
export interface DataEkstra { ekstra: K.EkstraData | null; ekstraGalat: string; analis: Analis | null; analisGalat: string }
const pct = (v: number, d = 1) => `${v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })}%`;

/** Satu baris "label ⓘ ........ nilai [status]" seperti tabel statistik. */
export function BarisStat({ x }: { x: K.Bacaan }) {
    return (
        <div className="hs-row">
            <span className="hs-l">{x.judul} <InfoKamus x={x} /></span>
            <span className="hs-v"><b className="mono">{x.nilai}</b>{x.status && x.nilai !== '–' && <em className={`t-${x.nada}`}>{x.status}</em>}</span>
        </div>
    );
}

/* ── Weekly Insight ── */
interface FundJudge { vonis: string; alasan: string; lemah: string[]; kuat: string[]; industri: string }
interface Insight { judul: string; ringkas: string; berita?: string[]; fundTek: string; pantau: string; saran?: string; dibuat: number; fundJudge?: FundJudge | null; teknikal?: string; beritaRinci?: string; whales?: string; labaBerikut?: string }
const ikonKilau = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>;
const BLN_I = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** "28 Nov 2026, 10.40 · 2 hari lalu" + apakah sudah mungkin usang (> 3 hari, atau laporan laba sudah lewat sejak dibuat). */
function umurInsight(x: Insight) {
    const d = new Date(x.dibuat + 7 * 3600_000);
    const tgl = `${d.getUTCDate()} ${BLN_I[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')} WIB`;
    const jam = (Date.now() - x.dibuat) / 3600_000;
    const lalu = jam < 1 ? 'baru saja' : jam < 24 ? `${Math.floor(jam)} jam lalu` : `${Math.floor(jam / 24)} hari lalu`;
    const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const labaLewat = !!x.labaBerikut && hariIni > x.labaBerikut;
    const usang = jam > 72 || labaLewat;
    return { teks: `${tgl} · ${lalu}`, usang, alasan: labaLewat ? `laporan laba ${x.labaBerikut} sudah keluar sesudah insight ini dibuat` : 'dibuat lebih dari 3 hari lalu' };
}
/** Satu sumber data insight untuk Overview & kartu per tab (dibuat di latar server, dipantau tiap 4 detik). */
function useInsight(s: string) {
    const q = useApi<{ insight: Insight | null; jalan?: boolean; galat?: string }>(`/api/kantor/insight/${encodeURIComponent(s)}`, 0);
    const [minta, setMinta] = useState(false);
    const [errKirim, setErrKirim] = useState('');
    const jalan = minta || !!q.data?.jalan;
    React.useEffect(() => {
        if (!jalan) return;
        const t = setInterval(async () => { await q.reload(); }, 4000);
        return () => clearInterval(t);
    }, [jalan]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { if (minta && q.data && !q.data.jalan) setMinta(false); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
    const buat = async () => { setErrKirim(''); setMinta(true); try { await apiPost(`/api/kantor/insight/${encodeURIComponent(s)}`, {}); await q.reload(); } catch (e: any) { setErrKirim(String(e?.message || e)); setMinta(false); } };
    return { x: q.data?.insight || null, jalan, err: errKirim || (!jalan ? q.data?.galat || '' : ''), buat };
}
function TanggalInsight({ x, jalan, buat }: { x: Insight; jalan: boolean; buat: () => void }) {
    const u = umurInsight(x);
    return (
        <div className="hs-ins-tgl">
            <small>Dibuat {u.teks}</small>
            {u.usang && <span className="hs-usang" title={u.alasan}>Mungkin sudah usang</span>}
            <button className="hs-link" disabled={jalan} onClick={buat}>{jalan ? 'Menyusun…' : 'Buat ulang'}</button>
        </div>
    );
}
function IsiJudge({ j }: { j: FundJudge }) {
    return (
        <div className="hs-judge">
            {j.vonis && <div className={`hs-vonis v-${j.vonis.toLowerCase()}`}><b>Fundamental {j.vonis.toLowerCase()}</b>{j.alasan && <span>{j.alasan}</span>}</div>}
            {!j.vonis && j.alasan && <p>{j.alasan}</p>}
            {j.lemah.length > 0 && (<><h5>Terlihat lemah, tapi…</h5><ul>{j.lemah.map((t, i) => { const [a, b] = t.split(/\s*(?:→|->)\s*/); return <li key={i} className="lemah">{b ? <><b>{a}</b><span>{b}</span></> : t}</li>; })}</ul></>)}
            {j.kuat.length > 0 && (<><h5>Terlihat kuat, catatannya…</h5><ul>{j.kuat.map((t, i) => { const [a, b] = t.split(/\s*(?:→|->)\s*/); return <li key={i} className="kuat">{b ? <><b>{a}</b><span>{b}</span></> : t}</li>; })}</ul></>)}
            {j.industri && (<><h5>Dibanding industrinya</h5><p>{j.industri}</p></>)}
        </div>
    );
}
export function WeeklyInsight({ s }: { s: string }) {
    const { x, jalan, err, buat } = useInsight(s);
    const [buka, setBuka] = useState(false);
    const sebelum = React.useRef(jalan);
    React.useEffect(() => { if (sebelum.current && !jalan && x) setBuka(true); sebelum.current = jalan; }, [jalan, x]);
    return (
        <section className="sb-card hs-insight">
            <div className="hs-ins-h"><span className="hs-ins-t">{ikonKilau} Insight by AI</span>{x && <small>AI kantor · bukan saran</small>}</div>
            {!x ? (
                <div className="hs-ins-kosong">
                    <p>Ringkasan dari AI: apa yang terjadi, posisi teknikal & fundamental, penilaian fundamental menyeluruh (Fundamental judge), dan yang perlu dipantau. Penjelasan per faktor juga muncul di tab Fundamentals, Technical, News & Whales. Disusun hanya dari data kantor.</p>
                    <button className="btn primary" disabled={jalan} onClick={buat}>{jalan ? 'Menyusun insight… bisa sampai ±2–3 menit' : 'Buat insight'}</button>
                    {err && <small className="down">{err}</small>}
                </div>
            ) : (
                <>
                    <b className="hs-ins-judul">{x.judul}</b>
                    {!buka && <p className="hs-ins-cuplik">{x.ringkas}</p>}
                    {buka && (
                        <div className="hs-ins-isi">
                            <p>{x.ringkas}</p>
                            {!!x.berita?.length && (<><h4>Berita paling berdampak</h4><ul className="hs-ins-berita">{x.berita.map((t, i) => { const [a, b] = t.split(/\s*(?:→|->)\s*/); return <li key={i}>{b ? <><b>{a}</b> → {b}</> : t}</li>; })}</ul></>)}
                            <h4>Fundamental & teknikal</h4><p>{x.fundTek}</p>
                            {x.fundJudge && (<><h4>Fundamental judge</h4><IsiJudge j={x.fundJudge} /></>)}
                            <h4>Yang perlu dipantau</h4><p>{x.pantau}</p>
                            {x.saran && <div className="hs-ins-saran"><h4>Sikap kantor</h4><p>{x.saran.split(/(?=Sudah pegang:)/i).map((t, i) => <span key={i}>{i > 0 && <br />}{t.trim()}</span>)}</p></div>}
                            <small className="sb-note">Disusun AI dari data kantor untuk informasi saja, bukan saran keuangan.</small>
                        </div>
                    )}
                    <div className="hs-ins-kaki"><button className="hs-link" onClick={() => setBuka(!buka)}>{buka ? 'Lebih sedikit' : 'Selengkapnya'}</button></div>
                    <TanggalInsight x={x} jalan={jalan} buat={buat} />
                    {err && <small className="down">{err}</small>}
                </>
            )}
        </section>
    );
}

/** Kartu penjelasan AI di bawah tab Fundamentals / Technical / News / Whales — isi dari insight yang sama. */
const JUDUL_FAKTOR: Record<string, string> = { fundamental: 'Fundamental judge by AI', teknikal: 'Penjelasan teknikal by AI', berita: 'Penjelasan berita by AI', whales: 'Penjelasan whales by AI' };
export function InsightFaktor({ s, jenis }: { s: string; jenis: 'fundamental' | 'teknikal' | 'berita' | 'whales' }) {
    const { x, jalan, err, buat } = useInsight(s);
    const teks = !x ? '' : jenis === 'teknikal' ? x.teknikal : jenis === 'berita' ? x.beritaRinci : jenis === 'whales' ? x.whales : '';
    const ada = !!x && (jenis === 'fundamental' ? !!x.fundJudge : !!teks);
    return (
        <div className="hs-insf">
            <div className="hs-ins-h"><span className="hs-ins-t">{ikonKilau} {JUDUL_FAKTOR[jenis]}</span></div>
            {ada && x ? (
                <>
                    {jenis === 'fundamental' ? <IsiJudge j={x.fundJudge!} /> : <p className="hs-insf-p">{teks}</p>}
                    <TanggalInsight x={x} jalan={jalan} buat={buat} />
                </>
            ) : (
                <div className="hs-ins-kosong">
                    <p>{x ? 'Insight yang ada dibuat sebelum bagian ini tersedia. Buat ulang supaya penjelasan ini muncul.' : jenis === 'fundamental' ? 'AI menimbang rasio yang lemah dan yang kuat, mana yang saling menopang, dibanding median industrinya.' : 'Penjelasan AI untuk faktor ini muncul setelah insight dibuat.'}</p>
                    <button className="btn" disabled={jalan} onClick={buat}>{jalan ? 'Menyusun… bisa sampai ±2–3 menit' : x ? 'Buat ulang insight' : 'Buat insight'}</button>
                </div>
            )}
            {err && <small className="down">{err}</small>}
            <small className="sb-note">Disusun AI dari data kantor, bukan saran keuangan.</small>
        </div>
    );
}

/* ── Arus kas perusahaan (SEC) ── */
interface PeriodeKas { label: string; akhir: string; ocf: number | null; inv: number | null; fin: number | null; capex: number | null; fcf: number | null; rev: number | null; ni: number | null }
interface ArusKasData { tahunan: PeriodeKas[]; kuartal: PeriodeKas[]; ttm: { ocf: number; capex: number | null; fcf: number | null; rev: number | null; ni: number | null; dari: string } | null; sumber: string }
const miliar = (v: number | null | undefined) => { if (v == null) return '–'; const a = Math.abs(v), t = v < 0 ? '−' : ''; return a >= 1e9 ? `${t}$${(a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M` : `${t}$${Math.round(a / 1e6).toLocaleString('id-ID')} jt`; };
export function ArusKasPerusahaan({ s }: { s: string }) {
    const q = useApi<ArusKasData>(`/api/kantor/arus-kas/${encodeURIComponent(s)}`, 0);
    const [mode, setMode] = useState<'tahunan' | 'kuartal'>('tahunan');
    const d = q.data;
    const xs = d ? (mode === 'tahunan' ? d.tahunan : d.kuartal) : [];
    const t = d?.ttm;
    const kualitas = t && t.ni ? t.ocf / t.ni : null;
    const marginFcf = t && t.rev && t.fcf != null ? (t.fcf / t.rev) * 100 : null;
    return (
        <div className="hs-kas">
            <div className="hs-kas-h">
                <h4>Arus kas perusahaan <Info judul="Arus kas perusahaan" teks={'Dari laporan resmi ke SEC (10-K tahunan, 10-Q kuartalan).\n\nOperasi: kas dari bisnis inti. Sehat kalau positif dan tumbuh.\nInvestasi: belanja aset/akuisisi (biasanya negatif).\nPendanaan: utang, dividen, pembelian kembali saham (negatif = membayar ke pemegang saham/kreditur).\nArus kas bebas = operasi − belanja modal: uang yang benar-benar tersisa.\n\nArus kas operasi ÷ laba bersih ≥ 1 artinya laba didukung kas nyata (kualitas laba baik).'} /></h4>
                <div className="sb-seg"><button className={mode === 'tahunan' ? 'on' : ''} onClick={() => setMode('tahunan')}>Tahunan</button><button className={mode === 'kuartal' ? 'on' : ''} onClick={() => setMode('kuartal')}>Kuartalan</button></div>
            </div>
            {q.error && <p className="sb-note">{q.error}</p>}
            {!d && !q.error && <p className="sb-note">Memuat laporan arus kas…</p>}
            {d && xs.length > 0 && (<>
                <div className="hs-kas-leg"><span><i className="k-ocf" />Operasi</span><span><i className="k-inv" />Investasi</span><span><i className="k-fin" />Pendanaan</span><span><i className="k-fcf" />Arus kas bebas</span></div>
                <GrafikKas xs={xs} />
                {t && (
                    <div className="hs-kas-stat">
                        <div><small>Arus kas bebas 12 bln</small><b className={`mono ${t.fcf != null && t.fcf < 0 ? 'down' : ''}`}>{miliar(t.fcf)}</b></div>
                        <div><small>Margin arus kas bebas</small><b className="mono">{marginFcf == null ? '–' : `${marginFcf.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`}</b></div>
                        <div><small>Kas operasi ÷ laba</small><b className={`mono ${kualitas != null ? (kualitas >= 1 ? 'up' : 'down') : ''}`}>{kualitas == null ? '–' : `${kualitas.toLocaleString('id-ID', { maximumFractionDigits: 2 })}×`}</b><em>{kualitas == null ? '' : kualitas >= 1 ? 'laba didukung kas' : 'kas di bawah laba'}</em></div>
                    </div>
                )}
                <small className="sb-note">Sumber: {d.sumber}{t ? ` · 12 bulan = ${t.dari}` : ''}</small>
            </>)}
        </div>
    );
}
function GrafikKas({ xs }: { xs: PeriodeKas[] }) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [W, setW] = useState(600);
    React.useEffect(() => { const el = ref.current; if (!el) return; const u = () => setW(Math.max(280, el.clientWidth)); u(); const ro = new ResizeObserver(u); ro.observe(el); return () => ro.disconnect(); }, []);
    const H = 220, kiri = 52, atas = 10, bawah = 22;
    const nilai = xs.flatMap((x) => [x.ocf, x.inv, x.fin, x.fcf]).filter((v): v is number => v != null);
    const maks = Math.max(1, ...nilai), min = Math.min(0, ...nilai);
    const tinggi = H - atas - bawah, y = (v: number) => atas + ((maks - v) / (maks - min)) * tinggi, y0 = y(0);
    const lebar = (W - kiri) / xs.length, bw = Math.min(14, lebar / 4.5);
    const seri: Array<[keyof PeriodeKas, string]> = [['ocf', 'k-ocf'], ['inv', 'k-inv'], ['fin', 'k-fin']];
    const titik = xs.map((x, i) => (x.fcf == null ? null : [kiri + i * lebar + lebar / 2, y(x.fcf)] as const));
    const garis = titik.filter(Boolean).map((p) => p!.join(',')).join(' ');
    const tik = [maks, min].filter((v) => Math.abs(v) > (maks - min) * 0.08);
    return (
        <div ref={ref} className="hs-kas-g">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik arus kas">
                {tik.map((v) => <g key={v}><line x1={kiri} x2={W} y1={y(v)} y2={y(v)} className="hk-kisi" /><text x={kiri - 6} y={y(v) + 4} textAnchor="end" className="hk-sumbu">{miliar(v)}</text></g>)}
                <line x1={kiri} x2={W} y1={y0} y2={y0} className="hk-nol" /><text x={kiri - 6} y={y0 + 4} textAnchor="end" className="hk-sumbu">0</text>
                {xs.map((x, i) => {
                    const cx = kiri + i * lebar + lebar / 2;
                    return (
                        <g key={x.akhir}>
                            {seri.map(([k, c], j) => { const v = x[k] as number | null; if (v == null) return null; const yy = y(v); return <rect key={k} x={cx + (j - 1.5) * bw * 1.1} y={Math.min(yy, y0)} width={bw} height={Math.max(1, Math.abs(yy - y0))} rx={2} className={c}><title>{`${x.label} · ${k === 'ocf' ? 'Operasi' : k === 'inv' ? 'Investasi' : 'Pendanaan'} ${miliar(v)}`}</title></rect>; })}
                            <text x={cx} y={H - 6} textAnchor="middle" className="hk-sumbu">{x.label}</text>
                        </g>
                    );
                })}
                {garis && <polyline points={garis} className="hk-fcf" />}
                {titik.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={3.5} className="hk-fcf-t"><title>{`${xs[i].label} · Arus kas bebas ${miliar(xs[i].fcf)}`}</title></circle>)}
            </svg>
        </div>
    );
}

/* ── Market stats (ringkas) ── */
export function MarketStats({ b, e }: { b: Baris; e: K.EkstraData | null | undefined }) {
    const mc = K.kapitalisasi(b, kap(b.mcap ?? b.f?.mcap));
    const xs = [{ ...mc, judul: 'Market cap' }, { ...K.fundamental(b, 'per'), judul: 'P/E ratio' }, { ...K.ekstra(b, e, 'eps'), judul: 'EPS' }, { ...K.fundamental(b, 'pbv'), judul: 'P/B value' }, { ...K.ekstra(b, e, 'hi52'), judul: '1 year high (52w)' }, { ...K.ekstra(b, e, 'peg'), judul: 'PEG ratio' }];
    return (
        <section className="sb-card hs-stats">
            <h3>Market stats</h3>
            <div className="hs-grid">{xs.map((x) => <BarisStat key={x.judul} x={x} />)}</div>
        </section>
    );
}

/* ── Fundamentals lengkap ── */
export function FundLengkap({ b, e }: { b: Baris; e: K.EkstraData | null | undefined }) {
    const F = (k: Parameters<typeof K.fundamental>[1], j: string) => ({ ...K.fundamental(b, k), judul: j });
    const X = (k: Parameters<typeof K.ekstra>[2], j: string) => ({ ...K.ekstra(b, e, k), judul: j });
    const grup: Array<[string, K.Bacaan[]]> = [
        ['Valuation', [{ ...K.kapitalisasi(b, kap(b.mcap ?? b.f?.mcap)), judul: 'Market cap' }, F('ps', 'Price-to-sales ratio'), F('pbv', 'Price-to-book value'), F('per', 'Price-earnings ratio'), X('fwdPe', 'Forward P/E'), X('peg', 'PEG ratio')]],
        ['Profitability', [F('roe', 'Return on Equity'), F('npm', 'Return on Sales'), F('roa', 'Return on Assets'), X('gm', 'Gross margin')]],
        ['Earnings', [X('eps', 'Earnings per share'), F('epsCagr3', 'EPS growth (3y)'), F('revGrowth', 'Revenue growth')]],
        ['Income statement', [X('ebitda', 'EBITDA'), F('fcf', 'Free cash flow'), X('avgVol', 'Average volume'), X('hi52', '1 year high (52w)'), X('lo52', '1 year low (52w)'), X('beta', 'Beta')]],
        ['Dividend', [X('yieldDiv', 'Dividend yield')]],
        ['Solvency', [F('der', 'Debt-to-equity ratio'), F('cr', 'Current ratio')]]
    ];
    return (
        <div className="hs-fund">
            {grup.map(([g, xs]) => (
                <div key={g} className="hs-fgrup"><h4>{g}</h4><div className="hs-grid">{xs.map((x) => <BarisStat key={x.judul} x={x} />)}</div></div>
            ))}
        </div>
    );
}

/* ── What the experts say ── */
const RATING_ID: Record<string, string> = { buy: 'Buy', hold: 'Hold', sell: 'Sell' };
function KartuBank({ x, harga }: { x: Analis['bank'][number]; harga: number }) {
    const r = x.target ? (x.target / harga - 1) * 100 : null;
    return (
        <div className="hs-bk">
            <div className="hs-bk-h"><div><b>{x.nama}</b>{x.analis && <small>{x.analis}</small>}</div><em className={x.arah}>{RATING_ID[x.arah]}</em></div>
            <div className="hs-bk-b">
                <div><small>Target price</small><span className="mono">{x.target ? usd(x.target) : '–'}</span></div>
                <div className="r"><small>Estimated return</small><span className={`mono ${r == null ? '' : r < 0 ? 'down' : 'up'}`}>{r == null ? '–' : `${r < 0 ? '↘' : '↗'} ${pct(Math.abs(r), 2)}`}</span></div>
            </div>
            {x.tgl && <small className="hs-bk-t">{x.rating} · {(() => { const d = Date.parse(x.tgl); return Number.isFinite(d) ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : x.tgl; })()}</small>}
        </div>
    );
}
export function Experts({ a, galat, harga }: { a: Analis | null | undefined; galat?: string; harga: number }) {
    const [semua, setSemua] = useState(false);
    React.useEffect(() => { if (!semua) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setSemua(false); }; document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f); }, [semua]);
    if (!a) return (
        <section className="sb-card hs-exp"><h3>What the experts say</h3><p className="sb-note">{galat ? `Data analis belum bisa diambil (${galat}).` : 'Data analis Wall Street untuk saham ini belum tersedia.'}</p></section>
    );
    const p = (n: number) => (a.n ? (n / a.n) * 100 : 0);
    const targetOk = a.target != null && !((a.sumber || '').startsWith('Nasdaq') && (a.target / harga > 2 || a.target / harga < 0.4));
    const ret = targetOk ? (a.target! / harga - 1) * 100 : null;
    const k = a.konsensus.toLowerCase() as 'buy' | 'hold' | 'sell';
    return (
        <section className="sb-card hs-exp">
            <h3>What the experts say <Info judul="Pendapat analis" teks={'Rating dari analis bank & sekuritas Wall Street (data Nasdaq). Target price = rata-rata perkiraan harga 12 bulan ke depan.\n\nAnalis sering terlambat dan cenderung optimistis; pakai sebagai pembanding, bukan alasan utama.'} /></h3>
            <small className="hs-exp-n">{a.n} Wall Street Analyst Ratings{a.sumber ? ` · ${a.sumber}` : ''}</small>
            <div className="hs-exp-body">
                <div className={`hs-exp-bulat ${k}`}>{a.konsensus}</div>
                <div className="hs-exp-bar">
                    {(['buy', 'hold', 'sell'] as const).map((x) => (
                        <div key={x} className={`hs-bar-r ${x === k ? 'on' : ''}`}>
                            <div className="hs-bar-t"><i style={{ width: `${p(a[x])}%` }} className={x === k ? k : ''} /></div>
                            <span className={x === k ? k : ''}>{pct(p(a[x]))} {RATING_ID[x]}</span>
                        </div>
                    ))}
                </div>
                <div className="hs-exp-kanan">
                    <div><span className="hs-ico target" aria-hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg></span><small>Target price</small><b className="mono">{targetOk ? usd(a.target!) : '–'}</b></div>
                    <div><span className={`hs-ico ${ret != null && ret < 0 ? 'down' : 'up'}`} aria-hidden>{ret != null && ret < 0 ? '↘' : '↗'}</span><small>Estimated return</small><b className={`mono ${ret != null && ret < 0 ? 'down' : 'up'}`}>{ret != null ? `${ret < 0 ? '−' : '+'}${pct(Math.abs(ret), 2)}` : '–'}</b></div>
                </div>
            </div>
            {!a.bank.length && <p className="sb-note">Rincian rating per bank untuk saham ini belum tersedia dari sumber data.{a.catatan ? ` (${a.catatan})` : ''}</p>}
            {a.bank.length > 0 && (
                <div className="hs-bank">
                    {a.bank.slice(0, 5).map((x) => <KartuBank key={x.nama} x={x} harga={harga} />)}
                    {a.bank.length > 5 && <button className="hs-more" onClick={() => setSemua(true)}>Show more</button>}
                </div>
            )}
            {semua && createPortal(
                <div className="hs-modal-bg" onClick={() => setSemua(false)}>
                    <div className="hs-modal" role="dialog" aria-modal="true" aria-label="Analyst overview" onClick={(e) => e.stopPropagation()}>
                        <div className="hs-modal-h"><h3>Analyst overview</h3><button aria-label="Tutup" onClick={() => setSemua(false)}>×</button></div>
                        <div className="hs-modal-isi">{a.bank.map((x) => <KartuBank key={x.nama} x={x} harga={harga} />)}</div>
                    </div>
                </div>, document.body
            )}
        </section>
    );
}

/* ── News sentiment ── */
interface Sent { jendela: Record<'7' | '14' | '30', { n: number; pos: number; neg: number; netral: number; skor: number | null }>; at: number }
export function Speedometer({ skor, label }: { skor: number; label: string }) {
    // Busur setengah lingkaran 180°→0°; jarum (titik) di posisi skor.
    const R = 80, cx = 100, cy = 96, sudut = Math.PI * (1 - skor / 100);
    const titik = { x: cx + R * Math.cos(sudut), y: cy - R * Math.sin(sudut) };
    return (
        <svg className="hs-speedo" viewBox="0 0 200 116" role="img" aria-label={`Sentimen ${skor} dari 100, ${label}`}>
            <defs><linearGradient id="hs-sg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#ef4444" /><stop offset="0.35" stopColor="#f59e0b" /><stop offset="0.55" stopColor="#eab308" /><stop offset="0.8" stopColor="#84cc16" /><stop offset="1" stopColor="#22c55e" /></linearGradient></defs>
            <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="url(#hs-sg)" strokeWidth="14" strokeLinecap="round" />
            <circle cx={titik.x} cy={titik.y} r="9" fill="var(--text)" stroke="var(--bg)" strokeWidth="3" />
            <text x={cx} y={cy - 6} textAnchor="middle" className="hs-speedo-n">{skor}</text>
        </svg>
    );
}
export function NewsSentiment({ s }: { s: string }) {
    const q = useApi<Sent>(`/api/kantor/sentimen/${encodeURIComponent(s)}`, 0);
    const [h, setH] = useState<'7' | '14' | '30'>('30');
    const j = q.data?.jendela[h];
    const label = j?.skor == null ? '' : j.skor >= 60 ? 'Positive' : j.skor > 40 ? 'Neutral' : 'Negative';
    return (
        <div className="hs-sent">
            <div className="hs-sent-h"><h3>News sentiment <Info judul="Sentimen berita" teks={'Skor 0–100 dari judul berita Google News tentang saham ini, dinilai penilai berita kantor.\n\n50 = berita positif & negatif seimbang. Makin tinggi = makin banyak berita bernada positif; makin rendah = makin banyak yang negatif. Berita netral meredam skor ke arah 50.\n\nAngkanya tidak akan sama dengan aplikasi lain karena cara menilainya berbeda.'} /></h3>
                {q.data && <small>Last updated {new Date(q.data.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>}</div>
            {q.error && !q.data ? <p className="sb-note">Sentimen belum bisa diambil ({q.error}).</p> : !j ? <p className="sb-note">Memuat…</p> : j.skor == null ? <p className="sb-note">Belum ada berita dalam {h} hari terakhir.</p> : (
                <div className="hs-sent-b">
                    <Speedometer skor={j.skor} label={label} />
                    <b className={`hs-sent-l ${label === 'Positive' ? 'up' : label === 'Negative' ? 'down' : ''}`}>{label}</b>
                    <small>{j.pos} positif · {j.netral} netral · {j.neg} negatif dari {j.n} artikel</small>
                </div>
            )}
            <small className="hs-sent-p">Published over the past</small>
            <div className="hs-pill">{(['7', '14', '30'] as const).map((x) => <button key={x} className={x === h ? 'on' : ''} onClick={() => setH(x)}>{x} days</button>)}</div>
        </div>
    );
}

/* ── Seasonality ── */
interface Musim { tahun: Array<{ th: number; bulan: Array<number | null> }>; rata: Array<number | null>; naik: Array<number | null>; sumber: string }
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sel = (v: number | null) => { if (v == null) return {}; const k = Math.min(1, Math.abs(v) / 12); return { background: v >= 0 ? `rgba(34,197,94,${0.08 + k * 0.32})` : `rgba(239,68,68,${0.08 + k * 0.32})` }; };
export function Seasonality({ s }: { s: string }) {
    const q = useApi<Musim>(`/api/kantor/musiman/${encodeURIComponent(s)}`, 0);
    const m = q.data;
    const fx = (v: number | null) => (v == null ? '' : `${v.toFixed(2)}%`);
    const terbaik = m ? m.rata.reduce<number>((bi, v, i) => (v != null && (m.rata[bi] == null || v > m.rata[bi]!) ? i : bi), 0) : 0;
    const terburuk = m ? m.rata.reduce<number>((bi, v, i) => (v != null && (m.rata[bi] == null || v < m.rata[bi]!) ? i : bi), 0) : 0;
    return (
        <div className="hs-musim">
            <h3>Seasonality <Info judul="Musiman" teks={'Persen naik/turun harga saham ini di tiap bulan, beberapa tahun terakhir.\n\nBaris "Rata-rata" dan "% tahun naik" menunjukkan bulan yang biasanya kuat atau lemah. Pola musiman hanya kecenderungan masa lalu, bukan jaminan.'} /></h3>
            {q.error && !m ? <p className="sb-note">Data musiman belum bisa diambil ({q.error}).</p> : !m ? <p className="sb-note">Memuat…</p> : (
                <>
                    <div className="tbl-wrap"><table className="hs-musim-t">
                        <thead><tr><th />{BLN.map((b) => <th key={b}>{b}</th>)}</tr></thead>
                        <tbody>
                            {m.tahun.map((t) => <tr key={t.th}><th>{t.th}</th>{t.bulan.map((v, i) => <td key={i} className={`mono ${v == null ? '' : v >= 0 ? 'up' : 'down'}`} style={sel(v)}>{fx(v)}</td>)}</tr>)}
                            <tr className="hs-musim-rata"><th>Rata-rata</th>{m.rata.map((v, i) => <td key={i} className={`mono ${v == null ? '' : v >= 0 ? 'up' : 'down'}`}>{fx(v)}</td>)}</tr>
                            <tr className="hs-musim-rata"><th>% tahun naik</th>{m.naik.map((v, i) => <td key={i} className="mono">{v == null ? '' : `${v}%`}</td>)}</tr>
                        </tbody>
                    </table></div>
                    <p className="sb-note">Bulan terkuat rata-rata: <b>{BLN[terbaik]}</b> ({fx(m.rata[terbaik])}) · terlemah: <b>{BLN[terburuk]}</b> ({fx(m.rata[terburuk])}). Sumber {m.sumber}.</p>
                </>
            )}
        </div>
    );
}

/* ── Corporate actions ── */
interface Aksi { jenis: string; tgl: string; judul: string; detail: string; url?: string }
interface AksiData { akanDatang: Aksi[]; lampau: Aksi[]; dividen12: number | null; sumber: string[] }
const JENIS: Record<string, [string, string]> = {
    dividen: ['Dividen', 'Pembagian sebagian laba ke pemegang saham dalam bentuk tunai.\n\nEx-dividend = batas tanggal: Bapak harus sudah memegang saham SEBELUM tanggal ini agar dapat dividen. Di tanggal ex-dividend harga biasanya turun kira-kira sebesar dividennya.'],
    split: ['Stock split', 'Stock split 4 : 1 artinya 1 lembar dipecah jadi 4, harga per lembar jadi ¼. Nilai total kepemilikan Bapak tidak berubah.\n\nReverse split kebalikannya (beberapa lembar digabung jadi 1, harga per lembar naik) — sering dilakukan perusahaan yang harganya sudah sangat rendah.'],
    laba: ['Laporan laba', 'Pengumuman kinerja kuartalan (pendapatan, laba, perkiraan ke depan). Harga sering bergerak tajam di hari-hari sekitar tanggal ini.'],
    akuisisi: ['Akuisisi', 'Perusahaan membeli/menjual perusahaan atau aset besar, atau terjadi perubahan pengendali (laporan 8-K ke SEC).'],
    perjanjian: ['Perjanjian', 'Perusahaan menandatangani atau mengakhiri perjanjian penting (kontrak besar, kerja sama, rencana merger) — laporan 8-K ke SEC.'],
    direksi: ['Direksi', 'Pergantian direksi, CEO, CFO, atau eksekutif penting, atau perubahan kompensasinya (laporan 8-K ke SEC).'],
    saham: ['Saham baru', 'Penerbitan saham baru atau perubahan hak pemegang saham. Penerbitan saham baru bisa mengencerkan (dilusi) kepemilikan pemegang lama.'],
    utang: ['Utang', 'Perusahaan menanggung utang atau kewajiban keuangan baru yang material.'],
    restrukturisasi: ['Restrukturisasi', 'Rencana restrukturisasi, penutupan unit, atau PHK yang material.'],
    rups: ['RUPS', 'Hasil pemungutan suara rapat umum pemegang saham (pemilihan direksi, persetujuan rencana perusahaan).'],
    lain: ['Lainnya', 'Peristiwa resmi lain yang dilaporkan ke SEC lewat formulir 8-K.']
};
const tglEn = (t: string) => { const d = Date.parse(`${t}T00:00:00Z`); return Number.isFinite(d) ? new Date(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : t; };
function BarisAksi({ x }: { x: Aksi }) {
    const [label, info] = JENIS[x.jenis] || JENIS.lain;
    return (
        <div className="hs-aksi-r">
            <div className="hs-aksi-tgl mono">{tglEn(x.tgl)}</div>
            <div className="hs-aksi-isi">
                <div className="hs-aksi-h"><span className={`hs-aksi-j j-${x.jenis}`}>{label}</span><Info judul={label} teks={info} /></div>
                <b>{x.judul}</b>
                <small>{x.detail.replace(/\d{4}-\d{2}-\d{2}/g, (t) => tglEn(t))}{x.url && <> · <a href={x.url} target="_blank" rel="noreferrer">Dokumen asli</a></>}</small>
            </div>
        </div>
    );
}
export function CorporateActions({ s, harga }: { s: string; harga: number }) {
    const q = useApi<AksiData>(`/api/kantor/aksi-korporasi/${encodeURIComponent(s)}`, 0);
    const d = q.data;
    const kosong = (t: string) => <div className="hs-aksi-kosong"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg><span>{t}</span></div>;
    return (
        <div className="hs-aksi">
            {q.error && !d ? <p className="sb-note">Corporate actions belum bisa diambil ({q.error}).</p> : !d ? <p className="sb-note">Memuat…</p> : (
                <>
                    <h3>Upcoming</h3>
                    <AcaraPasar />
                    {d.akanDatang.length ? <div className="hs-aksi-list">{d.akanDatang.map((x, i) => <BarisAksi key={i} x={x} />)}</div> : kosong('Tidak ada corporate action yang akan datang.')}
                    <h3 className="hs-aksi-h3">Past <small>12 bulan terakhir</small></h3>
                    {d.dividen12 != null && <p className="hs-aksi-sum">Total dividen 12 bulan: <b className="mono">${d.dividen12.toFixed(2)}</b> per lembar{harga > 0 && <> · yield <b className="mono">{((d.dividen12 / harga) * 100).toFixed(2)}%</b></>}</p>}
                    {d.lampau.length ? <div className="hs-aksi-list">{d.lampau.map((x, i) => <BarisAksi key={i} x={x} />)}</div> : kosong('Tidak ada corporate action dalam 12 bulan terakhir.')}
                    {d.sumber.length > 0 && <small className="sb-note">Sumber: {d.sumber.join(', ')}. Peristiwa 8-K = laporan resmi perusahaan ke SEC.</small>}
                </>
            )}
        </div>
    );
}
