import React, { useEffect, useState } from 'react';

declare const __VERSI__: string;

/** Aplikasi yang dibiarkan terbuka (PWA di HP) tetap memakai kode lama sampai dimuat ulang.
 *  Komponen ini mengecek /versi.json tiap 5 menit & saat aplikasi dibuka lagi; kalau beda, tawarkan muat ulang. */
export function VersiBaru() {
    const [baru, setBaru] = useState(false);
    useEffect(() => {
        if (typeof __VERSI__ === 'undefined') return;
        let mati = false;
        const cek = async () => {
            try {
                const r = await fetch(`/versi.json?t=${Date.now()}`, { cache: 'no-store' });
                if (!r.ok) return;
                const j = await r.json();
                if (!mati && j?.v && j.v !== __VERSI__) setBaru(true);
            } catch { /* offline */ }
        };
        const saatTerlihat = () => { if (document.visibilityState === 'visible') void cek(); };
        const t = setInterval(cek, 5 * 60_000); void cek();
        document.addEventListener('visibilitychange', saatTerlihat);
        return () => { mati = true; clearInterval(t); document.removeEventListener('visibilitychange', saatTerlihat); };
    }, []);
    if (!baru) return null;
    return (
        <div className="versi-baru interactive" role="status">
            <span>Ada versi baru aplikasi</span>
            <button className="btn small primary" onClick={() => location.reload()}>Muat ulang</button>
        </div>
    );
}
