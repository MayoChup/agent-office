import React, { useEffect, useMemo, useState } from 'react';
import { useApi } from '../kantor/api';
import { apiGet, apiPost } from '../kantor/connection';

interface F { roe: number | null; roa: number | null; pbv: number | null; per: number | null; der: number | null; npm: number | null; revGrowth: number | null; mcap: number | null; tahun: string }
interface Sinyal {
    goldenCross: number | null; deathCross: number | null; doubleTop: string | null; doubleBottom: string | null;
    breakout52: boolean; dekat52Low: boolean; rsiOversold: boolean; rsiOverbought: boolean; macdBullish: number | null; macdBearish: number | null;
    diAtasMa200: boolean; volumeSpike: boolean; tren: 'naik' | 'turun' | 'datar';
}
interface Baris { s: string; nama: string; sektor: string; harga: number; chg1d: number; chg1m: number; chg3m: number; chg1y: number; rsi: number | null; ma50: number | null; ma200: number | null; volX: number; sinyal: Sinyal; f: F | null }
interface Data { baris: Baris[]; teknikalAt: number; teknikalSesi: string; fundamentalAt: number; sibuk: string; progres: string; gagal: number }

type NumKey = 'roe' | 'roa' | 'pbv' | 'per' | 'der' | 'npm' | 'revGrowth' | 'mcap';
const ANGKA: Array<{ k: NumKey; label: string; arah: 'min' | 'max'; satuan: string; info: string }> = [
    { k: 'roe', label: 'ROE', arah: 'min', satuan: '%', info: 'Laba ÷ modal pemegang saham. Makin tinggi makin efisien memakai modal (bagus: >15%).' },
    { k: 'roa', label: 'ROA', arah: 'min', satuan: '%', info: 'Laba ÷ total aset (bagus: >5%).' },
    { k: 'pbv', label: 'PBV', arah: 'max', satuan: '×', info: 'Harga ÷ nilai buku. Di bawah 1 = dihargai di bawah nilai bukunya (murah, atau ada masalah).' },
    { k: 'per', label: 'PER', arah: 'max', satuan: '×', info: 'Harga ÷ laba. Berapa tahun laba untuk "balik modal". Makin kecil makin murah.' },
    { k: 'der', label: 'DER', arah: 'max', satuan: '×', info: 'Utang ÷ modal. Di atas 2 = utang besar (kecuali bank).' },
    { k: 'npm', label: 'Margin laba', arah: 'min', satuan: '%', info: 'Laba bersih ÷ pendapatan.' },
    { k: 'revGrowth', label: 'Tumbuh pendapatan', arah: 'min', satuan: '%', info: 'Pendapatan tahun lalu dibanding tahun sebelumnya.' },
    { k: 'mcap', label: 'Kapitalisasi', arah: 'min', satuan: 'M$', info: 'Nilai pasar perusahaan dalam miliar USD (M = miliar). 10 = $10 miliar.' }
];
type SigKey = 'goldenCross' | 'deathCross' | 'doubleTop' | 'doubleBottom' | 'breakout52' | 'dekat52Low' | 'rsiOversold' | 'rsiOverbought' | 'macdBullish' | 'macdBearish' | 'diAtasMa200' | 'volumeSpike' | 'trenNaik' | 'trenTurun';
const SINYAL: Array<{ k: SigKey; label: string; baik: boolean | null; info: string }> = [
    { k: 'goldenCross', label: 'Golden cross', baik: true, info: 'MA50 memotong ke atas MA200 dalam 10 hari terakhir — tanda awal tren naik jangka menengah.' },
    { k: 'deathCross', label: 'Death cross', baik: false, info: 'MA50 memotong ke bawah MA200 dalam 10 hari terakhir.' },
    { k: 'doubleBottom', label: 'Double bottom', baik: true, info: 'Dua lembah setara (pola "W") — potensi berbalik naik. Terkonfirmasi kalau harga tembus garis leher.' },
    { k: 'doubleTop', label: 'Double top', baik: false, info: 'Dua puncak setara (pola "M") — potensi berbalik turun.' },
    { k: 'breakout52', label: 'Tembus tertinggi 52 mgg', baik: true, info: 'Harga penutupan tertinggi dalam 1 tahun.' },
    { k: 'dekat52Low', label: 'Dekat terendah 52 mgg', baik: null, info: 'Dalam 3% dari harga terendah setahun.' },
    { k: 'rsiOversold', label: 'RSI < 30', baik: null, info: 'Jenuh jual — sudah turun banyak dalam waktu singkat.' },
    { k: 'rsiOverbought', label: 'RSI > 70', baik: null, info: 'Jenuh beli — sudah naik banyak dalam waktu singkat.' },
    { k: 'macdBullish', label: 'MACD naik', baik: true, info: 'Garis MACD memotong ke atas garis sinyal (5 hari terakhir).' },
    { k: 'macdBearish', label: 'MACD turun', baik: false, info: 'Garis MACD memotong ke bawah garis sinyal (5 hari terakhir).' },
    { k: 'diAtasMa200', label: 'Di atas MA200', baik: true, info: 'Harga di atas rata-rata 200 hari — tren besar naik.' },
    { k: 'volumeSpike', label: 'Volume 2×', baik: null, info: 'Volume hari ini 2× rata-rata 20 hari.' },
    { k: 'trenNaik', label: 'Tren naik rapi', baik: true, info: 'Harga > MA50 > MA200 dan MA50 menanjak.' },
    { k: 'trenTurun', label: 'Tren turun', baik: false, info: 'Harga < MA50 < MA200 dan MA50 menurun.' }
];
const PRESET: Array<{ nama: string; num: Partial<Record<NumKey, string>>; sig: SigKey[] }> = [
    { nama: 'Murah & berkualitas', num: { roe: '15', pbv: '3', der: '1.5' }, sig: [] },
    { nama: 'Tumbuh cepat', num: { revGrowth: '15', npm: '10' }, sig: ['diAtasMa200'] },
    { nama: 'Momentum', num: {}, sig: ['goldenCross'] },
    { nama: 'Berbalik naik?', num: {}, sig: ['doubleBottom'] },
    { nama: 'Waspada turun', num: {}, sig: ['doubleTop'] },
    { nama: 'Jenuh jual tapi sehat', num: { roe: '10' }, sig: ['rsiOversold'] }
];
const LS = 'kantor:screener';

