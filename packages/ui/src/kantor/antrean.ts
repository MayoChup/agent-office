/**
 * U24 · Antrean luring: pesan chat yang dikirim saat sinyal putus disimpan di perangkat ini,
 * lalu dikirim otomatis begitu tersambung lagi (urut, satu per satu).
 */
import { useEffect, useState } from 'react';
import { apiPost } from './connection';
import { eventBus } from '../events';

type Item = { id: string; path: string; body: unknown; at: number };
const KUNCI = 'kantor:antrean';
const baca = (): Item[] => { try { return JSON.parse(localStorage.getItem(KUNCI) || '[]'); } catch { return []; } };
const tulis = (x: Item[]) => { try { localStorage.setItem(KUNCI, JSON.stringify(x.slice(-50))); } catch { /* penuh/privat */ } eventBus.dispatchEvent(new CustomEvent('antrean-ubah')); };

export const luring = () => typeof navigator !== 'undefined' && navigator.onLine === false;
/** Galat jaringan (bukan galat dari server) → layak diantrekan. */
export const galatJaringan = (e: any) => luring() || e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|tidak tersambung/i.test(String(e?.message || e));

export function antrekan(path: string, body: unknown) {
    const it: Item = { id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, path, body, at: Date.now() };
    tulis([...baca(), it]); return it;
}
export const isiAntrean = (awalan = '') => baca().filter((x) => x.path.startsWith(awalan));

let mengirim = false;
export async function kirimAntrean() {
    if (mengirim || luring()) return; mengirim = true;
    try {
        for (const it of baca()) {
            try { await apiPost(it.path, it.body); tulis(baca().filter((x) => x.id !== it.id)); eventBus.dispatchEvent(new CustomEvent('antrean-terkirim', { detail: { path: it.path } })); }
            catch (e) { if (galatJaringan(e)) break; tulis(baca().filter((x) => x.id !== it.id)); /* ditolak server: buang supaya tidak macet */ }
        }
    } finally { mengirim = false; }
}
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void kirimAntrean());
    setInterval(() => { if (baca().length) void kirimAntrean(); }, 30_000);
    setTimeout(() => void kirimAntrean(), 3000);
}

/** Pita kecil di bawah layar: status luring & jumlah pesan yang menunggu. */
export function useLuring() {
    const [st, setSt] = useState({ luring: luring(), antre: baca().length });
    useEffect(() => {
        const f = () => setSt({ luring: luring(), antre: baca().length });
        window.addEventListener('online', f); window.addEventListener('offline', f); eventBus.addEventListener('antrean-ubah', f);
        return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); eventBus.removeEventListener('antrean-ubah', f); };
    }, []);
    return st;
}
