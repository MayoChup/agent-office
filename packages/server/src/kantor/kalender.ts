/**
 * Jadwal (Google Calendar) — tanpa AI.
 * - Membaca agenda untuk halaman Jadwal di kantor.
 * - Menambah acara (dipakai pencatat janji dari WhatsApp).
 * - Ringkasan agenda tiap pagi ke chat aplikasi (Pusat kabar).
 * Memakai izin Google milik Hermes (~/.hermes/google_token.json).
 */
import fs from 'fs';
import path from 'path';
import { Google } from './pencatat';

export interface Acara { id: string; judul: string; mulai: string; selesai: string; seharian: boolean; tempat: string; catatan: string; link: string; dariWa: boolean }

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const wibDate = (ms = Date.now()) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

export class Kalender {
    private g: Google;
    private cache: { at: number; days: number; data: Acara[] } | null = null;
    private stateFile: string;
    constructor(hermesHome: string, dataDir: string, private notify: (t: string) => Promise<void>, private morningHour = 7) {
        this.g = new Google(path.join(hermesHome, 'google_token.json'));
        this.stateFile = path.join(dataDir, 'kalender-state.json');
    }

    async agenda(days = 14, force = false): Promise<Acara[]> {
        if (!force && this.cache && this.cache.days === days && Date.now() - this.cache.at < 60_000) return this.cache.data;
        const start = new Date(`${wibDate()}T00:00:00+07:00`);
        const end = new Date(start.getTime() + days * 86400_000);
        const url = `${CAL}?singleEvents=true&orderBy=startTime&maxResults=250&timeZone=Asia/Jakarta&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`;
        const data = await this.g.call(url);
        const list: Acara[] = (data.items || []).filter((e: any) => e.status !== 'cancelled').map((e: any) => ({
            id: e.id,
            judul: e.summary || '(tanpa judul)',
            mulai: e.start?.dateTime || e.start?.date || '',
            selesai: e.end?.dateTime || e.end?.date || '',
            seharian: !e.start?.dateTime,
            tempat: e.location || '',
            catatan: String(e.description || '').slice(0, 300),
            link: e.htmlLink || '',
            dariWa: /\[dari WhatsApp\]/.test(e.description || '')
        }));
        this.cache = { at: Date.now(), days, data: list };
        return list;
    }

    /** Tambah acara. waktu: "YYYY-MM-DDTHH:MM" (WIB). */
    async tambah(a: { judul: string; mulai: string; menit?: number; tempat?: string; catatan?: string }): Promise<Acara> {
        const startMs = Date.parse(`${a.mulai}:00+07:00`);
        if (!Number.isFinite(startMs)) throw new Error(`Waktu tidak valid: ${a.mulai}`);
        const endMs = startMs + (a.menit || 60) * 60_000;
        const iso = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 19) + '+07:00';
        const e = await this.g.call(CAL, {
            method: 'POST',
            body: JSON.stringify({
                summary: a.judul.slice(0, 200),
                location: a.tempat || undefined,
                description: a.catatan || undefined,
                start: { dateTime: iso(startMs), timeZone: 'Asia/Jakarta' },
                end: { dateTime: iso(endMs), timeZone: 'Asia/Jakarta' },
                reminders: { useDefault: true }
            })
        });
        this.cache = null;
        return { id: e.id, judul: e.summary, mulai: e.start?.dateTime, selesai: e.end?.dateTime, seharian: false, tempat: e.location || '', catatan: '', link: e.htmlLink || '', dariWa: true };
    }

    /** Cari acara yang mirip (judul & jam sama) supaya tidak dobel. */
    async adaYangSama(mulai: string, judul: string): Promise<boolean> {
        const list = await this.agenda(60, true).catch(() => [] as Acara[]);
        const t = Date.parse(`${mulai}:00+07:00`);
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        return list.some((e) => Math.abs(Date.parse(e.mulai) - t) < 30 * 60_000 && (norm(e.judul).includes(norm(judul).slice(0, 12)) || norm(judul).includes(norm(e.judul).slice(0, 12))));
    }

    start() {
        if (this.morningHour < 0) return;
        setInterval(() => this.pagi().catch((e) => console.error('[Kalender]', e?.message || e)), 10 * 60_000);
    }

    private async pagi() {
        const now = new Date(Date.now() + 7 * 3600_000);
        const today = now.toISOString().slice(0, 10);
        let st: { last?: string } = {};
        try { st = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch { /* */ }
        if (now.getUTCHours() < this.morningHour || st.last === today) return;
        fs.writeFileSync(this.stateFile, JSON.stringify({ last: today }));
        const list = (await this.agenda(2, true)).filter((e) => e.mulai.startsWith(today) || (e.seharian && e.mulai <= today));
        const jam = (iso: string) => iso.length > 10 ? iso.slice(11, 16) : 'Seharian';
        await this.notify(list.length
            ? `📅 Agenda hari ini (Sekar si Sekretaris):\n${list.map((e) => `• ${jam(e.mulai)} ${e.judul}${e.tempat ? ` @ ${e.tempat}` : ''}`).join('\n')}`
            : '📅 Hari ini tidak ada agenda di kalender. Selamat beraktivitas!');
    }
}
