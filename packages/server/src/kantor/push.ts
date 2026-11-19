/**
 * Notifikasi HP ala WhatsApp lewat Web Push (aplikasi web yang dipasang di layar utama).
 *  - Judul: "Nina - Analis Berita" (chat pribadi) atau "👥 Grup Kantor" dengan isi "Joni: …" (grup).
 *  - Ditumpuk per chat (tag = id chat): "3 pesan baru · …". Ketuk → langsung membuka chat itu.
 *  - Tidak dikirim kalau Pak Rico sedang membuka chat yang sama.
 * Kunci VAPID dibuat sekali di VPS (data/push-vapid.json). Isi pesan hanya dikirim ke layanan push milik browser Bapak.
 */
import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { catatNotif } from './riwayatNotif';

export interface Langganan { endpoint: string; keys: { p256dh: string; auth: string }; ua?: string; at?: number }

export class Notifikasi {
    private fKunci: string; private fSub: string;
    private kunci: { publicKey: string; privateKey: string };
    private subs: Langganan[] = [];
    private aktif: { thread: string | null; at: number } = { thread: null, at: 0 };
    private belum: Record<string, number> = {};
    constructor(dataDir: string, subjek = 'mailto:kantor-virtual@localhost') {
        this.fKunci = path.join(dataDir, 'push-vapid.json'); this.fSub = path.join(dataDir, 'push-langganan.json');
        try { this.kunci = JSON.parse(fs.readFileSync(this.fKunci, 'utf8')); } catch { this.kunci = webpush.generateVAPIDKeys(); fs.writeFileSync(this.fKunci, JSON.stringify(this.kunci), { mode: 0o600 }); }
        try { this.subs = JSON.parse(fs.readFileSync(this.fSub, 'utf8')); } catch { this.subs = []; }
        webpush.setVapidDetails(subjek, this.kunci.publicKey, this.kunci.privateKey);
    }
    kunciPublik() { return this.kunci.publicKey; }
    jumlah() { return this.subs.length; }
    private simpan() { try { fs.writeFileSync(this.fSub, JSON.stringify(this.subs), { mode: 0o600 }); } catch { /* */ } }
    langgan(s: Langganan, ua = '') {
        if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw new Error('Langganan notifikasi tidak valid.');
        this.subs = [...this.subs.filter((x) => x.endpoint !== s.endpoint), { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, ua: ua.slice(0, 160), at: Date.now() }].slice(-10);
        this.simpan();
    }
    berhenti(endpoint: string) { this.subs = this.subs.filter((x) => x.endpoint !== endpoint); this.simpan(); }
    /** Laporan dari aplikasi: chat yang sedang dibuka (null = tidak ada). Membuka chat = pesannya dianggap terbaca. */
    lihat(thread: string | null) { this.aktif = { thread, at: Date.now() }; if (thread) delete this.belum[thread]; }
    totalBelum() { return Object.values(this.belum).reduce((s, n) => s + n, 0); }
    async kirim(thread: string, judul: string, isi: string) {
        if (this.aktif.thread === thread && Date.now() - this.aktif.at < 25_000) return;
        if (thread !== '__uji') catatNotif({ saluran: 'hp', judul, isi, url: `/?chat=${encodeURIComponent(thread)}` });
        this.belum[thread] = (this.belum[thread] || 0) + 1;
        const n = this.belum[thread];
        const payload = JSON.stringify({ title: judul, body: n > 1 ? `${n} pesan baru · ${isi}` : isi, tag: `chat-${thread}`, url: `/?chat=${encodeURIComponent(thread)}`, badge: this.totalBelum() });
        await Promise.all(this.subs.map(async (s) => {
            try { await webpush.sendNotification(s, payload, { TTL: 3600, urgency: 'high' }); }
            catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) this.berhenti(s.endpoint); else console.warn('[Push]', e?.statusCode || '', e?.body || e?.message || e); }
        }));
    }
    async uji() { this.belum.__uji = 0; await this.kirim('__uji', 'Kantor Virtual', 'Notifikasi sudah aktif. Pesan dari tim AI akan muncul seperti ini.'); delete this.belum.__uji; }
}
