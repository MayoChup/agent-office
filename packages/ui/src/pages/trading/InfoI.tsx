import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Bacaan } from './kamus';

/**
 * Tanda ⓘ kecil: ketuk (HP) atau arahkan kursor (laptop) untuk penjelasan.
 * Pop-up dipasang `position: fixed` dan dijaga tetap di dalam layar, jadi aman di dalam kartu yang memotong isinya.
 */
export function Info({ teks, judul, kini, label = 'Penjelasan' }: { teks: string; judul?: string; kini?: string; label?: string }) {
    const [buka, setBuka] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number; atas: boolean } | null>(null);
    const tombol = useRef<HTMLButtonElement>(null), pop = useRef<HTMLSpanElement>(null), arah = useRef(false);
    useLayoutEffect(() => {
        if (!buka || !tombol.current) return;
        const r = tombol.current.getBoundingClientRect(), lebar = Math.min(320, window.innerWidth - 24);
        const h = pop.current?.offsetHeight || 160;
        const atas = r.bottom + 8 + h > window.innerHeight - 8 && r.top - 8 - h > 8;
        setPos({ left: Math.max(12, Math.min(r.left + r.width / 2 - lebar / 2, window.innerWidth - lebar - 12)), top: atas ? r.top - 8 - h : r.bottom + 8, atas });
    }, [buka]);
    useEffect(() => {
        if (!buka) return;
        const tutup = (e: Event) => { if (!pop.current?.contains(e.target as Node) && !tombol.current?.contains(e.target as Node)) setBuka(false); };
        const gulir = () => setBuka(false);
        document.addEventListener('pointerdown', tutup, true); window.addEventListener('scroll', gulir, true); window.addEventListener('resize', gulir);
        const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBuka(false); document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('pointerdown', tutup, true); window.removeEventListener('scroll', gulir, true); window.removeEventListener('resize', gulir); document.removeEventListener('keydown', esc); };
    }, [buka]);
    const hover = (b: boolean) => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) { arah.current = b; setBuka(b); } };
    return (
        <span className="info-i" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} onClick={(e) => e.stopPropagation()}>
            <button ref={tombol} type="button" aria-label={judul ? `Penjelasan ${judul}` : label} aria-expanded={buka} onClick={(e) => { e.stopPropagation(); setBuka(arah.current ? true : !buka); arah.current = false; }}>i</button>
            {buka && (
                <span ref={pop} className={`info-i-pop ${pos?.atas ? 'atas' : ''}`} role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
                    {judul && <b className="info-i-judul">{judul}</b>}
                    <span className="info-i-teks">{teks}</span>
                    {kini && <span className="info-i-kini">{kini}</span>}
                </span>
            )}
        </span>
    );
}

/** ⓘ dari kamus indikator: apa indikatornya, cara membaca, dan arti angka saham ini sekarang. */
export function InfoKamus({ x }: { x: Bacaan }) {
    return <Info judul={x.judul} teks={`${x.apa}\n\n${x.baca}`} kini={x.kini} />;
}
