import React from 'react';

import { Ikon } from '../../components/Ikon';
/* Tipe data Knowledge Reels (sama dengan server kantor/kr.ts). */
export interface KSumber { judul: string; url?: string; penerbit?: string; tgl?: string }
export interface KDampak { kode: string; bursa: 'US' | 'IDX'; arah: 'naik' | 'turun' | 'campur'; alasan: string }
export interface KSlide { judul?: string; poin?: string[]; teks?: string }
export interface KGame { jenis: string; soal: string; pilihan?: string[]; jawaban?: number; penjelasan?: string; urutan?: string[]; tampilDetik?: number; acak?: string }
export interface KCatatan { id: string; postId: string; teks: string; at: number; berkas?: string; dari?: string; nama?: string; induk?: string; status?: 'menunggu' | 'gagal' }
export interface KPost {
    id: string; kat: string; judul: string; sub?: string; slide: KSlide[]; penutup?: string; sumber: KSumber[]; dampak?: KDampak[]; game?: KGame;
    desain: { t: string; p: string }; oleh: Array<{ id: string; nama: string; peran: string }>; dibuat: number; tgl: string;
    baca?: boolean; folder?: string[]; catatan?: KCatatan[]; jawab?: { benar: boolean | null; at: number; isi?: string } | null;
}
export interface KTema { nama: string; ikon: string; ket: string; segmen: string }

export type Lembar = { jenis: 'sampul' } | { jenis: 'isi'; s: KSlide; i: number } | { jenis: 'dampak' } | { jenis: 'penutup' };
/** Susunan slide: sampul → isi → saham terdampak → penutup. Brain game cukup satu lembar (interaktif). */
export function lembarDari(p: KPost): Lembar[] {
    if (p.game) return [{ jenis: 'sampul' }];
    return [{ jenis: 'sampul' }, ...p.slide.map((s, i) => ({ jenis: 'isi' as const, s, i })), ...(p.dampak?.length ? [{ jenis: 'dampak' as const }] : []), ...(p.penutup ? [{ jenis: 'penutup' as const }] : [])];
}
const ARAH: Record<string, string> = { naik: '↑', turun: '↓', campur: '↕' };

/** Satu lembar carousel 4:5. Ukuran huruf memakai satuan cqw → tampilan sama di feed, grid, dan thumbnail. */
export function LembarKr({ p, l, tema, n, total, children }: { p: KPost; l: Lembar; tema?: KTema; n?: number; total?: number; children?: React.ReactNode }) {
    const t = p.desain?.t || 'kertas', pal = p.desain?.p || 'sage';
    return (
        <div className={`krs t-${t} p-${pal} j-${l.jenis}${p.game ? ' j-game' : ''}`}>
            <i className="d1" /><i className="d2" /><i className="d3" />
            <div className="krs-isi">
                {l.jenis === 'sampul' && (
                    <>
                        <span className="krs-tema"><span className="krs-ikon"><Ikon e={tema?.ikon} /></span> {tema?.nama}</span>
                        <h2 className="krs-judul">{p.judul}</h2>
                        {!p.game && p.sub && <p className="krs-sub">{p.sub}</p>}
                        {p.game && <p className="krs-soal">{p.game.soal}</p>}
                        {children}
                        {!p.game && (total || 0) > 1 && <span className="krs-geser">Geser untuk baca</span>}
                    </>
                )}
                {l.jenis === 'isi' && (
                    <>
                        {l.s.judul && <h3 className="krs-h">{l.s.judul}</h3>}
                        {l.s.teks && <p className="krs-teks">{l.s.teks}</p>}
                        {!!l.s.poin?.length && <ul className="krs-poin">{l.s.poin.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                    </>
                )}
                {l.jenis === 'dampak' && (
                    <>
                        <h3 className="krs-h">Saham yang mungkin terdampak</h3>
                        <ul className="krs-dampak">
                            {p.dampak!.map((d) => (
                                <li key={d.kode + d.bursa} className={`a-${d.arah}`}>
                                    <b><span>{ARAH[d.arah]}</span>{d.kode}<small>{d.bursa === 'IDX' ? 'BEI' : 'AS'}</small></b>
                                    <em>{d.alasan}</em>
                                </li>
                            ))}
                        </ul>
                        <small className="krs-catatan">Perkiraan arah dari berita, bukan saran keuangan.</small>
                    </>
                )}
                {l.jenis === 'penutup' && (
                    <>
                        <span className="krs-tema">Intinya</span>
                        <p className="krs-penutup">{p.penutup}</p>
                        {!!p.sumber.length && <small className="krs-catatan">Sumber lengkap ada di keterangan.</small>}
                    </>
                )}
            </div>
            {n != null && (total || 0) > 1 && <span className="krs-hal">{n + 1}/{total}</span>}
        </div>
    );
}

/** Sampul kecil untuk grid tema / tersimpan / Catatan. */
export function SampulKr({ p, tema, onClick, tanda }: { p: KPost; tema?: KTema; onClick?: () => void; tanda?: React.ReactNode }) {
    return (
        <button className="kr-sampul" onClick={onClick} title={p.judul}>
            <LembarKr p={p} l={{ jenis: 'sampul' }} tema={tema} />
            {tanda && <span className="kr-sampul-tanda">{tanda}</span>}
        </button>
    );
}
