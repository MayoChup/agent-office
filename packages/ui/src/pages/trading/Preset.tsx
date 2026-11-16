import React, { useState } from 'react';
import { useApi } from '../../kantor/api';

export interface PresetInfo { id: string; jenis: 'teknikal' | 'fundamental'; nama: string; guru: string; ringkas: string; info: string; cocok: string[]; kriteria: string[] }
export interface PresetData { preset: PresetInfo[]; rekomendasi: Record<string, { teknikal: string[]; fundamental: string[]; alasan: string }>; rekomendasiUji?: Record<string, { id: string; rataEx: number; menang: number; n: number } | null> | null; statusUji?: Record<string, Record<string, { terbukti: boolean; rataEx: number | null; n: number }>> | null }
export const H_MODE: Record<string, number> = { scalping: 1, daytrade: 1, swingpendek: 5, swing: 20, posisi: 60, investasi: 60 };
export interface PresetEval { id: string; jenis: string; hasil: Array<{ t: string; ok: boolean | null }>; lolos: number; dinilai: number; total: number; persen: number | null }
export const NAMA_MODE: Record<string, string> = { scalping: 'Scalping', daytrade: 'Day trading', swingpendek: 'Swing pendek', swing: 'Swing', posisi: 'Posisi', investasi: 'Investasi' };

export function usePreset() { return useApi<PresetData>('/api/kantor/preset', 0); }

/** Pilihan preset guru (satu jenis) + tombol ⓘ penjelasan + tanda ⭐ yang direkomendasikan untuk rencana posisi. */
export function PresetPilih({ jenis, aktif, setAktif, mode, data }: { jenis: 'teknikal' | 'fundamental'; aktif: string; setAktif: (id: string) => void; mode: string; data: PresetData | null }) {
    const [info, setInfo] = useState<string | null>(null);
    if (!data) return null;
    const rek = data.rekomendasi[mode]?.[jenis] || [];
    const uji = jenis === 'teknikal' ? data.statusUji?.[String(H_MODE[mode] ?? 20)] : null;
    const nilai = (id: string) => (uji?.[id]?.terbukti ? 2 : 0) + (rek.includes(id) ? 1 : 0);
    const list = data.preset.filter((p) => p.jenis === jenis).sort((a, b) => nilai(b.id) - nilai(a.id));
    const pi = list.find((p) => p.id === info);
    const bdg = (id: string) => { const u = uji?.[id]; if (!u) return null; return u.terbukti ? <em className="pr-bdg ok" title={`Uji mundur: rata-rata ${u.rataEx}% vs S&P 500 (${u.n} kasus)`}>✓ terbukti {u.rataEx != null ? `${u.rataEx >= 0 ? '+' : ''}${u.rataEx.toFixed(2)}%` : ''}</em> : <em className="pr-bdg" title={u.n < 300 ? 'kasus terlalu sedikit untuk dinilai' : `rata-rata ${u.rataEx}% vs S&P 500 — tidak mengalahkan pasar secara meyakinkan`}>belum terbukti</em>; };
    return (
        <div className="pr-pilih">
            <div className="pr-chips">
                <button className={!aktif ? 'on' : ''} onClick={() => setAktif('')}>Tanpa preset</button>
                {list.map((p) => (
                    <span key={p.id} className={`pr-chip ${aktif === p.id ? 'on' : ''}`}>
                        <button onClick={() => setAktif(aktif === p.id ? '' : p.id)} title={p.ringkas}>{uji?.[p.id]?.terbukti && '⭐ '}{p.guru} <small>· {p.nama}</small>{bdg(p.id)}{rek.includes(p.id) && <em className="pr-bdg cocok" title="Secara teori cocok untuk rencana posisi ini">cocok</em>}</button>
                        <button className="pr-i" onClick={() => setInfo(info === p.id ? null : p.id)} aria-label={`Info ${p.nama}`}>i</button>
                    </span>
                ))}
            </div>
            {jenis === 'teknikal' && (uji ? <small className="pr-catat">⭐ / ✓ terbukti = lolos uji mundur untuk {NAMA_MODE[mode] || mode} (±{H_MODE[mode] ?? 20} hari bursa). "cocok" = sesuai teori gaya trading, belum tentu terbukti.</small> : <small className="pr-catat">Jalankan Uji mundur untuk melihat preset mana yang terbukti di mode ini.</small>)}
            {jenis === 'fundamental' && <small className="pr-catat">Preset fundamental belum bisa diuji mundur (riwayat laporan keuangan per tanggal tidak tersedia gratis) — anggap sebagai saringan kualitas, belum terbukti.</small>}
            {pi && (
                <div className="pr-info">
                    <b>{pi.guru} — {pi.nama}</b>
                    <p>{pi.info}</p>
                    <small>Kriteria:</small>
                    <ul>{pi.kriteria.map((k) => <li key={k}>{k}</li>)}</ul>
                    <small>Cocok untuk: {pi.cocok.map((c) => NAMA_MODE[c] || c).join(', ')}</small>
                </div>
            )}
        </div>
    );
}

