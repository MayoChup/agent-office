import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { InfoKamus, Info } from './InfoI';
import * as K from './kamus';
import { Baris, kap, usd } from './types';

/**
 * Bagian-bagian halaman saham versi bertab: Weekly Insight (AI, manual), Market stats, What the experts say,
 * Fundamentals lengkap, News sentiment (speedometer), Seasonality. Data dari /saham-ekstra, /sentimen, /musiman, /insight.
 */
export interface Analis { buy: number; hold: number; sell: number; n: number; konsensus: 'BUY' | 'HOLD' | 'SELL'; target: number | null; tinggi: number | null; rendah: number | null; bank: Array<{ nama: string; rating: string; arah: 'buy' | 'hold' | 'sell'; tgl: string; target: number | null }> }
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
interface Insight { judul: string; ringkas: string; fundTek: string; pantau: string; dibuat: number }
const ikonKilau = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>;
export function WeeklyInsight({ s }: { s: string }) {
    const q = useApi<{ insight: Insight | null }>(`/api/kantor/insight/${encodeURIComponent(s)}`, 0);
    const [buka, setBuka] = useState(false);
    const [jalan, setJalan] = useState(false);
    const [err, setErr] = useState('');
    const x = q.data?.insight;
    const buat = async () => { setJalan(true); setErr(''); try { await apiPost(`/api/kantor/insight/${encodeURIComponent(s)}`, {}); await q.reload(); setBuka(true); } catch (e: any) { setErr(String(e?.message || e)); } setJalan(false); };
    const tgl = x ? new Date(x.dibuat).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return (
        <section className="sb-card hs-insight">
            <div className="hs-ins-h"><span className="hs-ins-t">{ikonKilau} Weekly Insight</span>{x && <small>AI kantor · bukan saran</small>}</div>
            {!x ? (
                <div className="hs-ins-kosong">
                    <p>Ringkasan mingguan dari AI: apa yang terjadi minggu ini, posisi teknikal & fundamental, dan yang perlu dipantau. Disusun hanya dari data kantor.</p>
                    <button className="btn primary" disabled={jalan} onClick={buat}>{jalan ? 'Menyusun insight… ±20–40 detik' : 'Buat insight'}</button>
                    {err && <small className="down">{err}</small>}
                </div>
            ) : (
                <>
                    <b className="hs-ins-judul">{x.judul}</b>
                    {!buka && <p className="hs-ins-cuplik">{x.ringkas}</p>}
                    {buka && (
                        <div className="hs-ins-isi">
                            <p>{x.ringkas}</p>
                            <h4>Fundamental & teknikal</h4><p>{x.fundTek}</p>
                            <h4>Yang perlu dipantau</h4><p>{x.pantau}</p>
                            <small className="sb-note">Disusun AI dari data kantor untuk informasi saja, bukan saran keuangan.</small>
                        </div>
                    )}
                    <div className="hs-ins-kaki">
                        <button className="hs-link" onClick={() => setBuka(!buka)}>{buka ? 'See less' : 'See more'}</button>
                        <small>{tgl}</small>
                        <button className="hs-link" disabled={jalan} onClick={buat}>{jalan ? 'Menyusun…' : 'Buat ulang'}</button>
                    </div>
                    {err && <small className="down">{err}</small>}
                </>
            )}
        </section>
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
export function Experts({ a, galat, harga }: { a: Analis | null | undefined; galat?: string; harga: number }) {
    if (!a) return (
        <section className="sb-card hs-exp"><h3>What the experts say</h3><p className="sb-note">{galat ? `Data analis belum bisa diambil (${galat}).` : 'Data analis Wall Street untuk saham ini belum tersedia.'}</p></section>
    );
    const p = (n: number) => (a.n ? (n / a.n) * 100 : 0);
    const ret = a.target != null ? (a.target / harga - 1) * 100 : null;
    const k = a.konsensus.toLowerCase() as 'buy' | 'hold' | 'sell';
    return (
        <section className="sb-card hs-exp">
            <h3>What the experts say <Info judul="Pendapat analis" teks={'Rating dari analis bank & sekuritas Wall Street (data Nasdaq). Target price = rata-rata perkiraan harga 12 bulan ke depan.\n\nAnalis sering terlambat dan cenderung optimistis; pakai sebagai pembanding, bukan alasan utama.'} /></h3>
            <small className="hs-exp-n">{a.n} Wall Street Analyst Ratings</small>
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
                    <div><span className="hs-ico target" aria-hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg></span><small>Target price</small><b className="mono">{a.target != null ? usd(a.target) : '–'}</b></div>
                    <div><span className={`hs-ico ${ret != null && ret < 0 ? 'down' : 'up'}`} aria-hidden>{ret != null && ret < 0 ? '↘' : '↗'}</span><small>Estimated return</small><b className={`mono ${ret != null && ret < 0 ? 'down' : 'up'}`}>{ret != null ? `${ret < 0 ? '↘' : '↗'} ${pct(Math.abs(ret), 2)}` : '–'}</b></div>
                </div>
            </div>
            {a.bank.length > 0 && (
                <div className="hs-bank">{a.bank.map((x) => (
                    <div key={x.nama} title={`${x.rating}${x.tgl ? ` · ${x.tgl}` : ''}${x.target ? ` · target ${usd(x.target)}` : ''}`}><span>{x.nama}</span><em className={x.arah}>{RATING_ID[x.arah]}</em></div>
                ))}</div>
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
