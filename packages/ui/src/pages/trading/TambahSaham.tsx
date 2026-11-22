import React, { useState } from 'react';
import { apiPost } from '../../kantor/connection';
import { kodeDari } from './aliasSaham';

/**
 * Muncul saat pencarian tidak menemukan saham: tawarkan "Tambah & analisis sekarang".
 * Saham masuk Watchlist Utama (ikut pembaruan rutin) dan langsung dianalisis ±1 menit.
 */
export function TambahSaham({ q, onSelesai }: { q: string; onSelesai: (s: string) => void }) {
    const kode = kodeDari(q);
    const [sibuk, setSibuk] = useState(false), [galat, setGalat] = useState('');
    if (!kode) return <div className="fin-empty">Tidak ada saham yang cocok dengan "{q}". Coba kode sahamnya (mis. TSMC = TSM).</div>;
    const tambah = async () => {
        setSibuk(true); setGalat('');
        try { const r = await apiPost<{ simbol: string }>('/api/kantor/screener/tambah', { simbol: kode }); window.dispatchEvent(new Event('kantor:screener-segarkan')); window.dispatchEvent(new Event('kantor:watchlist')); onSelesai(r.simbol); }
        catch (e: any) { setGalat(String(e?.message || e)); } finally { setSibuk(false); }
    };
    return (
        <div className="sb-card ts-tambah">
            <div><b>{kode} belum ada di penyaring</b><p>Penyaring berisi S&P 500, ±40 saham besar non-AS (ADR), dan saham di watchlist Bapak. Tambahkan {kode} supaya ikut dianalisis dan dipantau.</p></div>
            <button className="btn primary" onClick={tambah} disabled={sibuk}>{sibuk ? 'Mengambil data…' : `Tambah & analisis ${kode}`}</button>
            {galat && <div className="error">{galat}</div>}
        </div>
    );
}
