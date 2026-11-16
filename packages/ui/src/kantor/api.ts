import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './connection';
import { useAktif } from './aktif';

/** Ambil data API kantor + muat ulang berkala. Data lama tetap tampil saat memuat ulang. */
export function useApi<T>(path: string, refreshMs = 0) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const alive = useRef(true);
    const terakhir = useRef(0);
    const aktif = useAktif();
    const load = useCallback(async (extra = '') => {
        if (!path) return;
        setLoading(true);
        try {
            const d = await apiGet<T>(path + extra);
            terakhir.current = Date.now();
            if (alive.current) { setData(d); setError(''); }
        } catch (e: any) {
            if (alive.current) setError(String(e?.message || e));
        }
        if (alive.current) setLoading(false);
    }, [path]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { load(); }, [load]);
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
