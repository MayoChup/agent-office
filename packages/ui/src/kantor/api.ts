import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './connection';

/** Ambil data API kantor + muat ulang berkala. Data lama tetap tampil saat memuat ulang. */
export function useApi<T>(path: string, refreshMs = 0) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const alive = useRef(true);
    const load = useCallback(async (extra = '') => {
        setLoading(true);
        try {
            const d = await apiGet<T>(path + extra);
            if (alive.current) { setData(d); setError(''); }
        } catch (e: any) {
            if (alive.current) setError(String(e?.message || e));
        }
        if (alive.current) setLoading(false);
    }, [path]);
    useEffect(() => {
        alive.current = true;
        load();
        const t = refreshMs ? setInterval(() => load(), refreshMs) : undefined;
        return () => { alive.current = false; if (t) clearInterval(t); };
    }, [load, refreshMs]);
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