function cocokSinyal(b: Baris, k: SigKey) {
    const s = b.sinyal;
    if (k === 'trenNaik') return s.tren === 'naik';
    if (k === 'trenTurun') return s.tren === 'turun';
    const v = (s as any)[k];
    return v !== null && v !== false && v !== undefined;
}
const fmt = (v: number | null | undefined, sat = '') => (v == null ? '–' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}${sat}`);
const pct = (v: number) => <span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(1).replace('.', ',')}%</span>;
const sejak = (at: number) => (at ? new Date(at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : 'belum');

export function ScreenerView({ onOpen }: { onOpen: (s: string) => void }) {
    const { data, error, reload } = useApi<Data>('/api/kantor/screener', 0);
    const simpanan = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
    const [num, setNum] = useState<Partial<Record<NumKey, string>>>(simpanan.num || {});
    const [sig, setSig] = useState<SigKey[]>(simpanan.sig || []);
    const [sektor, setSektor] = useState<string>(simpanan.sektor || '');
    const [urut, setUrut] = useState<string>(simpanan.urut || 'chg1d');
    const [q, setQ] = useState('');
    const [info, setInfo] = useState<string | null>(null);
    const [msg, setMsg] = useState('');
    const [batas, setBatas] = useState(100);
    const [cari, setCari] = useState('');

    useEffect(() => { setBatas(100); }, [num, sig, sektor, urut, q]);
    useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ num, sig, sektor, urut })); } catch { /* */ } }, [num, sig, sektor, urut]);
    // Saat server sedang memperbarui data, muat ulang berkala.
    useEffect(() => { if (!data?.sibuk) return; const t = setInterval(() => reload(), 8000); return () => clearInterval(t); }, [data?.sibuk]);

    const sektorList = useMemo(() => Array.from(new Set((data?.baris || []).map((b) => b.sektor).filter(Boolean))).sort(), [data]);
    const hasil = useMemo(() => {
        if (!data) return [];
        const qq = q.trim().toUpperCase();
        const out = data.baris.filter((b) => {
            if (qq && !b.s.includes(qq) && !b.nama.toUpperCase().includes(qq)) return false;
            if (sektor && b.sektor !== sektor) return false;
            for (const a of ANGKA) {
                const raw = num[a.k];
                if (raw === undefined || raw === '') continue;
                const lim = Number(String(raw).replace(',', '.')) * (a.k === 'mcap' ? 1000 : 1);
                if (!Number.isFinite(lim)) continue;
                const v = b.f?.[a.k];
                if (v == null) return false;
                if (a.arah === 'min' ? v < lim : v > lim || v < 0) return false;
            }
            return sig.every((k) => cocokSinyal(b, k));
        });
        const val = (b: Baris): number | null => {
            const v = urut in (b.f || { roe: 0, roa: 0, pbv: 0, per: 0, der: 0, npm: 0, revGrowth: 0, mcap: 0 }) && !(urut in b) ? (b.f as any)?.[urut] : (b as any)[urut];
            return typeof v === 'number' && Number.isFinite(v) ? v : null;
        };
        const asc = ['pbv', 'per', 'der'].includes(urut);
        return out.sort((a, b) => {
            const x = val(a), y = val(b);
            if (x == null) return y == null ? 0 : 1;
            if (y == null) return -1;
            if (asc && (x < 0 || y < 0)) return x < 0 ? (y < 0 ? 0 : 1) : -1; // PBV/PER negatif (rugi) di belakang
            return asc ? x - y : y - x;
        });
    }, [data, num, sig, sektor, urut, q]);

    const perbarui = async (jenis: string) => {
        setMsg('');
        try { await apiPost('/api/kantor/screener/perbarui', { jenis }); setMsg('Sedang mengambil data… (beberapa menit, bisa ditinggal)'); setTimeout(() => reload(), 2000); }
        catch (e: any) { setMsg(String(e.message || e)); }
    };
    const aktif = Object.values(num).filter((v) => v !== undefined && v !== '').length + sig.length + (sektor ? 1 : 0);
    const bukaLuar = async (kode: string) => {
        setCari('Mencari…');
        try { await apiGet<{ baris: Baris }>(`/api/kantor/saham/${encodeURIComponent(kode)}`); onOpen(kode); setCari(''); }
        catch (e: any) { setCari(String(e.message || e)); }
    };

    const kodeCari = q.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');

    return (
        <>
            <section className="fin-card">
                <div className="inv-kicker">■ Penyaring saham · S&P 500 + watchlist</div>
                <div className="scr-presets">
                    {PRESET.map((p) => <button key={p.nama} className="chip" style={{ ['--c' as any]: '#a78bfa' }} onClick={() => { setNum(p.num); setSig(p.sig); }}>{p.nama}</button>)}
                    {aktif > 0 && <button className="chip" style={{ ['--c' as any]: '#94a3b8' }} onClick={() => { setNum({}); setSig([]); setSektor(''); }}>✕ Hapus filter ({aktif})</button>}
                </div>

                <div className="scr-sub">Fundamental <small>dari laporan resmi SEC</small></div>
                <div className="scr-nums">
                    {ANGKA.map((a) => (
                        <label key={a.k} className="scr-num">
                            <span>{a.label} <button type="button" className="scr-i" onClick={() => setInfo(info === a.k ? null : a.k)}>?</button></span>
                            <div><em>{a.arah === 'min' ? '≥' : '≤'}</em><input className="input" inputMode="decimal" placeholder="–" value={num[a.k] ?? ''} onChange={(e) => setNum({ ...num, [a.k]: e.target.value })} /><em>{a.satuan}</em></div>
                            {info === a.k && <small className="scr-info">{a.info}</small>}
                        </label>
                    ))}
                </div>

                <div className="scr-sub">Teknikal <small>ketuk untuk memilih; semua yang dipilih harus terpenuhi</small></div>
                <div className="scr-sigs">
                    {SINYAL.map((s) => {
                        const on = sig.includes(s.k);
                        return <button key={s.k} className={`scr-sig ${on ? 'on' : ''} ${s.baik === true ? 'baik' : s.baik === false ? 'buruk' : ''}`} title={s.info} onClick={() => setSig(on ? sig.filter((x) => x !== s.k) : [...sig, s.k])}>{s.label}</button>;
                    })}
                </div>
                <details className="scr-legend"><summary>Arti tiap sinyal</summary>{SINYAL.map((s) => <div key={s.k}><b>{s.label}</b> — {s.info}</div>)}</details>

                <div className="scr-row">
                    <input className="input" placeholder="Cari kode/nama" value={q} onChange={(e) => setQ(e.target.value)} />
                    <select className="select" value={sektor} onChange={(e) => setSektor(e.target.value)}>
                        <option value="">Semua sektor</option>
                        {sektorList.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select className="select" value={urut} onChange={(e) => setUrut(e.target.value)}>
                        <option value="chg1d">Urut: naik hari ini</option><option value="chg1m">Naik 1 bulan</option><option value="chg1y">Naik 1 tahun</option>
                        <option value="roe">ROE tertinggi</option><option value="pbv">PBV termurah</option><option value="per">PER termurah</option>
                        <option value="revGrowth">Tumbuh tercepat</option><option value="mcap">Terbesar</option><option value="volX">Volume tertinggi</option>
                    </select>
                </div>
            </section>

            {error && <div className="error">Gagal memuat: {error}</div>}
            {data && (
                <div className="scr-meta">
                    <span><b>{hasil.length}</b> dari {data.baris.length} saham</span>
                    <span>Harga: {data.teknikalSesi || '–'} · Fundamental: {sejak(data.fundamentalAt)}</span>
                    {data.sibuk ? <span className="scr-busy">⏳ Memperbarui {data.progres}</span> : <button className="btn small" onClick={() => perbarui('teknikal')}>↻ Perbarui</button>}
                </div>
            )}
            {msg && <div className="fin-note">{msg}</div>}
            {data && data.baris.length === 0 && <div className="fin-empty">Data belum ada. Tekan ↻ Perbarui (±5 menit untuk ±500 saham), atau tunggu otomatis setelah bursa tutup.</div>}

            {hasil.length > 0 && (
                <div className="scr-table-wrap">
                    <table className="scr-table">
                        <thead><tr><th>Saham</th><th>Harga</th><th>1H</th><th>1B</th><th>ROE</th><th>PBV</th><th>PER</th><th>Sinyal</th></tr></thead>
                        <tbody>
                            {hasil.slice(0, batas).map((b) => (
                                <tr key={b.s} onClick={() => onOpen(b.s)}>
                                    <td><b>{b.s}</b><small>{b.nama}</small></td>
                                    <td>${fmt(b.harga)}</td>
                                    <td>{pct(b.chg1d)}</td>
                                    <td>{pct(b.chg1m)}</td>
                                    <td>{fmt(b.f?.roe, '%')}</td>
                                    <td>{fmt(b.f?.pbv, '×')}</td>
                                    <td>{fmt(b.f?.per, '×')}</td>
                                    <td className="scr-tags">{SINYAL.filter((s) => cocokSinyal(b, s.k)).slice(0, 3).map((s) => <i key={s.k} className={s.baik === true ? 'baik' : s.baik === false ? 'buruk' : ''}>{s.label}</i>)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {hasil.length > batas && <button className="btn scr-more" onClick={() => setBatas(batas + 100)}>Tampilkan 100 lagi ({hasil.length - batas} tersisa)</button>}
                </div>
            )}
            {data && data.baris.length > 0 && hasil.length === 0 && !kodeCari && <div className="fin-empty">Tidak ada saham yang cocok. Longgarkan filter.</div>}
            {kodeCari && hasil.length === 0 && (
                <div className="fin-empty">
                    {kodeCari} tidak ada di daftar S&P 500 / watchlist.{' '}
                    <button className="btn small" onClick={() => bukaLuar(kodeCari)}>Buka grafik & sinyal {kodeCari}</button>
                    {cari && <div style={{ marginTop: 6 }}>{cari}</div>}
                </div>
            )}
            <p className="fin-note">Data gratis: harga Yahoo Finance (tertunda), fundamental laporan tahunan SEC. Untuk riset, bukan saran beli/jual.</p>
        </>
    );
}
