import React, { useMemo, useState } from 'react';
import { Kartu } from './PilihanView';
import { Info } from './InfoI';
import type { Baris, ScreenerData, Tahap } from './types';

/**
 * Segmen "Diskon" di Sinyal: saham berfundamental kuat yang harganya sedang turun, dikelompokkan per tahap.
 * Label sinyal utama tetap tampil apa adanya (bisa "Jual") supaya jelas sistem utama belum menyarankan beli.
 */
const TAHAP: Array<{ k: Tahap | ''; label: string }> = [{ k: '', label: 'Semua' }, { k: 'balik', label: 'Mulai berbalik' }, { k: 'zona', label: 'Zona beli' }, { k: 'pantau', label: 'Pantau' }];
const PERINGKAT: Record<Tahap, number> = { balik: 0, zona: 1, pantau: 2 };
const LS = 'kantor:diskon:tahap';

function pct(v: number | null | undefined) { return v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`; }

/** Satu kalimat jujur dari uji mundur 5 tahun: tahap "Mulai berbalik" vs semua saham berfundamental kuat. */
function RingkasUji({ uji, H }: { uji: ScreenerData['diskonUji']; H: number }) {
    if (!uji) return <p className="dk-uji">Belum ada hasil uji mundur untuk pola ini. Hasil pertama muncul setelah uji mundur mingguan berikutnya (akhir pekan).</p>;
    const kunci = H <= 10 ? 5 : H <= 30 ? 20 : 60;
    const r = uji.H[String(kunci)]; if (!r) return null;
    const b = r.balik, z = r.zona, f = r.fundKuat;
    const cukup = (a: typeof b) => a && a.n >= 200 && a.rataEx != null;
    const unggul = (a: typeof b) => cukup(a) && f.rataEx != null && a.rataEx! - f.rataEx > 2 * (a.galatStd ?? 0);
    const teks = cukup(b)
        ? `Uji 5 tahun, ${kunci} hari bursa ke depan: tahap Mulai berbalik rata-rata ${pct(b.rataEx)} vs S&P 500 (menang ${b.menang}% · ${b.n.toLocaleString('id-ID')} kejadian), Zona beli ${pct(z?.rataEx)}, semua saham berfundamental kuat ${pct(f.rataEx)}. ${unggul(b) ? 'Terbukti lebih baik daripada membeli asal fundamental kuat.' : 'Belum terbukti lebih baik daripada membeli asal fundamental kuat — anggap sebagai daftar pantau.'}`
        : 'Kejadian di uji mundur belum cukup untuk menilai pola ini (butuh ≥200). Anggap sebagai daftar pantau.';
    return <p className="dk-uji">{teks} <Info judul="Cara membaca hasil uji" teks={'Hasil dihitung dari data lampau: di setiap tanggal, saham dinilai hanya dari data sampai tanggal itu, lalu dibandingkan dengan S&P 500 pada periode yang sama (disesuaikan seberapa liar sahamnya).\n\n"Terbukti" berarti selisihnya lebih besar dari 2× galat standar, bukan kebetulan. Daftar saham = S&P 500 hari ini, jadi hasil cenderung sedikit terlalu bagus.'} /></p>;
}

export function DiskonView({ data, onOpen, H }: { data: ScreenerData; onOpen: (s: string) => void; H: number }) {
    const [tahap, setTahapS] = useState<Tahap | ''>(() => { try { return (localStorage.getItem(LS) as Tahap) || ''; } catch { return ''; } });
    const setTahap = (t: Tahap | '') => { setTahapS(t); try { localStorage.setItem(LS, t); } catch { /* */ } };
    const semua = useMemo(() => data.baris.filter((b): b is Baris & { diskon: NonNullable<Baris['diskon']> } => !!b.diskon), [data]);
    const hitung = (t: Tahap | '') => (t ? semua.filter((b) => b.diskon.tahap === t).length : semua.length);
    const tampil = useMemo(() => semua
        .filter((b) => !tahap || b.diskon.tahap === tahap)
        .sort((a, b) => PERINGKAT[a.diskon.tahap] - PERINGKAT[b.diskon.tahap] || (b.skor?.fundamental?.skor ?? 0) * 20 + b.diskon.dariPuncak / 5 - ((a.skor?.fundamental?.skor ?? 0) * 20 + a.diskon.dariPuncak / 5)), [semua, tahap]);
    return (
        <div className="dk">
            <div className="dk-kepala">
                <h3>Fundamental kuat · lagi diskon</h3>
                <p>Saham berfundamental Beli/Beli kuat yang harganya sedang turun. Label sinyal di kartu bisa tetap <b>Jual</b> karena trennya belum pulih; tahap di bawah menunjukkan seberapa dekat ke titik masuk.</p>
                <RingkasUji uji={data.diskonUji} H={H} />
            </div>
            <div className="dk-saring" role="tablist" aria-label="Tahap diskon">
                {TAHAP.map((t) => <button key={t.k || 'semua'} role="tab" aria-selected={tahap === t.k} className={tahap === t.k ? 'on' : ''} onClick={() => setTahap(t.k)}>{t.label} <span>{hitung(t.k)}</span></button>)}
            </div>
            {!tampil.length ? (
                <div className="fin-empty">{semua.length ? 'Tidak ada saham di tahap ini sekarang.' : 'Belum ada saham berfundamental kuat yang sedang diskon.'}</div>
            ) : (
                <div className="sb-grid">{tampil.map((b) => <Kartu key={b.s} b={b} faktor="semua" onOpen={onOpen} />)}</div>
            )}
        </div>
    );
}
