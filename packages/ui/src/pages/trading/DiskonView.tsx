import React, { useMemo, useState } from 'react';
import { Kartu } from './PilihanView';
import type { Baris, ScreenerData, Tahap } from './types';
import { PapanTanding } from './PapanTanding';
import { PitaAcara, useSaringLaba } from './Acara';
export { PapanTanding };

/**
 * Segmen "Pantul" di Sinyal (dulu "Diskon"): saham yang berpeluang balik naik, dua jenis —
 *   koreksi di tren naik (tren panjang masih naik, sedang turun tajam sebentar) · diskon dalam (fundamental kuat, harga jauh turun).
 * Tahap sama: Pantau → Zona beli → Mulai berbalik. Label sinyal utama tetap tampil apa adanya.
 * Di atasnya: papan uji tanding 4 pola (ikut arus / pantul × naik / turun) vs pegang S&P 500.
 */
type Saring = Tahap | 'koreksi' | 'diskon' | '';
const SARING: Array<{ k: Saring; label: string }> = [
    { k: '', label: 'Semua' }, { k: 'balik', label: 'Mulai berbalik' }, { k: 'zona', label: 'Zona beli' }, { k: 'pantau', label: 'Pantau' },
    { k: 'koreksi', label: 'Koreksi di tren naik' }, { k: 'diskon', label: 'Diskon dalam' }
];
const PERINGKAT: Record<Tahap, number> = { balik: 0, zona: 1, pantau: 2 };
const LS = 'kantor:pantul:saring';
const p = (v: number | null | undefined, d = 1) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);

/** Ringkasan hasil uji per jenis pantul (20 hari). */
export function RingkasUji({ uji, H }: { uji: ScreenerData['diskonUji']; H: number }) {
    if (!uji) return <p className="dk-uji">Belum ada hasil uji untuk pola pantul. Hasil pertama muncul setelah uji mundur berikutnya.</p>;
    const kunci = H <= 10 ? 5 : H <= 30 ? 20 : 60;
    const r = uji.H[String(kunci)]; if (!r) return null;
    const baris = (j: 'koreksi' | 'diskon', nama: string) => {
        const b = r[`${j}_balik`], z = r[`${j}_zona`];
        if (!b?.n && !z?.n) return null;
        return <li key={j}><b>{nama}</b>: Mulai berbalik {p(b?.rataEx, 2)} vs S&P 500 ({(b?.n || 0).toLocaleString('id-ID')} kejadian) · Zona beli {p(z?.rataEx, 2)} ({(z?.n || 0).toLocaleString('id-ID')})</li>;
    };
    return (
        <div className="dk-uji">
            <small>Uji 5 tahun, {kunci} hari bursa ke depan, rata-rata selisih dengan S&P 500 (semua saham: {p(r.semua?.rataEx, 2)}):</small>
            <ul>{baris('koreksi', 'Koreksi di tren naik')}{baris('diskon', 'Diskon dalam')}</ul>
            {uji.fundInfo && !uji.fundInfo.sampel && <small className="sb-note">{uji.fundInfo.catatan} Jenis "diskon dalam" butuh data fundamental lampau, jadi belum bisa diuji.</small>}
        </div>
    );
}

export function DiskonView({ data, onOpen, H, keRiset }: { data: ScreenerData; onOpen: (s: string) => void; H: number; keRiset?: () => void }) {
    const [saring, setSaringS] = useState<Saring>(() => { try { return (localStorage.getItem(LS) as Saring) || ''; } catch { return ''; } });
    const setSaring = (t: Saring) => { setSaringS(t); try { localStorage.setItem(LS, t); } catch { /* */ } };
    const semua = useMemo(() => data.baris.filter((b): b is Baris & { diskon: NonNullable<Baris['diskon']> } => !!b.diskon), [data]);
    const disaringLaba = useSaringLaba();
    const cocok = (b: (typeof semua)[number], t: Saring) => !disaringLaba(b.s) && (!t || b.diskon.tahap === t || b.diskon.jenis === t);
    const tampil = useMemo(() => semua.filter((b) => cocok(b, saring))
        .sort((a, b) => PERINGKAT[a.diskon.tahap] - PERINGKAT[b.diskon.tahap] || (b.skor?.fundamental?.skor ?? 0) * 20 + b.diskon.dariPuncak / 5 - ((a.skor?.fundamental?.skor ?? 0) * 20 + a.diskon.dariPuncak / 5)), [semua, saring]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div className="dk">
            <div className="dk-kepala">
                <h3>Peluang pantul</h3>
                <p>Saham yang berpeluang balik naik: <b>koreksi di tren naik</b> (tren panjang masih naik, sedang turun tajam sebentar) dan <b>diskon dalam</b> (fundamental kuat, harga sudah jauh turun). Label sinyal di kartu bisa tetap <b>Jual</b> kalau trennya belum pulih; tahap menunjukkan seberapa dekat ke titik masuk.</p>
                {keRiset && <button className="hs-link dk-riset" onClick={keRiset}>Lihat hasil uji pola pantul di Riset → Uji mundur</button>}
            </div>
            <PitaAcara />
            <div className="dk-saring" role="tablist" aria-label="Saring peluang pantul">
                {SARING.map((t) => <button key={t.k || 'semua'} role="tab" aria-selected={saring === t.k} className={saring === t.k ? 'on' : ''} onClick={() => setSaring(t.k)}>{t.label} <span>{semua.filter((b) => cocok(b, t.k)).length}</span></button>)}
            </div>
            {!tampil.length ? (
                <div className="fin-empty">{semua.length ? 'Tidak ada saham di saringan ini sekarang.' : 'Belum ada saham yang sedang berpeluang pantul.'}</div>
            ) : (
                <div className="sb-grid">{tampil.map((b) => <Kartu key={b.s} b={b} faktor="semua" onOpen={onOpen} />)}</div>
            )}
        </div>
    );
}
