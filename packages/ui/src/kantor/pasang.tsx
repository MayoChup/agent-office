import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Ikon } from '../components/Ikon';
/* Pasang situs sebagai aplikasi (PWA). Android/Chrome: dialog bawaan. iPhone/iPad: petunjuk "Tambah ke Layar Utama". */
let tawaran: any = null;
const subs = new Set<() => void>();
export function mulaiPasang() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); tawaran = e; subs.forEach((f) => f()); });
    window.addEventListener('appinstalled', () => { tawaran = null; subs.forEach((f) => f()); });
    if ('serviceWorker' in navigator && location.protocol === 'https:') window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
const terpasang = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function TombolPasang({ className, kecil }: { className: string; kecil?: boolean }) {
    const [, setV] = useState(0);
    const [panduan, setPanduan] = useState(false);
    useEffect(() => { const f = () => setV((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
    if (terpasang()) return null;
    const klik = async () => {
        if (tawaran) { tawaran.prompt(); try { await tawaran.userChoice; } catch { /* */ } tawaran = null; setV((x) => x + 1); return; }
        setPanduan(true);
    };
    return (
        <>
            <button className={className} onClick={klik} title="Pasang Kantor sebagai aplikasi di HP/laptop">
                <span className={kecil ? 'sb-ico' : 'laci-ico'}><Ikon e="📲" /></span>
                <span className={kecil ? 'sb-t' : 'laci-t'}><b>Pasang aplikasi</b><small>{ios() ? 'iPhone / iPad' : 'Android / laptop'}</small></span>
            </button>
            {panduan && createPortal(
                <div className="pasang-bg interactive" onClick={() => setPanduan(false)}>
                    <div className="pasang" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cara memasang aplikasi">
                        <img src="/icon-192.png" alt="" width={56} height={56} />
                        <h3>Pasang Kantor di {ios() ? 'iPhone / iPad' : 'perangkat ini'}</h3>
                        {ios() ? (
                            <ol>
                                <li>Buka situs ini di <b>Safari</b> (bukan di dalam aplikasi lain seperti Telegram/WhatsApp).</li>
                                <li>Ketuk tombol <b>Bagikan</b> <span className="pasang-ikon"><Ikon e="⬆" />︎</span> di bawah (iPad: kanan atas).</li>
                                <li>Gulir, pilih <b>"Tambah ke Layar Utama"</b> / <b>"Add to Home Screen"</b>.</li>
                                <li>Ketuk <b>Tambah</b>. Ikon Kantor muncul di layar utama — buka dari situ, lalu masuk sekali lagi dengan kata sandi.</li>
                            </ol>
                        ) : (
                            <ol>
                                <li>Buka situs ini di <b>Chrome</b> (atau Edge).</li>
                                <li>Ketuk menu <b>⋮</b> di kanan atas.</li>
                                <li>Pilih <b>"Instal aplikasi"</b> / <b>"Tambahkan ke layar utama"</b>, lalu <b>Instal</b>.</li>
                            </ol>
                        )}
                        <button className="btn primary" onClick={() => setPanduan(false)}>Mengerti</button>
                    </div>
                </div>, document.body)}
        </>
    );
}
