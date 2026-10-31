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
    return safeGet(LS_SERVER) || (sameOriginServer ? window.location.origin : '');
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
        safeSet(LS_SERVER, server === window.location.origin && sameOriginServer ? '' : server);
        safeSet(LS_TOKEN, data.token);
        lastError = '';
        connect();
        return { ok: true };
    } catch {
        return { ok: false, error: 'Server tidak bisa dihubungi. Cek alamatnya, dan pastikan kantor di VPS menyala.' };
    }
}

export function logout() {
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
