import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './connection';
import { useAktif } from './aktif';

/** Simpanan jawaban terakhir per alamat: kembali ke kombinasi yang pernah dibuka (preset/horison) tampil seketika. */
const SIMPAN = new Map<string, { at: number; d: any }>();
export function simpanApi<T>(path: string): T | null { return (SIMPAN.get(path)?.d as T) ?? null; }
export function taruhApi(path: string, d: any) { SIMPAN.set(path, { at: Date.now(), d }); if (SIMPAN.size > 80) SIMPAN.delete(SIMPAN.keys().next().value as string); }
/** Ambil lewat simpanan: kalau masih segar (< maksMs) tidak perlu ke server. */
export async function apiGetSimpan<T>(path: string, maksMs = 60_000): Promise<T> {
    const c = SIMPAN.get(path);
    if (c && Date.now() - c.at < maksMs) return c.d as T;
    const d = await apiGet<T>(path); taruhApi(path, d); return d;
}

/** Ambil data API kantor + muat ulang berkala. Data lama tetap tampil saat memuat ulang. */
export function useApi<T>(path: string, refreshMs = 0) {
    const [data, setData] = useState<T | null>(() => simpanApi<T>(path));
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const alive = useRef(true);
    const terakhir = useRef(0);
    const aktif = useAktif();
    const load = useCallback(async (extra = '', cepat = false) => {
        if (!path) return;
        const c = SIMPAN.get(path);
        if (cepat && c && !extra) {
            setData(c.d); terakhir.current = c.at;
            if (Date.now() - c.at < 60_000) return; // masih segar → tidak perlu ke server
        }
        setLoading(!(cepat && c));
        try {
            const d = await apiGet<T>(path + extra);
            if (!extra) taruhApi(path, d);
            terakhir.current = Date.now();
            if (alive.current) { setData(d); setError(''); }
        } catch (e: any) {
            if (alive.current) setError(String(e?.message || e));
        }
        if (alive.current) setLoading(false);
    }, [path]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { load('', true); }, [load]);
    // Muat ulang berkala hanya saat halaman terlihat.
    useEffect(() => {
        if (!aktif || !refreshMs) return;
        const t = setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, refreshMs);
        return () => clearInterval(t);
    }, [load, refreshMs, aktif]);
    // Kembali ke halaman ini setelah lama ditinggal → segarkan diam-diam (isi lama tetap tampil).
    useEffect(() => {
        if (aktif && terakhir.current && Date.now() - terakhir.current > Math.min(refreshMs || Infinity, 120_000)) load();
    }, [aktif]); // eslint-disable-line react-hooks/exhaustive-deps
    return { data, error, loading, reload: load };
}

export interface TradingData {
    capital: number; riskPct: number; watchlist: string[];
    positions: Array<{ symbol: string; shares: number; entry: number; target: number; stop: number; openedAt: string; price: number | null; pnl: number | null; notified?: { target?: string; stop?: string } }>;
    plans: Array<{ id: number; symbol: string; entry: number; target: number; stop: number; shares: number; dollars: number; riskDollars: number; trend: string }>;
    history: Array<{ symbol: string; entry: number; exit: number; pnl: number; closedAt: string }>;
    laporan: Array<{ nama: string; tanggal: string; isi: string }>;
}
export interface Acara { id: string; judul: string; mulai: string; selesai: string; seharian: boolean; tempat: string; catatan: string; link: string; dariWa: boolean }
