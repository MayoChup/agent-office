import React from 'react';
import { useApi } from '../../kantor/api';
import { H_MODE, NAMA_MODE } from './Preset';

type SaranH = { H: number; teknikal: 'lulus' | 'lebihBaik' | 'tidak' | 'belum'; teknikalKet: string; preset: Array<{ id: string; guru: string; nama: string; rataEx: number | null }>; saran: string; keputusan?: 'pakai' | 'tipis' | 'sama'; keputusanTeks?: string };
interface Data { saran: { at: number; H: Record<string, SaranH>; teks: string | null; dibuat: number } | null; berikutnya: number; jalan: boolean; progres: string }
const tgl = (t: number) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

/** Rekomendasi otomatis dari hasil uji mundur terbaru, untuk rencana pegang posisi yang sedang dipilih. */
export function SaranUji({ mode, presetAktif, pakaiPreset }: { mode: string; presetAktif: string; pakaiPreset: (id: string) => void }) {
    const d = useApi<Data>('/api/kantor/ujimundur/saran', 1_800_000);
    const s = d.data?.saran;
    if (!s) return d.data?.jalan ? <section className="sb-card su"><small className="sb-note">🧪 Uji mundur sedang berjalan ({d.data.progres}) — rekomendasi muncul setelah selesai.</small></section> : null;
    const x = s.H[String(H_MODE[mode] ?? 20)];
    if (!x) return null;
    const ico = x.teknikal === 'lulus' || x.keputusan === 'pakai' ? '✅' : x.keputusan === 'tipis' ? '⚠️' : x.preset.length ? '🟡' : '⚠️';
    const terbaik = x.preset[0];
    return (
        <section className={`sb-card su ${x.teknikal === 'lulus' || x.keputusan === 'pakai' ? 'ok' : 'warn'}`}>
            <div className="su-h"><b>🧪 Rekomendasi dari uji data — {NAMA_MODE[mode] || mode}</b><small>uji {tgl(s.at)}{d.data?.berikutnya ? ` · diuji ulang otomatis ±${tgl(d.data.berikutnya)}` : ''}</small></div>
            {x.keputusanTeks && <p className={`su-putus ${x.keputusan || ''}`}>{x.keputusan === 'pakai' ? '🎯' : x.keputusan === 'tipis' ? '🛑' : '⚖️'} {x.keputusanTeks}</p>}
            <p className="su-saran">{ico} {x.saran}</p>
            <p className="su-ket">{x.teknikalKet}</p>
            {terbaik && x.keputusan !== 'tipis' && presetAktif !== terbaik.id && <button className="btn small" onClick={() => pakaiPreset(terbaik.id)}>Pakai preset {terbaik.guru}</button>}
            {terbaik && presetAktif === terbaik.id && <small className="sb-note">✓ Preset {terbaik.guru} sedang dipakai.</small>}
            {s.teks && <details className="su-ai"><summary>✨ Penjelasan AI (semua rencana posisi)</summary><p>{s.teks}</p></details>}
        </section>
    );
}
