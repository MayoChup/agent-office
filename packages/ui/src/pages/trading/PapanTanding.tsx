import React from 'react';
import { Info } from './InfoI';
import type { RaporTanding } from './types';

const p = (v: number | null | undefined, d = 1) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const n1 = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });

const POLA: Array<{ k: 'arusNaik' | 'pantulNaik' | 'arusTurun' | 'pantulTurun' | 'spy'; nama: string; ket: string }> = [
    { k: 'pantulNaik', nama: 'Pantul naik', ket: 'beli saham di Zona beli / Mulai berbalik' },
    { k: 'arusNaik', nama: 'Ikut arus naik', ket: 'beli 10 skor tren teratas' },
    { k: 'pantulTurun', nama: 'Pantul turun (short)', ket: 'short saham jenuh beli yang mulai turun' },
    { k: 'arusTurun', nama: 'Ikut arus turun (short)', ket: 'short 10 skor tren terbawah' },
    { k: 'spy', nama: 'Pegang S&P 500', ket: 'pembanding: beli indeks lalu diam' }
];
const INFO_TANDING = 'Uji tanding memakai data ±5 tahun. Tiap bulan (20 hari bursa) dipilih maksimal 10 saham per pola dengan data sampai hari itu saja, dipegang sebulan, lalu diganti. Biaya transaksi (dan biaya pinjam untuk short) sudah dikurangi. Bulan tanpa kandidat dihitung pegang kas (0%).\n\n"Unggul terbukti" = rata-rata selisih bulanan vs S&P 500 lebih dari 2× galat standar (bukan kebetulan).\n\nKalau pantul naik terbukti unggul, skor sinyal utama saham di Zona beli / Mulai berbalik ikut dinaikkan, jadi tidak otomatis "Jual kuat" saat sedang di titik pantul.';

/** Papan peringkat 4 pola + S&P 500 (dipakai juga di kotak Sisi jual). */
export function PapanTanding({ t }: { t: Record<string, RaporTanding | null> | null | undefined }) {
    if (!t) return <p className="dk-uji">Uji tanding belum ada. Tekan "Uji semua sekarang" di kotak Sisi jual (Pilihan sinyal), atau tunggu uji mingguan.</p>;
    const urut = [...POLA].filter((x) => t[x.k]).sort((a, b) => (t[b.k]!.total) - (t[a.k]!.total));
    const juara = urut.find((x) => x.k !== 'spy');
    const spy = t.spy;
    return (
        <div className="pt-papan">
            <div className="pt-papan-h"><b>Uji tanding 4 pola · {spy?.bulan ?? '–'} bulan</b> <Info judul="Cara membaca uji tanding" teks={INFO_TANDING} /></div>
            <ol>
                {urut.map((x, i) => { const r = t[x.k]!; return (
                    <li key={x.k} className={x.k === 'spy' ? 'spy' : r.unggulTerbukti ? 'unggul' : ''}>
                        <span className="pt-no">{i + 1}</span>
                        <span className="pt-nama"><b>{x.nama}</b><small>{x.ket}</small></span>
                        <span className={`pt-total mono ${r.total >= 0 ? 'up' : 'down'}`}>{p(r.total)}</span>
                        <span className="pt-meta">{x.k === 'spy' ? `menang ${n1(r.winrate)}% bulan · turun maks ${n1(r.ddMaks)}%` : `${p(r.vsSpyPerBulan, 2)}/bln vs S&P · menang ${n1(r.winrate)}% bln · turun maks ${n1(r.ddMaks)}%${r.berisi < r.bulan ? ` · ${r.berisi}/${r.bulan} bln ada kandidat` : ''}`}{r.unggulTerbukti ? <em className="sj-ok"> · unggul terbukti</em> : null}</span>
                    </li>
                ); })}
            </ol>
            <small className="sb-note">{juara && t[juara.k]!.unggulTerbukti ? `${juara.nama} terbukti mengalahkan S&P 500.` : 'Belum ada pola yang terbukti mengalahkan S&P 500 setelah biaya.'} Daftar saham = S&P 500 hari ini, jadi hasil beli cenderung sedikit terlalu bagus dan short terlalu buruk.</small>
        </div>
    );
}

