import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Menu bawah (HP) yang berganti sesuai halaman yang sedang dibuka.
 * Halaman memanggil useSubNav(daftar, aktif, pilih); Nav menampilkannya.
 */
export interface SubItem { k: string; ico: string; label: string; badge?: number }
export interface SubState { items: SubItem[]; aktif: string; pilih: (k: string) => void }

let state: SubState | null = null;
const subs = new Set<() => void>();
const set = (s: SubState | null) => { state = s; subs.forEach((f) => f()); };

export function useSubNavState() {
    return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state);
}

export function useSubNav(items: SubItem[], aktif: string, pilih: (k: string) => void) {
    const ref = useRef(pilih);
    ref.current = pilih;
    const kunci = JSON.stringify(items);
    useEffect(() => { set({ items, aktif, pilih: (k) => ref.current(k) }); }, [aktif, kunci]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => () => set(null), []);
}
