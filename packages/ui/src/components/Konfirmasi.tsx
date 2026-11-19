import React, { useEffect, useRef, useState } from 'react';
import { useKembali } from '../kantor/kembali';

/**
 * Pengganti kotak konfirmasi bawaan browser (kotak abu-abu "localhost says"): lembar konfirmasi di dalam aplikasi.
 * Pemakaian: if (!(await konfirmasi('Hapus folder ini?'))) return;
 */
type Minta = { pesan: string; ok: string; bahaya: boolean; selesai: (v: boolean) => void };
let pasang: ((m: Minta) => void) | null = null;

const KATA = /^(Hapus|Keluar|Putuskan|Pindahkan|Setujui|Kirim|Unggah|Batalkan|Ganti|Bersihkan|Ubah)\b/i;
export function konfirmasi(pesan: string, opsi: { ok?: string; bahaya?: boolean } = {}): Promise<boolean> {
    const kata = pesan.match(KATA)?.[1];
    const ok = opsi.ok || (kata ? kata[0].toUpperCase() + kata.slice(1).toLowerCase() : 'Lanjutkan');
    const bahaya = opsi.bahaya ?? /^(hapus|keluar|putuskan|bersihkan)/i.test(pesan);
    if (!pasang) return Promise.resolve(window.confirm(pesan));
    return new Promise((selesai) => pasang!({ pesan, ok, bahaya, selesai }));
}

/** Dipasang sekali di App. */
export function KonfirmasiHost() {
    const [m, setM] = useState<Minta | null>(null);
    const okRef = useRef<HTMLButtonElement>(null);
    useEffect(() => { pasang = setM; return () => { pasang = null; }; }, []);
    useEffect(() => { if (m) setTimeout(() => okRef.current?.focus(), 30); }, [m]);
    const tutup = (v: boolean) => { m?.selesai(v); setM(null); };
    useKembali(!!m, () => tutup(false));
    if (!m) return null;
    return (
        <div className="kf-latar" onClick={() => tutup(false)} onKeyDown={(e) => { if (e.key === 'Escape') tutup(false); }}>
            <div className="kf" role="alertdialog" aria-modal="true" aria-label="Konfirmasi" onClick={(e) => e.stopPropagation()}>
                <p>{m.pesan}</p>
                <div className="kf-aksi">
                    <button className="btn" onClick={() => tutup(false)}>Batal</button>
                    <button ref={okRef} className={`btn ${m.bahaya ? 'bahaya' : 'primary'}`} onClick={() => tutup(true)}>{m.ok}</button>
                </div>
            </div>
        </div>
    );
}
