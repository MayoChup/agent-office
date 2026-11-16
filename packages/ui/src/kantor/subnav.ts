import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAktif } from './aktif';

/**
 * Menu bawah (HP) yang berganti sesuai halaman yang sedang dibuka.
 * Halaman memanggil useSubNav(daftar, aktif, pilih); Nav menampilkannya.
 */
export interface SubItem { k: string; ico: string; label: string; badge?: number }
export interface SubState { items: SubItem[]; aktif: string; pilih: (k: string) => void }

let state: SubState | null = null;
let pemilik: object | null = null;
const subs = new Set<() => void>();
const set = (s: SubState | null, oleh: object | null) => { state = s; pemilik = oleh; subs.forEach((f) => f()); };

export function useSubNavState() {
    return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state);
}

export function useSubNav(items: SubItem[], aktif: string, pilih: (k: string) => void) {
    const ref = useRef(pilih);
    ref.current = pilih;
    const kunci = JSON.stringify(items);
    const saya = useRef({}).current;
    const terlihat = useAktif();
    // Hanya halaman yang sedang terlihat yang memasang menu bawah; halaman tersembunyi hanya melepas miliknya sendiri.
    useEffect(() => { if (terlihat) set({ items, aktif, pilih: (k) => ref.current(k) }, saya); else if (pemilik === saya) set(null, null); }, [aktif, kunci, terlihat]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => () => { if (pemilik === saya) set(null, null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
