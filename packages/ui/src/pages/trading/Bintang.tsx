import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../kantor/connection';

/* Watchlist Utama bersama untuk semua tombol bintang (satu sumber, langsung sinkron). */
let daftar = new Set<string>();
let dimuat: Promise<void> | null = null;
const pendengar = new Set<() => void>();
const kabari = () => { pendengar.forEach((f) => f()); try { window.dispatchEvent(new Event('kantor:watchlist')); } catch { /* */ } };
export function muatWatch(paksa = false) {
    if (!dimuat || paksa) dimuat = apiGet<{ utama: string[] }>('/api/kantor/watchlist-folder').then((r) => { daftar = new Set(r.utama || []); pendengar.forEach((f) => f()); }).catch(() => { dimuat = null; });
    return dimuat;
}
export async function toggleWatch(s: string) {
    const ada = daftar.has(s);
    daftar = new Set(daftar); if (ada) daftar.delete(s); else daftar.add(s); kabari(); // optimis
    try { await apiPost('/api/kantor/trading/watchlist', { simbol: s, aksi: ada ? 'hapus' : 'tambah' }); }
    catch (e) { daftar = new Set(daftar); if (ada) daftar.add(s); else daftar.delete(s); kabari(); throw e; }
    return !ada;
}
export function useWatch() {
    const [, setV] = useState(0);
    useEffect(() => { const f = () => setV((x) => x + 1); pendengar.add(f); muatWatch(); return () => { pendengar.delete(f); }; }, []);
    return daftar;
}

/** Tombol bintang: ketuk = masuk/keluar Watchlist Utama. Tidak membuka halaman saham. */
export function Bintang({ s, besar = false }: { s: string; besar?: boolean }) {
    const w = useWatch();
    const on = w.has(s);
    const [sibuk, setSibuk] = useState(false);
    const [pop, setPop] = useState(false);
    const klik = async (e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault();
        if (sibuk) return; setSibuk(true);
        try { const jadi = await toggleWatch(s); if (jadi) { setPop(true); setTimeout(() => setPop(false), 450); } } catch { /* sudah dikembalikan */ } finally { setSibuk(false); }
    };
    return (
        <button type="button" className={`bintang ${on ? 'on' : ''} ${besar ? 'besar' : ''} ${pop ? 'pop' : ''}`} onClick={klik} aria-pressed={on}
            aria-label={on ? `Hapus ${s} dari Watchlist` : `Tambah ${s} ke Watchlist`} title={on ? 'Di Watchlist Utama — ketuk untuk menghapus' : 'Tambah ke Watchlist Utama'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3L2.85 9.45l6.32-.92z" /></svg>
        </button>
    );
}