/** Kotak rekomendasi preset untuk rencana pegang posisi yang sedang dipilih. */
export function PresetRekomendasi({ mode, data, pakai }: { mode: string; data: PresetData | null; pakai: (t: string, f: string) => void }) {
    if (!data) return null;
    const r = data.rekomendasi[mode];
    if (!r) return null;
    const nm = (id: string) => { const p = data.preset.find((x) => x.id === id); return p ? `${p.guru} (${p.nama})` : id; };
    return (
        <div className="pr-rek">
            <div><b>🎓 Gaya yang cocok untuk {NAMA_MODE[mode] || mode}</b> <small className="pr-teori">(teori — lihat bukti di bawah)</small></div>
            <div className="pr-rek-l">
                <span>📈 Teknikal: {r.teknikal.length ? r.teknikal.map(nm).join(' · ') : '—'}</span>
                <span>🏛️ Fundamental: {r.fundamental.length ? r.fundamental.map(nm).join(' · ') : 'tidak dipakai untuk posisi sependek ini'}</span>
            </div>
            <p>{r.alasan}</p>
            {data.rekomendasiUji && (() => { const u = data.rekomendasiUji![String(H_MODE[mode] ?? 20)]; return u
                ? <p className="pr-uji ok">📊 Uji mundur: <b>{nm(u.id)}</b> terbukti paling baik untuk mode ini — rata-rata {u.rataEx >= 0 ? '+' : ''}{u.rataEx.toFixed(2)}% vs S&P 500, menang {u.menang}% ({u.n.toLocaleString('id-ID')} kasus).</p>
                : <p className="pr-uji">📊 Uji mundur: <b>belum ada</b> preset teknikal yang terbukti mengalahkan pasar untuk mode ini — gaya di atas hanya teori. Anggap preset sebagai saringan gaya, bukan jaminan.</p>; })()}
            <button className="btn small" onClick={() => pakai(data.rekomendasiUji?.[String(H_MODE[mode] ?? 20)]?.id || r.teknikal[0] || '', r.fundamental[0] || '')}>{data.rekomendasiUji?.[String(H_MODE[mode] ?? 20)] ? 'Pakai yang terbukti' : 'Pakai gaya ini (belum terbukti)'}</button>
        </div>
    );
}

/** Daftar centang kriteria satu preset untuk satu saham. */
export function PresetCek({ ev, p }: { ev: PresetEval; p: PresetInfo }) {
    return (
        <div className="pr-cek">
            <div className="pr-cek-h"><b>{p.guru} — {p.nama}</b><span className={`pr-pct ${ev.persen == null ? '' : ev.persen >= 75 ? 'ok' : ev.persen >= 50 ? 'mid' : 'no'}`}>{ev.persen == null ? 'data kurang' : `${ev.lolos}/${ev.dinilai} lolos · ${ev.persen}%`}</span></div>
            <ul>{ev.hasil.map((h) => <li key={h.t} className={h.ok == null ? 'na' : h.ok ? 'ok' : 'no'}>{h.ok == null ? '·' : h.ok ? '✓' : '✗'} {h.t}{h.ok == null ? ' (data belum ada)' : ''}</li>)}</ul>
        </div>
    );
}
