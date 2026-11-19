/**
 * U40 · Umpan balik sentuh: getar sangat pendek di HP untuk tombol utama, navigasi bawah, suka/simpan, dan kirim.
 * Hanya di perangkat layar sentuh; dihormati kalau pengguna memilih "kurangi gerakan".
 */
const SASARAN = '.btn.primary, .dock-utama button, .ig-aksi button, .wa-send, .subtab button, .sm-tabs button, .tr-sub button, [data-getar]';
export function mulaiGetar() {
    if (typeof window === 'undefined' || !('vibrate' in navigator)) return;
    const sentuh = window.matchMedia('(pointer: coarse)'), tenang = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('pointerdown', (e) => {
        if (!sentuh.matches || tenang.matches || e.pointerType !== 'touch') return;
        const el = (e.target as HTMLElement | null)?.closest?.(SASARAN) as HTMLButtonElement | null;
        if (!el || el.disabled) return;
        try { navigator.vibrate(8); } catch { /* */ }
    }, { passive: true, capture: true });
}
