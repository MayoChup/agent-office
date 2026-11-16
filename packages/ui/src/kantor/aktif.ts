import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Halaman tetap hidup di belakang layar (maks. 4). Halaman yang tersembunyi = tidak aktif:
 * pengecekan berkala berhenti, lalu disegarkan lagi saat dibuka kembali.
 */
export const AktifCtx = createContext(true);
export const useAktif = () => useContext(AktifCtx);

/** setInterval yang hanya berjalan saat halaman terlihat (dan tab peramban tidak disembunyikan). */
export function useInterval(fn: () => void, ms: number | null | false) {
    const ref = useRef(fn);
    ref.current = fn;
    const aktif = useAktif();
    useEffect(() => {
        if (!aktif || !ms) return;
        const t = setInterval(() => { if (document.visibilityState !== 'hidden') ref.current(); }, ms);
        return () => clearInterval(t);
    }, [aktif, ms]);
}
