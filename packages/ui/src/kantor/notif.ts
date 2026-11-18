import { apiGet, apiPost } from './connection';

/* Notifikasi HP ala WhatsApp: berlangganan Web Push lewat service worker aplikasi. */
const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
export const notifDidukung = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const terpasangSbgApp = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
export const iosBrowser = () => (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !terpasangSbgApp();

export async function statusNotif(): Promise<'aktif' | 'mati' | 'ditolak' | 'tidak-didukung'> {
    if (!notifDidukung()) return 'tidak-didukung';
    if (Notification.permission === 'denied') return 'ditolak';
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); return sub && Notification.permission === 'granted' ? 'aktif' : 'mati'; } catch { return 'mati'; }
}
export async function aktifkanNotif() {
    if (!notifDidukung()) throw new Error(iosBrowser() ? 'Di iPhone, pasang dulu lewat Safari → Bagikan → "Tambah ke Layar Utama", lalu buka dari ikon itu.' : 'Browser ini belum mendukung notifikasi.');
    const izin = await Notification.requestPermission();
    if (izin !== 'granted') throw new Error('Izin notifikasi ditolak. Buka pengaturan situs/aplikasi untuk mengizinkan.');
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const { kunci } = await apiGet<{ kunci: string | null }>('/api/kantor/push/kunci');
    if (!kunci) throw new Error('Server kantor belum siap mengirim notifikasi.');
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(kunci) }));
    await apiPost('/api/kantor/push/langgan', { langganan: sub.toJSON() });
    await apiPost('/api/kantor/push/uji', {});
}
export async function matikanNotif() {
    const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
    if (sub) { await apiPost('/api/kantor/push/berhenti', { endpoint: sub.endpoint }).catch(() => undefined); await sub.unsubscribe().catch(() => undefined); }
}
/** Beri tahu server chat mana yang sedang dibuka (supaya tidak dobel notifikasi) & hapus angka di ikon. */
export function laporLihat(thread: string | null) {
    apiPost<{ belum: number }>('/api/kantor/push/lihat', { thread }).then((r) => {
        const n: any = navigator;
        try { if (!r.belum && n.clearAppBadge) n.clearAppBadge(); else if (r.belum && n.setAppBadge) n.setAppBadge(r.belum); } catch { /* */ }
    }).catch(() => undefined);
}
