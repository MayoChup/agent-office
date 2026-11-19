import { useEffect, useRef } from 'react';

/**
 * Tombol Back HP/Android & browser:
 *  - lapisan (lembar, detail, thread chat) yang sedang terbuka ditutup dulu, satu per satu;
 *  - kalau tidak ada lapisan, kembali ke halaman sebelumnya (App memasang riwayat halaman).
 * Aplikasi tidak lagi langsung tertutup saat Back ditekan.
 */
const lapisan: Array<() => void> = [];
let abaikan = 0;
type Halaman = (page: string) => void;
let keHalaman: Halaman | null = null;

if (typeof window !== 'undefined') {
    window.addEventListener('popstate', (e) => {
        if (abaikan > 0) { abaikan--; return; }
        const tutup = lapisan.pop();
        if (tutup) { tutup(); return; }
        const p = (e.state && (e.state as any).kantorHal) || location.hash.replace('#', '');
        if (p && keHalaman) keHalaman(p);
    });
}

/** App mendaftarkan cara pindah halaman tanpa menambah riwayat lagi. */
export function daftarHalaman(fn: Halaman) { keHalaman = fn; }

/** Dipanggil App saat halaman berganti karena klik (bukan karena Back). */
export function catatHalaman(page: string, pertama: boolean) {
    const st = { kantorHal: page };
    // Pindah halaman lewat menu: lapisan di halaman lama dilepas (tetap terbuka di sana), Back berikutnya kembali ke halaman itu.
    if (!pertama) lapisan.length = 0;
    if (pertama || (history.state as any)?.kantorHal === page) history.replaceState(st, '', `#${page}`);
    else history.pushState(st, '', `#${page}`);
}

/** Lapisan yang bisa ditutup dengan Back. Saat ditutup lewat tombol di layar, entri riwayatnya ikut dibuang. */
export function useKembali(terbuka: boolean, tutup: () => void) {
    const fnTutup = useRef(tutup); fnTutup.current = tutup;
    useEffect(() => {
        if (!terbuka) return;
        const fn = () => fnTutup.current();
        history.pushState({ ...(history.state || {}), kantorLapis: lapisan.length + 1 }, '');
        lapisan.push(fn);
        return () => {
            const i = lapisan.lastIndexOf(fn);
            if (i >= 0) { lapisan.splice(i, 1); abaikan++; history.back(); }
        };
    }, [terbuka]);
}
