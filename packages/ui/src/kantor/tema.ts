import { useEffect, useState } from 'react';

/** Tema terang/gelap: disimpan di perangkat ini. Bawaan: gelap. */
export type Tema = 'dark' | 'light';
const KEY = 'kantor:tema';
export function temaSekarang(): Tema {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
export function setTema(t: Tema) {
    document.documentElement.setAttribute('data-theme', t);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f5f7fa' : '#0b0d14');
    try { localStorage.setItem(KEY, t); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('tema', { detail: t }));
}
export function useTema(): [Tema, () => void] {
    const [t, setT] = useState<Tema>(temaSekarang);
    useEffect(() => {
        const on = (e: Event) => setT((e as CustomEvent).detail);
        window.addEventListener('tema', on);
        return () => window.removeEventListener('tema', on);
    }, []);
    return [t, () => setTema(t === 'dark' ? 'light' : 'dark')];
}
