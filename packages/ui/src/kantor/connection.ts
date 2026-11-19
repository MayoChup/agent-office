import * as Colyseus from 'colyseus.js';
import { eventBus } from '../events';

/**
 * Koneksi ke server Kantor Virtual di VPS.
 *
 * - Halaman yang dibuka langsung dari VPS (SSH tunnel) → server = halaman itu sendiri.
 * - Halaman dari Vercel → alamat server diisi di layar login (misalnya Tailscale Funnel).
 * - Browser hanya menyimpan token login (30 hari), bukan kata sandi.
 */

export type ConnStatus = 'checking' | 'login' | 'connecting' | 'connected' | 'disconnected';

const LS_SERVER = 'kantor:server';
const LS_TOKEN = 'kantor:token';

/** Alamat server bawaan, diisi lewat env Vercel VITE_KANTOR_SERVER (tidak disimpan di repo). */
const DEFAULT_SERVER: string = String((import.meta as any).env?.VITE_KANTOR_SERVER || '').trim().replace(/\/+$/, '');

let room: Colyseus.Room<any> | undefined;
let status: ConnStatus = 'checking';
let lastError = '';
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let sameOriginServer = false;

const MESSAGE_TYPES = ['highlight-event', 'usage', 'office-info', 'office-layout', 'tasks-sync', 'division-event', 'relationship-update'];

function setStatus(next: ConnStatus) {
    status = next;
    eventBus.dispatchEvent(new CustomEvent('conn-status', { detail: { status, error: lastError } }));
}

function safeGet(key: string): string {
    try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
}
function safeSet(key: string, value: string) {
    try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* */ }
}

export function getRoom() { return room; }

/** Panggil API kantor yang butuh login (GET). */
export async function apiGet<T = any>(pathAndQuery: string): Promise<T> {
    const server = currentServer();
    const token = safeGet(LS_TOKEN);
    const res = await fetch(`${server}${pathAndQuery}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { safeSet(LS_TOKEN, ''); setStatus('login'); }
    if (!res.ok || data?.ok === false) throw new Error(manusiawi(data?.error || `HTTP ${res.status}`, res.status));
    return data as T;
}
/** Panggil API kantor yang butuh login (POST JSON). */
async function apiPostAsli<T = any>(pathAndQuery: string, body: unknown): Promise<T> {
    const server = currentServer();
    const token = safeGet(LS_TOKEN);
    const res = await fetch(`${server}${pathAndQuery}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { safeSet(LS_TOKEN, ''); setStatus('login'); }
    if (!res.ok || data?.ok === false) throw new Error(manusiawi(data?.error || `HTTP ${res.status}`, res.status));
    return data as T;
}

/** Klik dobel / kirim dua kali tidak mengirim permintaan yang sama dua kali selama yang pertama belum selesai. */
const sedangKirim = new Map<string, Promise<any>>();
export function apiPost<T = any>(pathAndQuery: string, body: unknown): Promise<T> {
    let kunci = '';
    try { kunci = `${pathAndQuery}|${JSON.stringify(body)}`; } catch { return apiPostAsli<T>(pathAndQuery, body); }
    const ada = sedangKirim.get(kunci); if (ada) return ada as Promise<T>;
    const p = apiPostAsli<T>(pathAndQuery, body).finally(() => sedangKirim.delete(kunci));
    sedangKirim.set(kunci, p); return p;
}
/** Alamat server kantor & token, untuk unggah berkas besar (XHR dengan progres). */
export function serverBase() { return currentServer(); }
export function tokenLogin() { return safeGet(LS_TOKEN); }

/** Ambil berkas (gambar dll.) yang butuh login → blob. */
export async function apiBlob(pathAndQuery: string): Promise<Blob> {
    const res = await fetch(`${currentServer()}${pathAndQuery}`, { headers: { Authorization: `Bearer ${safeGet(LS_TOKEN)}` } });
    if (res.status === 401) { safeSet(LS_TOKEN, ''); setStatus('login'); }
    if (!res.ok) throw new Error(manusiawi(`HTTP ${res.status}`, res.status));
    return res.blob();
}
export function getStatus() { return status; }
export function getLastError() { return lastError; }
export function isSameOrigin() { return sameOriginServer; }

/** Rapikan alamat server: tambahkan https:// kalau lupa, buang garis miring di akhir. */
export function normalizeServer(input: string): string {
    let s = input.trim().replace(/\/+$/, '');
    if (!s) return '';
    if (!/^https?:\/\//i.test(s) && !/^wss?:\/\//i.test(s)) s = `https://${s}`;
    return s.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
}

export function currentServer(): string {
    if (sameOriginServer && !safeGet(LS_SERVER)) return window.location.origin;
    return safeGet(LS_SERVER) || (sameOriginServer ? window.location.origin : DEFAULT_SERVER);
}

function wsEndpoint(server: string): string {
    return server.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
}

async function detectSameOrigin(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4000);
        const res = await fetch('/api/kantor/ping', { signal: controller.signal });
        clearTimeout(t);
        if (!res.ok) return false;
        const data = await res.json();
        return Boolean(data?.kantor);
    } catch {
        return false;
    }
}

export async function login(serverInput: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const server = normalizeServer(serverInput) || currentServer();
    if (!server) return { ok: false, error: 'Isi alamat server dulu.' };
    try {
        const res = await fetch(`${server}/api/kantor/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.token) return { ok: false, error: data?.error || `Gagal login (HTTP ${res.status}).` };
        const isDefault = (server === window.location.origin && sameOriginServer) || server === DEFAULT_SERVER;
        safeSet(LS_SERVER, isDefault ? '' : server);
        safeSet(LS_TOKEN, data.token);
        lastError = '';
        connect();
        return { ok: true };
    } catch {
        return { ok: false, error: 'Server tidak bisa dihubungi. Cek alamatnya, dan pastikan kantor di VPS menyala.' };
    }
}

export function logout() {
    try { Object.keys(localStorage).filter((k) => k.startsWith('kantor:api:') || k.startsWith('kantor:draf:')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
    safeSet(LS_TOKEN, '');
    try { room?.leave(true); } catch { /* */ }
    room = undefined;
    lastError = '';
    setStatus('login');
}

export async function connect() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined; }
    const server = currentServer();
    const token = safeGet(LS_TOKEN);
    if (!server || !token) { setStatus('login'); return; }

    setStatus('connecting');
    try {
        const client = new Colyseus.Client(wsEndpoint(server));
        const joined = await client.joinOrCreate('office', { token });
        room = joined;

        joined.onMessage('chat', (m: any) => eventBus.dispatchEvent(new CustomEvent('chat-message', { detail: m })));
        for (const type of MESSAGE_TYPES) {
            joined.onMessage(type, (m: any) => eventBus.dispatchEvent(new CustomEvent(type, { detail: m })));
        }
        joined.onStateChange.once(() => {
            eventBus.dispatchEvent(new CustomEvent('room-ready', { detail: { room: joined } }));
        });
        joined.onLeave((code: number) => {
            if (room !== joined) return;
            room = undefined;
            if (code === 1000) return; // keluar sengaja
            lastError = 'Koneksi terputus. Menyambung ulang…';
            setStatus('disconnected');
            retryTimer = setTimeout(connect, 3000);
        });
        lastError = '';
        setStatus('connected');
    } catch (err: any) {
        const code = Number(err?.code);
        const msg = String(err?.message || err || '');
        if (code === 401 || /login|auth/i.test(msg)) {
            safeSet(LS_TOKEN, '');
            lastError = 'Sesi habis. Silakan masuk lagi.';
            setStatus('login');
            return;
        }
        lastError = 'Kantor belum bisa dihubungi. Mencoba lagi…';
        setStatus('disconnected');
        retryTimer = setTimeout(connect, 5000);
    }
}

export async function startConnection() {
    sameOriginServer = await detectSameOrigin();
    await connect();
}

/** Pesan galat teknis → kalimat yang bisa dipahami + langkah perbaikan (detail teknis tetap disebut singkat di akhir). */
export function manusiawi(pesan: string, status = 0): string {
    const p = String(pesan || '');
    const atur: Array<[RegExp, string]> = [
        [/pencatat\.spreadsheetId kosong|Pencatat belum diatur/i, 'Keuangan belum disambungkan ke Google Sheets. Minta Joni di Chat: "sambungkan pencatat keuangan ke Google Sheets".'],
        [/spawn hermes ENOENT|hermes: not found/i, 'AI belum bisa dijalankan: Hermes belum terpasang atau tidak ditemukan di server.'],
        [/Izin Google belum ada|google_token\.json/i, 'Akun Google belum disambungkan. Minta Joni: "pasang skill google-workspace".'],
        [/GEMINI_API_KEY|GROQ_API_KEY/i, 'Fitur baca gambar butuh kunci Gemini atau Groq di .env Hermes di server.'],
        [/Failed to fetch|NetworkError|Load failed/i, 'Tidak tersambung ke kantor. Periksa internet, lalu coba lagi.'],
        [/timeout|timed out|AbortError/i, 'Kantor terlalu lama menjawab. Coba lagi sebentar lagi.']
    ];
    for (const [re, teks] of atur) if (re.test(p)) return p.length > 80 || teks.includes(p) ? teks : `${teks} (${p.slice(0, 80)})`;
    if (status >= 500) return `Server kantor sedang bermasalah (${p.slice(0, 80)}). Coba lagi sebentar lagi.`;
    if (status === 404) return 'Data yang dicari tidak ditemukan. Mungkin sudah dihapus — muat ulang halaman.';
    return p;
}
