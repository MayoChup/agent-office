/**
 * Pencatat transaksi otomatis — TANPA AI.
 *
 * Membaca email notifikasi bank (Mandiri/Livin', BCA, Krom, Jago) dari Gmail pemilik,
 * mengambil tanggal, jam, nominal, dan pihak lewat aturan tetap, lalu menambah baris
 * ke tab "Transaksi" di Google Sheets. Memakai izin Google yang sudah dipasang Hermes
 * (~/.hermes/google_token.json), jadi tidak perlu login lagi.
 *
 * Keamanan: hanya membaca email dari alamat pengirim resmi di daftar BANKS,
 * tidak pernah mengikuti isi/link email, satu-satunya perubahan di Gmail adalah
 * menambah label "Tercatat".
 */
import { catatNotif } from './riwayatNotif';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface PencatatConfig {
    enabled: boolean;
    spreadsheetId: string;
    sheetName: string;
    sinceDate: string;            // YYYY-MM-DD
    intervalMinutes: number;
    dailySummaryHour: number;     // jam WIB, -1 = mati
    ownerNames: string[];         // untuk mengenali transfer ke rekening sendiri
    kategori: Record<string, string[]>;
}

export interface ParsedTx {
    tanggal: string;   // YYYY-MM-DD
    jam: string;       // HH:MM
    bank: string;
    jenis: 'Keluar' | 'Masuk' | 'Antar Rekening';
    nominal: number | null;
    pihak: string;
    kategori: string;
    keterangan: string;
    idEmail: string;
    status: 'OK' | 'Perlu dicek';
}

export const BANKS: Array<{ name: string; from: string[] }> = [
    { name: 'BCA', from: ['bca@bca.co.id'] },
    { name: 'Mandiri', from: ['noreply.livin@bankmandiri.co.id'] },
    { name: 'Krom', from: ['noreply@krom.id'] },
    { name: 'Jago', from: ['noreply@jago.com'] }
];

export const DEFAULT_KATEGORI: Record<string, string[]> = {
    'Makan & Minum': ['MCD', 'MCDONALD', 'KFC', 'BURGER', 'PIZZA', 'CAFE', 'COFFEE', 'KOPI', 'ROTI', 'BAKERY', 'DIMSUM', 'BAKSO', 'MIE ', 'WARUNG',
        'RESTO', 'RUMAH MAKAN', 'STARBUCKS', 'JANJI JIWA', 'MIXUE', 'SOLARIA', 'GOFOOD', 'GRABFOOD', 'SHOPEEFOOD', 'CHATIME', 'BANCHAU',
        'SATE', 'AYAM', 'SEAFOOD', 'PADANG', 'BOBA', 'TEA', 'FOOD', 'KULINER', 'KANTIN', 'DAPUR'],
    'Transport': ['GOJEK', 'GOJEK', 'GRAB', 'MAXIM', 'PERTAMINA', 'SHELL', 'SPBU', 'KAI ', 'KERETA', 'TRIP.COM', 'TRAVELOKA', 'TIKET.COM',
        'CITILINK', 'LION', 'GARUDA', 'AIRASIA', 'PARKIR', 'TOL ', 'BLUEBIRD', 'DAMRI', 'TRANSJAKARTA', 'MRT', 'KRL'],
    'Belanja': ['INDOMARET', 'ALFAMART', 'ALFAMIDI', 'TOKOPEDIA', 'LAZADA', 'BLIBLI', 'SUPERINDO', 'HYPERMART', 'TRANSMART', 'LOTTE', 'MATAHARI',
        'UNIQLO', 'IKEA', 'ACE HARDWARE', 'GRAMEDIA', 'MINIMARKET', 'MART', 'TOKO', 'SHOPEE '],
    'Tagihan & Langganan': ['PLN', 'PDAM', 'BPJS', 'NETFLIX', 'SPOTIFY', 'YOUTUBE', 'GOOGLE', 'APPLE', 'ICLOUD', 'DISNEY', 'VIDIO', 'INDIHOME',
        'BIZNET', 'FIRST MEDIA', 'MYREPUBLIC', 'OPENROUTER', 'ANTHROPIC', 'OPENAI', 'TENCENT', 'CLOUD', 'ASURANSI', 'CICILAN', 'KREDIVO', 'AKULAKU'],
    'Pulsa & Internet': ['TELKOMSEL', 'XL ', 'XLAXIATA', 'INDOSAT', 'IM3', 'SMARTFREN', 'AXIS', 'BY.U', 'PULSA', 'PAKET DATA'],
    'Kesehatan': ['APOTEK', 'APOTIK', 'KIMIA FARMA', 'K24', 'GUARDIAN', 'WATSONS', 'KLINIK', 'RUMAH SAKIT', 'RS ', 'HOSPITAL', 'HALODOC', 'ALODOKTER', 'LAB'],
    'Hiburan': ['CGV', 'XXI', 'CINEPOLIS', 'CINEMA', 'BIOSKOP', 'STEAM', 'PLAYSTATION', 'GAME', 'KARAOKE', 'TIMEZONE'],
    'Investasi': ['BIBIT', 'AJAIB', 'PLUANG', 'STOCKBIT', 'BAREKSA', 'IPOT', 'INDOPREMIER', 'TANAMDUIT', 'PINTU', 'INDODAX', 'TOKOCRYPTO', 'EMAS']
};

export const pencatatEvents = new EventEmitter();

// ───────────────────────── Pembacaan email (bisa diuji tanpa internet) ─────────────────────────

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, peb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12
};

export function htmlToLines(html: string): string[] {
    let s = html
        .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|li|h[1-6]|table|tbody|section)>/gi, '\n')
        .replace(/<\/t[dh]>/gi, '\t')
        .replace(/<[^>]+>/g, ' ');
    s = s
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/[​-‍﻿]/g, '');
    return s
        .split('\n')
        .map((l) => l.replace(/[ \t]*\t[ \t]*/g, '\t').replace(/ {2,}/g, ' ').trim())
        .map((l) => l.replace(/^\t+|\t+$/g, '').trim())
        .filter(Boolean);
}

/** "IDR 1,129,850.00" → 1129850 · "Rp 10,00" → 10 · "Rp15.000" → 15000 */
export function parseRupiah(raw: string): number | null {
    const m = raw.replace(/\s/g, '').match(/(?:IDR|Rp\.?)?(-?\d[\d.,]*)/i);
    if (!m) return null;
    let num = m[1];
    const last = Math.max(num.lastIndexOf('.'), num.lastIndexOf(','));
    let value: number;
    if (last !== -1 && num.length - last - 1 === 2) {
        const intPart = num.slice(0, last).replace(/[.,]/g, '');
        value = Number(`${intPart}.${num.slice(last + 1)}`);
    } else {
        value = Number(num.replace(/[.,]/g, ''));
    }
    return Number.isFinite(value) ? Math.round(value) : null;
}

/** Mengenali banyak format tanggal bank Indonesia. Mengembalikan { tanggal, jam } atau null. */
export function parseTanggal(raw: string): { tanggal: string; jam: string } | null {
    const t = raw.replace(/\(?WIB\)?/gi, '').trim();
    let y = 0, mo = 0, d = 0;
    let m = t.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
    if (!y) {
        m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    }
    if (!y) {
        m = t.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})/);
        if (m) {
            const key = m[2].toLowerCase().slice(0, 3);
            mo = MONTHS[key] || 0; d = +m[1]; y = +m[3];
        }
    }
    if (!y || !mo || !d || mo > 12 || d > 31) return null;
    const rest = t.slice((m?.index || 0) + (m?.[0].length || 0));
    const tm = rest.match(/(\d{1,2})[:.](\d{2})/);
    const jam = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : '';
    return { tanggal: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, jam };
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Cari nilai untuk salah satu label. Mendukung "Label: nilai", "Label<TAB>: nilai",
 * dan label di baris sendiri dengan nilai di baris berikutnya.
 */
export function field(lines: string[], labels: string[], opts: { notFollowedBy?: RegExp; whole?: boolean } = {}): string {
    for (const label of labels) {
        const re = new RegExp(`^(?:[•·*-]\\s*)?${escapeRe(label)}(?=[\\s:：\\t]|$)\\s*(?:[:：\\t]\\s*)*(.*)$`, 'i');
        for (let i = 0; i < lines.length; i++) {
            const mm = lines[i].match(re);
            if (!mm) continue;
            let rest = mm[1].replace(/^[:\t\s]+/, '').trim();
            if (opts.notFollowedBy && opts.notFollowedBy.test(rest)) continue;
            if (!rest && i + 1 < lines.length) rest = lines[i + 1].replace(/^[:\t\s]+/, '').trim();
            if (rest) return opts.whole ? rest.replace(/\t/g, ' ').trim() : rest.split('\t')[0].trim();
        }
    }
    return '';
}

/** Kategori khusus baris "Antar Rekening" (pindah dana antar rekening sendiri) — menentukan arah saldo. */
export const KAT_TRANSFER_MASUK = 'Transfer masuk';
export const KAT_TRANSFER_KELUAR = 'Transfer keluar';
/** Apakah nama pihak = nama Pak Rico sendiri (dari pengaturan). Cocok kalau semua kata nama terdaftar ada di pihak. */
export function namaSendiri(pihak: string, nama: string[]): boolean {
    const kata = (t: string) => String(t || '').toUpperCase().replace(/[^A-Z ]+/g, ' ').trim().split(/\s+/).filter((x) => x.length >= 2);
    const p = kata(pihak); if (!p.length) return false;
    // Bank sering memotong nama ("RICO SAPUT") atau hanya menulis 2 kata pertama → cocok kalau kata pertama sama
    // dan minimal 2 kata (atau semua, kalau namanya cuma 1–2 kata) cocok, termasuk potongan ≥ 3 huruf.
    const pas = (w: string) => p.some((x) => x === w || (x.length >= 3 && w.startsWith(x)) || (w.length >= 3 && x.startsWith(w)));
    return nama.some((n) => { const k = kata(n); if (!k.length || !pas(k[0])) return false; return k.filter(pas).length >= Math.min(2, k.length); });
}
const HINT_MASUK_KET = /\b(masuk|diterima|terima|received|incoming|dari|from|cr|kredit)\b/i;

export function kategoriOf(pihak: string, rules: Record<string, string[]>): string {
    const up = ` ${pihak.toUpperCase()} `;
    for (const [kat, words] of Object.entries(rules)) {
        if (words.some((w) => up.includes(w.toUpperCase()))) return kat;
    }
    return 'Lainnya';
}

const TX_HINT = /berhasil|successful|success|transaksi|pembayaran|membayar|transfer|menerima|diterima|received|payment/i;
const FAIL_HINT = /\b(gagal|failed|unsuccessful|dibatalkan|canceled|cancelled)\b/i;
const MASUK_HINT = /(kamu menerima|anda menerima|dana masuk|uang masuk|telah diterima|incoming|you (have )?received|transfer masuk)/i;

function bankOf(from: string): string | null {
    const addr = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
    const b = BANKS.find((x) => x.from.includes(addr));
    return b ? b.name : null;
}

function clean(s: string, max = 60) {
    return s.replace(/\s+/g, ' ').replace(/[\t]/g, ' ').trim().slice(0, max);
}

/**
 * Ubah satu email bank menjadi baris transaksi.
 * Mengembalikan null kalau email bukan notifikasi transaksi (mis. promo) atau transaksinya gagal.
 */
export function parseEmail(input: { id: string; from: string; subject: string; html: string; text?: string; internalDate?: number },
    cfg: Pick<PencatatConfig, 'ownerNames' | 'kategori'>): ParsedTx | null {
    const bank = bankOf(input.from);
    if (!bank) return null;
    const lines = htmlToLines(input.html || (input.text || '').replace(/\n/g, '<br>'));
    const all = `${input.subject}\n${lines.join('\n')}`;
    if (!TX_HINT.test(all)) return null;
    const status = field(lines, ['Status Transaksi', 'Status']);
    if (FAIL_HINT.test(status) || FAIL_HINT.test(input.subject)) return null;

    let amountRaw = '', pihak = '', tglRaw = '', jamRaw = '', ket = '';
    if (bank === 'BCA') {
        amountRaw = field(lines, ['Total Payment', 'Total Amount', 'Transfer Amount', 'Amount', 'Bill Total', 'Total Pembayaran', 'Nominal', 'Jumlah'], { whole: true });
        pihak = field(lines, ['Company/Product Name', 'Merchant Name', 'Merchant', 'Product', 'Beneficiary Name', 'Receiver Name', 'Recipient Name', 'Payee Name', 'Nama Penerima', 'Name']);
        if (pihak.includes('/')) pihak = pihak.split('/').pop()!.trim() || pihak;
        tglRaw = field(lines, ['Transaction Date', 'Date/Time', 'Tanggal Transaksi', 'Date']);
        ket = field(lines, ['Transfer Type', 'Transaction Type', 'Jenis Transaksi']);
    } else if (bank === 'Mandiri') {
        amountRaw = field(lines, ['Nominal Transaksi', 'Total Transaksi', 'Jumlah Transfer', 'Nominal', 'Jumlah', 'Total'], { whole: true });
        pihak = field(lines, ['Penerima', 'Nama Penerima', 'Merchant', 'Tujuan']);
        tglRaw = field(lines, ['Tanggal', 'Tanggal Transaksi']);
        jamRaw = field(lines, ['Jam', 'Waktu']);
        ket = /QR/i.test(all) ? 'QRIS' : '';
    } else if (bank === 'Krom') {
        amountRaw = field(lines, ['Jumlah', 'Nominal'], { whole: true });
        pihak = field(lines, ['Merchant', 'Ke', 'Penerima', 'Tujuan']);
        tglRaw = field(lines, ['Tanggal & Waktu', 'Tanggal dan Waktu', 'Tanggal']);
        if (!pihak && /e-?wallet/i.test(all)) { pihak = 'Top Up E-Wallet'; ket = 'Transaksi e-wallet'; }
        if (/qris/i.test(input.subject)) ket = 'QRIS';
    } else if (bank === 'Jago') {
        amountRaw = field(lines, ['Jumlah'], { notFollowedBy: /^tip\b/i, whole: true });
        pihak = field(lines, ['Ke', 'Penerima', 'Merchant']);
        if (!pihak) pihak = (input.subject.match(/membayar ke (.+?)(?:\s*[\u{1F300}-\u{1FAFF}☀-➿].*)?$/iu)?.[1] || '').trim();
        tglRaw = field(lines, ['Tanggal Transaksi', 'Tanggal']);
        const acq = field(lines, ['Nama Acquirer']);
        if (acq) ket = `via ${acq}`;
    }
    // Email biaya (admin, bulanan, dll.): pihaknya bank itu sendiri.
    const biaya = input.subject.match(/dikenakan biaya\s*(.*)$/i);
    if (biaya && !pihak) {
        pihak = `Biaya ${bank}${biaya[1] ? ` – ${biaya[1].replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').trim()}` : ''}`;
        ket = ket || 'Biaya bank';
    }
    pihak = clean(pihak.replace(/\s+\d{10,}$/, ''));

    // Cadangan: kalau label nominal tidak ketemu tapi di email hanya ada SATU angka rupiah, pakai itu.
    if (!amountRaw) {
        const found = Array.from(new Set((lines.join('\n').match(/(?:Rp\.?|IDR)\s?\d[\d.,]*/gi) || []).map((x) => parseRupiah(x)).filter((n) => n && n > 0)));
        if (found.length === 1) amountRaw = String(found[0]);
    }
    const nominal = amountRaw ? parseRupiah(amountRaw) : null;
    let when = parseTanggal(tglRaw);
    if (when && !when.jam && jamRaw) when.jam = parseTanggal(`1 jan 2000 ${jamRaw}`)?.jam || '';
    if (!when && input.internalDate) {
        const d = new Date(input.internalDate + 7 * 3600_000);   // WIB
        when = { tanggal: d.toISOString().slice(0, 10), jam: d.toISOString().slice(11, 16) };
    }
    if (!when) return null;

    const masuk = MASUK_HINT.test(all);
    let jenis: ParsedTx['jenis'] = masuk ? 'Masuk' : 'Keluar';
    if (namaSendiri(pihak, cfg.ownerNames)) jenis = 'Antar Rekening';

    // Pindah dana ke rekening sendiri: bukan pengeluaran/pemasukan. Arahnya dicatat di kolom kategori.
    const kategori = jenis === 'Masuk' ? 'Gaji/Pemasukan' : jenis === 'Antar Rekening' ? (masuk ? KAT_TRANSFER_MASUK : KAT_TRANSFER_KELUAR)
        : /^Biaya /.test(pihak) ? 'Tagihan & Langganan' : kategoriOf(pihak, cfg.kategori);
    const ok = nominal !== null && nominal > 0 && !!pihak;
    return {
        tanggal: when.tanggal,
        jam: when.jam,
        bank,
        jenis,
        nominal,
        pihak: pihak || clean(input.subject),
        kategori,
        keterangan: clean(ket, 80),
        idEmail: input.id,
        status: ok ? 'OK' : 'Perlu dicek'
    };
}

// ───────────────────────── Google API ─────────────────────────

export class Google {
    private access = '';
    private accessExp = 0;
    constructor(private tokenPath: string) {}

    async token(): Promise<string> {
        if (this.access && Date.now() < this.accessExp - 60_000) return this.access;
        if (!fs.existsSync(this.tokenPath)) throw new Error(`Izin Google belum ada (${this.tokenPath}). Pasang skill google-workspace di Hermes dulu.`);
        const t = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        const exp = t.expiry ? Date.parse(t.expiry.endsWith('Z') ? t.expiry : `${t.expiry}Z`) : 0;
        if (t.token && exp && Date.now() < exp - 120_000) {
            this.access = t.token; this.accessExp = exp;
            return this.access;
        }
        if (!t.refresh_token || !t.client_id || !t.client_secret) throw new Error('Izin Google tidak lengkap. Minta Joni login ulang Google Workspace.');
        const res = await fetch(t.token_uri || 'https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id, client_secret: t.client_secret })
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data.access_token) {
            throw new Error(data?.error === 'invalid_grant' ? 'Izin Google kedaluwarsa/dicabut. Minta Joni: "Login ulang Google Workspace".' : `Gagal memperbarui izin Google (HTTP ${res.status}).`);
        }
        this.access = data.access_token;
        this.accessExp = Date.now() + (Number(data.expires_in) || 3000) * 1000;
        return this.access;
    }

    async call(url: string, init: RequestInit = {}): Promise<any> {
        const tok = await this.token();
        const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
        const text = await res.text();
        if (!res.ok) throw new Error(`Google API ${res.status}: ${text.slice(0, 200)}`);
        return text ? JSON.parse(text) : {};
    }
}

function b64url(s: string) {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function bodyOf(payload: any): { html: string; text: string } {
    let html = '', text = '';
    const walk = (p: any) => {
        if (!p) return;
        if (p.mimeType === 'text/html' && p.body?.data) html += b64url(p.body.data);
        else if (p.mimeType === 'text/plain' && p.body?.data) text += b64url(p.body.data);
        (p.parts || []).forEach(walk);
    };
    walk(payload);
    return { html, text };
}

const header = (msg: any, name: string) =>
    (msg.payload?.headers || []).find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

function serialToIso(v: any): string {
    if (typeof v === 'number') {
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400_000);
        return d.toISOString().slice(0, 10);
    }
    const s = String(v || '').trim();
    return parseTanggal(s)?.tanggal || s;
}

// ───────────────────────── Pencatat ─────────────────────────

export class Pencatat {
    private g: Google;
    private stateFile: string;
    private state: { done: string[]; lastSummary: string } = { done: [], lastSummary: '' };
    private labelId = '';
    private running = false;
    status = { enabled: false, lastRun: 0, lastAdded: 0, totalAdded: 0, lastError: '' as string | null };

    constructor(private cfg: PencatatConfig, private hermesHome: string, dataDir: string, private notify: (text: string) => Promise<void>) {
        this.g = new Google(path.join(hermesHome, 'google_token.json'));
        this.stateFile = path.join(dataDir, 'pencatat-state.json');
        try { this.state = { ...this.state, ...JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) }; } catch { /* baru */ }
        this.status.enabled = cfg.enabled && !!cfg.spreadsheetId;
    }

    private save() {
        this.state.done = this.state.done.slice(-5000);
        try { fs.writeFileSync(this.stateFile, JSON.stringify(this.state)); } catch { /* */ }
    }

    start() {
        if (!this.status.enabled) {
            console.log('[Pencatat] Mati (isi pencatat.spreadsheetId di kantor.config.json untuk menyalakan).');
            return;
        }
        console.log(`[Pencatat] Aktif: cek Gmail tiap ${this.cfg.intervalMinutes} menit → ${this.cfg.sheetName}.`);
        setTimeout(() => this.runOnce().catch(() => undefined), 60_000);
        setInterval(() => this.runOnce().catch(() => undefined), Math.max(5, this.cfg.intervalMinutes) * 60_000);
        setInterval(() => this.maybeSummary().catch((e) => console.error('[Pencatat] ringkasan:', e?.message || e)), 5 * 60_000);
    }

    private sheetRange(a1: string) {
        return encodeURIComponent(`'${this.cfg.sheetName}'!${a1}`);
    }

    async existingRows(): Promise<any[][]> {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}/values/${this.sheetRange('A2:J')}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
        const data = await this.g.call(url);
        return data.values || [];
    }

    /** Ambil & baca email baru. dryRun = hanya tampilkan, tidak menulis apa pun. */
    async collect(dryRun = false): Promise<{ rows: ParsedTx[]; skipped: number }> {
        const since = this.cfg.sinceDate.replace(/-/g, '/');
        const q = `from:(${BANKS.flatMap((b) => b.from).join(' OR ')}) after:${since}`;
        const ids: string[] = [];
        let pageToken = '';
        do {
            const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
            const data = await this.g.call(url);
            (data.messages || []).forEach((m: any) => ids.push(m.id));
            pageToken = data.nextPageToken || '';
        } while (pageToken && ids.length < 1000);

        const existing = await this.existingRows();
        const knownIds = new Set(existing.map((r) => String(r[8] || '')).filter(Boolean));
        const knownKeys = new Set(existing.map((r) => `${serialToIso(r[0])}|${Math.round(Number(r[4]) || 0)}|${String(r[2] || '').toLowerCase()}`));

        const rows: ParsedTx[] = [];
        let skipped = 0;
        for (const id of ids.reverse()) {
            if (!dryRun && this.state.done.includes(id)) continue;
            if (knownIds.has(id)) { if (!dryRun) this.state.done.push(id); continue; }
            const msg = await this.g.call(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
            const { html, text } = bodyOf(msg.payload);
            const tx = parseEmail({ id, from: header(msg, 'From'), subject: header(msg, 'Subject'), html, text, internalDate: Number(msg.internalDate) }, this.cfg);
            if (!tx) { skipped++; if (!dryRun) this.state.done.push(id); continue; }
            const key = `${tx.tanggal}|${tx.nominal || 0}|${tx.bank.toLowerCase()}`;
            if (knownKeys.has(key)) { skipped++; if (!dryRun) this.state.done.push(id); continue; }   // sudah dicatat (mis. oleh Uang)
            knownKeys.add(key);
            rows.push(tx);
        }
        return { rows, skipped };
    }

    private async ensureLabel(): Promise<string> {
        if (this.labelId) return this.labelId;
        const list = await this.g.call('https://gmail.googleapis.com/gmail/v1/users/me/labels');
        const found = (list.labels || []).find((l: any) => l.name === 'Tercatat');
        if (found) return (this.labelId = found.id);
        const made = await this.g.call('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            method: 'POST', body: JSON.stringify({ name: 'Tercatat', labelListVisibility: 'labelShow', messageListVisibility: 'show' })
        });
        return (this.labelId = made.id);
    }

    /** Diisi index.ts: kategori dari ingatan tenant (koreksi Pak Rico) & tebakan AI (Uang) untuk yang jatuh ke "Lainnya". */
    ingatan?: (pihak: string) => string | null;
    tebakKategori?: (pihak: string[]) => Promise<Record<string, string>>;
    /** Terapkan ingatan + tebakan AI ke baris baru (hanya pengeluaran). Gagal = biarkan "Lainnya". */
    async lengkapiKategori<T extends { jenis: string; pihak: string; kategori: string }>(rows: T[]): Promise<T[]> {
        for (const r of rows) { if (r.jenis !== 'Keluar' || !r.pihak) continue; const k = this.ingatan?.(r.pihak); if (k) r.kategori = k; }
        const sisa = rows.filter((r) => r.jenis === 'Keluar' && r.pihak && (!r.kategori || r.kategori === 'Lainnya'));
        if (sisa.length && this.tebakKategori) {
            try { const t = await this.tebakKategori([...new Set(sisa.map((r) => r.pihak))]); for (const r of sisa) if (t[r.pihak]) r.kategori = t[r.pihak]; }
            catch (e: any) { console.warn('[Pencatat] kategori AI:', e?.message || e); }
        }
        return rows;
    }
    /** Rapikan transaksi LAMA berkategori "Lainnya" (pengeluaran) dengan ingatan + AI. Maks 80 tenant per putaran. */
    async rapikanKategori(): Promise<{ dicek: number; diubah: number }> {
        if (!this.cfg.spreadsheetId) return { dicek: 0, diubah: 0 };
        const rows = await this.existingRows();
        const calon = rows.map((r, i) => ({ row: i + 2, jenis: String(r[3] || ''), pihak: String(r[5] || ''), kategori: String(r[6] || '') }))
            .filter((x) => x.jenis === 'Keluar' && x.pihak && (!x.kategori || x.kategori === 'Lainnya'));
        if (!calon.length) return { dicek: 0, diubah: 0 };
        const unik = [...new Set(calon.map((x) => x.pihak))].slice(0, 80);
        const pakai = calon.filter((x) => unik.includes(x.pihak));
        const awal = pakai.map((x) => x.kategori);
        await this.lengkapiKategori(pakai);
        const data = pakai.filter((x, i) => x.kategori && x.kategori !== 'Lainnya' && x.kategori !== awal[i]).map((x) => ({ range: `'${this.cfg.sheetName}'!G${x.row}`, values: [[x.kategori]] }));
        if (data.length) {
            await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });
            this.reportCache = null;
        }
        return { dicek: pakai.length, diubah: data.length };
    }

    /**
     * Rapikan pindah dana antar rekening sendiri pada transaksi yang SUDAH tercatat:
     *  1. Pihak = nama Pak Rico → jadi "Antar Rekening" (bukan pengeluaran/pemasukan) dengan arah masuk/keluar.
     *  2. Baris "Antar Rekening" lama tanpa arah → arah ditebak dari keterangan (default keluar, seperti perhitungan lama).
     *  3. Pasangan: keluar dari rekening A & masuk ke rekening B dengan nominal sama (±1 hari), salah satunya sudah pasti
     *     transfer ke diri sendiri → keduanya ditandai, dan keterangannya diberi "ke B" / "dari A".
     */
    async rapikanTransfer(nama: string[], akunSendiri: string[] = []): Promise<{ dicek: number; diubah: number }> {
        if (!this.cfg.spreadsheetId) return { dicek: 0, diubah: 0 };
        const rows = await this.existingRows();
        const tgl = (v: any) => typeof v === 'number' ? new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 10) : String(v || '').slice(0, 10);
        type B = { row: number; d: string; bank: string; jenis: string; n: number; pihak: string; kat: string; ket: string; ubah: boolean };
        const b: B[] = rows.map((r, i) => ({ row: i + 2, d: tgl(r[0]), bank: String(r[2] || ''), jenis: String(r[3] || ''), n: Number(r[4]) || 0, pihak: String(r[5] || ''), kat: String(r[6] || ''), ket: String(r[7] || ''), ubah: false }));
        const ARAH = [KAT_TRANSFER_MASUK, KAT_TRANSFER_KELUAR];
        for (const x of b) {
            if ((x.jenis === 'Keluar' || x.jenis === 'Masuk') && x.pihak && namaSendiri(x.pihak, nama)) {
                x.kat = x.jenis === 'Masuk' ? KAT_TRANSFER_MASUK : KAT_TRANSFER_KELUAR; x.jenis = 'Antar Rekening'; x.ubah = true;
            } else if (x.jenis === 'Antar Rekening' && !ARAH.includes(x.kat)) {
                x.kat = HINT_MASUK_KET.test(`${x.ket} ${x.pihak}`) && !/\b(ke|to|db|debit)\b/i.test(x.ket) ? KAT_TRANSFER_MASUK : KAT_TRANSFER_KELUAR; x.ubah = true;
            }
        }
        const hari = (a: string, c: string) => Math.abs(Date.parse(a) - Date.parse(c)) / 86400_000;
        const sama = (a: string, c: string) => a.toLowerCase().replace(/\s/g, '') === c.toLowerCase().replace(/\s/g, '');
        const dipakai = new Set<number>();
        const keluar = b.filter((x) => x.jenis === 'Antar Rekening' && x.kat === KAT_TRANSFER_KELUAR || x.jenis === 'Keluar');
        for (const k of keluar) {
            if (dipakai.has(k.row)) continue;
            const m = b.find((x) => !dipakai.has(x.row) && x.row !== k.row && !sama(x.bank, k.bank) && Math.abs(x.n - k.n) <= 1 && hari(x.d, k.d) <= 1
                && (x.jenis === 'Antar Rekening' && x.kat === KAT_TRANSFER_MASUK || x.jenis === 'Masuk'));
            if (!m) continue;
            // Minimal salah satu sisi harus sudah pasti transfer ke diri sendiri (bukan kebetulan nominal sama).
            if (k.jenis !== 'Antar Rekening' && m.jenis !== 'Antar Rekening') continue;
            dipakai.add(k.row); dipakai.add(m.row);
            if (k.jenis !== 'Antar Rekening' || k.kat !== KAT_TRANSFER_KELUAR) { k.jenis = 'Antar Rekening'; k.kat = KAT_TRANSFER_KELUAR; k.ubah = true; }
            if (m.jenis !== 'Antar Rekening' || m.kat !== KAT_TRANSFER_MASUK) { m.jenis = 'Antar Rekening'; m.kat = KAT_TRANSFER_MASUK; m.ubah = true; }
            if (!/^ke\s/i.test(k.ket)) { k.ket = `ke ${m.bank}${k.ket ? ` · ${k.ket}` : ''}`.slice(0, 200); k.ubah = true; }
            if (!/^dari\s/i.test(m.ket)) { m.ket = `dari ${k.bank}${m.ket ? ` · ${m.ket}` : ''}`.slice(0, 200); m.ubah = true; }
        }
        // Transfer sendiri yang belum punya pasangan: tujuan/asal ditebak dari nama rekening yang disebut di keterangan
        // (mis. "TRSF KE KROM", "TOP UP JAGO") — berlaku untuk semua rekening Pak Rico, bukan cuma BCA & Mandiri.
        const akunLain = akunSendiri.filter((a) => a && !/^cash$|^tunai$/i.test(a));
        for (const x of b) {
            if (x.jenis !== 'Antar Rekening' || dipakai.has(x.row) || /^(ke|dari)\s/i.test(x.ket)) continue;
            const teks = ` ${`${x.pihak} ${x.ket}`.toUpperCase()} `;
            const a = akunLain.find((n) => !sama(n, x.bank) && teks.includes(` ${n.toUpperCase()}`));
            if (!a) continue;
            x.ket = `${x.kat === KAT_TRANSFER_MASUK ? 'dari' : 'ke'} ${a}${x.ket ? ` · ${x.ket}` : ''}`.slice(0, 200); x.ubah = true;
        }
        const data = b.filter((x) => x.ubah).flatMap((x) => [
            { range: `'${this.cfg.sheetName}'!D${x.row}`, values: [[x.jenis]] },
            { range: `'${this.cfg.sheetName}'!G${x.row}:H${x.row}`, values: [[x.kat, x.ket]] }
        ]);
        if (data.length) {
            await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });
            this.reportCache = null;
        }
        return { dicek: b.length, diubah: data.length / 2 };
    }

    async runOnce(): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        try {
            const { rows } = await this.collect(false);
            if (rows.length) await this.lengkapiKategori(rows);
            if (rows.length) {
                rows.sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam));
                const values = rows.map((r) => [r.tanggal, r.jam, r.bank, r.jenis, r.nominal ?? '', r.pihak, r.kategori, r.keterangan, r.idEmail, r.status]);
                await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}/values/${this.sheetRange('A1:J1')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`, {
                    method: 'POST', body: JSON.stringify({ values })
                });
                for (const r of rows) this.state.done.push(r.idEmail);
                this.save();
                // Label "Tercatat" — kalau gagal tidak apa-apa, pencatatan sudah aman.
                try {
                    const labelId = await this.ensureLabel();
                    await this.g.call('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify', {
                        method: 'POST', body: JSON.stringify({ ids: rows.map((r) => r.idEmail), addLabelIds: [labelId] })
                    });
                } catch (e: any) { console.warn('[Pencatat] label:', e?.message || e); }

                const cek = rows.filter((r) => r.status === 'Perlu dicek');
                pencatatEvents.emit('added', rows);
                if (cek.length) {
                    await this.notify(`⚠️ Uang: ${cek.length} transaksi perlu dicek di Sheets "Keuangan Rico":\n` +
                        cek.slice(0, 5).map((r) => `• ${r.tanggal} ${r.bank} — ${r.pihak}`).join('\n'));
                }
            } else {
                this.save();
            }
            this.status = { ...this.status, lastRun: Date.now(), lastAdded: rows.length, totalAdded: this.status.totalAdded + rows.length, lastError: null };
            if (rows.length) console.log(`[Pencatat] ${rows.length} transaksi baru dicatat.`);
            return rows.length;
        } catch (e: any) {
            const msg = String(e?.message || e);
            if (msg !== this.status.lastError) {
                console.error('[Pencatat]', msg);
                await this.notify(`⚠️ Pencatat transaksi berhenti sementara: ${msg}`).catch(() => undefined);
            }
            this.status = { ...this.status, lastRun: Date.now(), lastError: msg };
            return 0;
        } finally {
            this.running = false;
        }
    }

    private reportCache: { at: number; data: any } | null = null;

    /** Catat transaksi manual (dari web, chat, atau Uang) ke Google Sheets yang sama. */
    async tambahManual(x: { tanggal?: string; jam?: string; akun: string; jenis: string; nominal: number; pihak?: string; kategori?: string; keterangan?: string }) {
        if (!this.cfg.spreadsheetId) throw new Error('Pencatat belum diatur (pencatat.spreadsheetId kosong).');
        const now = new Date(Date.now() + 7 * 3600_000).toISOString();
        const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal || '') ? x.tanggal! : now.slice(0, 10);
        const jam = /^\d{2}:\d{2}$/.test(x.jam || '') ? x.jam! : now.slice(11, 16);
        const jenis = ['Keluar', 'Masuk', 'Antar Rekening'].includes(x.jenis) ? x.jenis : 'Keluar';
        const nominal = Math.round(Number(x.nominal));
        if (!(nominal > 0) || nominal > 1e12) throw new Error('Nominal tidak valid');
        const akun = String(x.akun || 'Cash').slice(0, 30);
        const id = `manual-${Date.now().toString(36)}`;
        const row = [tanggal, jam, akun, jenis, nominal, String(x.pihak || '').slice(0, 80), String(x.kategori || 'Lainnya').slice(0, 40), String(x.keterangan || '').slice(0, 200), id, 'Manual'];
        await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}/values/${this.sheetRange('A1:J1')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`, {
            method: 'POST', body: JSON.stringify({ values: [row] })
        });
        this.reportCache = null;
        return { d: tanggal, t: jam, bank: akun, jenis, n: nominal, pihak: row[5], kat: row[6], ket: row[7], status: 'Manual' };
    }

    /* ── Ubah / hapus / tambah banyak ──────────────────────────────── */
    private sheetGid: number | null = null;
    private async gid(): Promise<number> {
        if (this.sheetGid != null) return this.sheetGid;
        const meta = await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}?fields=sheets.properties`);
        const sh = (meta.sheets || []).find((x: any) => x.properties?.title === this.cfg.sheetName);
        if (!sh) throw new Error(`Sheet "${this.cfg.sheetName}" tidak ditemukan`);
        this.sheetGid = Number(sh.properties.sheetId);
        return this.sheetGid;
    }
    /** Cari nomor baris terbaru dari id (kolom I). Baris lama tanpa id memakai "baris-N". */
    private async cariBaris(id: string): Promise<{ row: number; r: any[] }> {
        const rows = await this.existingRows();
        const m = /^baris-(\d+)$/.exec(id);
        if (m) { const row = Number(m[1]); const r = rows[row - 2]; if (r && !r[8]) return { row, r }; }
        const i = rows.findIndex((r) => String(r[8] || '') === id);
        if (i < 0) throw new Error('Transaksi tidak ditemukan (mungkin sudah dihapus/diubah di Sheets). Muat ulang dulu.');
        return { row: i + 2, r: rows[i] };
    }
    private bersih(x: any, lama?: any[]) {
        const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal || '') ? x.tanggal : (lama ? serialToIso(lama[0]) : new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
        const jam = /^\d{2}:\d{2}$/.test(x.jam || '') ? x.jam : (lama && typeof lama[1] === 'number' ? `${String(Math.floor(lama[1] * 24)).padStart(2, '0')}:${String(Math.round((lama[1] * 1440) % 60)).padStart(2, '0')}` : String(lama?.[1] || '00:00'));
        const jenis = ['Keluar', 'Masuk', 'Antar Rekening'].includes(x.jenis) ? x.jenis : String(lama?.[3] || 'Keluar');
        const nominal = Math.round(Number(x.nominal ?? lama?.[4]));
        if (!(nominal > 0) || nominal > 1e12) throw new Error('Nominal tidak valid');
        return [tanggal, jam, String(x.akun ?? lama?.[2] ?? 'Cash').slice(0, 30), jenis, nominal, String(x.pihak ?? lama?.[5] ?? '').slice(0, 80), String(x.kategori ?? lama?.[6] ?? 'Lainnya').slice(0, 40), String(x.keterangan ?? lama?.[7] ?? '').slice(0, 200)];
    }
    async ubah(id: string, x: any) {
        const { row, r } = await this.cariBaris(id);
        const v = this.bersih(x, r);
        const status = String(r[9] || '') === 'Perlu dicek' ? 'OK' : String(r[9] || 'OK');
        await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}/values/${this.sheetRange(`A${row}:J${row}`)}?valueInputOption=USER_ENTERED`, {
            method: 'PUT', body: JSON.stringify({ values: [[...v, r[8] || '', status]] })
        });
        this.reportCache = null;
        return { diubah: 1 };
    }
    /** Hapus beberapa transaksi sekaligus (dari bawah ke atas supaya nomor baris tidak bergeser). Salinannya disimpan dulu. */
    async hapus(ids: string[], arsipFile: string) {
        const rows = await this.existingRows();
        const target: Array<{ row: number; r: any[] }> = [];
        for (const id of ids) {
            const m = /^baris-(\d+)$/.exec(id);
            const i = m ? Number(m[1]) - 2 : rows.findIndex((r) => String(r[8] || '') === id);
            if (i >= 0 && rows[i] && (!m || !rows[i][8])) target.push({ row: i + 2, r: rows[i] });
        }
        if (!target.length) throw new Error('Transaksi tidak ditemukan. Muat ulang dulu.');
        let arsip: any[] = []; try { arsip = JSON.parse(fs.readFileSync(arsipFile, 'utf8')); } catch { /* baru */ }
        arsip.push(...target.map((t) => ({ at: Date.now(), baris: t.r })));
        fs.writeFileSync(arsipFile, JSON.stringify(arsip.slice(-2000)));
        const gid = await this.gid();
        target.sort((a, b) => b.row - a.row);
        await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}:batchUpdate`, {
            method: 'POST', body: JSON.stringify({ requests: target.map((t) => ({ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: t.row - 1, endIndex: t.row } } })) })
        });
        this.reportCache = null;
        return { dihapus: target.length };
    }
    /** Tambah banyak sekaligus (impor mutasi). id unik mencegah dobel kalau diimpor dua kali. */
    async tambahBanyak(list: any[], status = 'Mutasi') {
        if (!this.cfg.spreadsheetId) throw new Error('Pencatat belum diatur (pencatat.spreadsheetId kosong).');
        const ada = new Set((await this.existingRows()).map((r) => String(r[8] || '')));
        const values: any[][] = [];
        for (const x of list) {
            const id = String(x.id || '').slice(0, 60);
            if (!id || ada.has(id)) continue;
            ada.add(id);
            values.push([...this.bersih(x), id, status]);
        }
        if (values.length) await this.g.call(`https://sheets.googleapis.com/v4/spreadsheets/${this.cfg.spreadsheetId}/values/${this.sheetRange('A1:J1')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`, { method: 'POST', body: JSON.stringify({ values }) });
        this.reportCache = null;
        return { ditambah: values.length };
    }

    /** Data transaksi untuk laporan keuangan di tampilan kantor (dibaca dari Google Sheets, cache 60 detik). */
    async report(force = false): Promise<any> {
        if (!this.cfg.spreadsheetId) throw new Error('Pencatat belum diatur (pencatat.spreadsheetId kosong).');
        if (!force && this.reportCache && Date.now() - this.reportCache.at < 60_000) return this.reportCache.data;
        const rows = await this.existingRows();
        const tx = rows
            .map((r, i) => ({ r, row: i + 2 }))
            .filter(({ r }) => r[0] !== '' && r[0] !== undefined)
            .map(({ r, row }) => ({
                id: String(r[8] || `baris-${row}`),
                row,
                d: serialToIso(r[0]),
                t: typeof r[1] === 'number' ? `${String(Math.floor(r[1] * 24)).padStart(2, '0')}:${String(Math.round((r[1] * 1440) % 60)).padStart(2, '0')}` : String(r[1] || ''),
                bank: String(r[2] || ''),
                jenis: String(r[3] || ''),
                n: Math.round(Number(r[4]) || 0),
                pihak: String(r[5] || ''),
                kat: String(r[6] || 'Lainnya'),
                ket: String(r[7] || ''),
                status: String(r[9] || 'OK')
            }))
            .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.d));
        const data = {
            transaksi: tx,
            sheetUrl: `https://docs.google.com/spreadsheets/d/${this.cfg.spreadsheetId}/edit`,
            pencatat: { lastRun: this.status.lastRun, lastError: this.status.lastError, interval: this.cfg.intervalMinutes },
            updatedAt: Date.now()
        };
        this.reportCache = { at: Date.now(), data };
        return data;
    }

    private async maybeSummary() {
        if (this.cfg.dailySummaryHour < 0) return;
        const now = new Date(Date.now() + 7 * 3600_000);   // WIB
        const today = now.toISOString().slice(0, 10);
        if (now.getUTCHours() < this.cfg.dailySummaryHour || this.state.lastSummary === today) return;
        this.state.lastSummary = today;
        this.save();
        await this.runOnce();
        const rows = (await this.existingRows()).filter((r) => serialToIso(r[0]) === today);
        const sum = (j: string) => rows.filter((r) => r[3] === j).reduce((a, r) => a + (Number(r[4]) || 0), 0);
        const fmt = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
        const keluar = rows.filter((r) => r[3] === 'Keluar').sort((a, b) => (Number(b[4]) || 0) - (Number(a[4]) || 0));
        const cek = rows.filter((r) => r[9] === 'Perlu dicek').length;
        const text = rows.length === 0
            ? `📒 Ringkasan keuangan ${today}: tidak ada transaksi tercatat hari ini.`
            : `📒 Ringkasan keuangan ${today}\n` +
              `Masuk: ${fmt(sum('Masuk'))}\nKeluar: ${fmt(sum('Keluar'))} (${keluar.length} transaksi)\n` +
              (keluar.length ? `Terbesar:\n${keluar.slice(0, 3).map((r) => `• ${r[5]} — ${fmt(Number(r[4]) || 0)}`).join('\n')}\n` : '') +
              (cek ? `⚠️ ${cek} transaksi perlu dicek.\n` : '') +
              `Dashboard: https://docs.google.com/spreadsheets/d/${this.cfg.spreadsheetId}/edit`;
        await this.notify(text);
    }
}

/** Kirim pesan Telegram lewat bot Hermes (token & chat dari ~/.hermes/.env). */
export function telegramNotifier(hermesHome: string) {
    return async (text: string) => {
        catatNotif({ saluran: 'telegram', isi: text });
        try {
            const env = fs.readFileSync(path.join(hermesHome, '.env'), 'utf8');
            const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '');
            const token = get('TELEGRAM_BOT_TOKEN');
            const chat = get('TELEGRAM_HOME_CHANNEL') || get('TELEGRAM_ALLOWED_USERS').split(',')[0].trim();
            if (!token || !chat) return;
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text })
            });
        } catch { /* notifikasi tidak penting */ }
    };
}

/** Pesan rahasia ke Telegram Pak Rico (mis. kata sandi sementara): TIDAK dicatat di riwayat notifikasi. true = terkirim. */
export async function telegramRahasia(hermesHome: string, text: string): Promise<boolean> {
    try {
        const { token, chat } = teleCreds(hermesHome);
        if (!token || !chat) return false;
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
        return r.ok;
    } catch { return false; }
}

function teleCreds(hermesHome: string) {
    const env = fs.readFileSync(path.join(hermesHome, '.env'), 'utf8');
    const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '');
    return { token: get('TELEGRAM_BOT_TOKEN'), chat: get('TELEGRAM_HOME_CHANNEL') || get('TELEGRAM_ALLOWED_USERS').split(',')[0].trim() };
}

/** Kirim pesan Telegram atas nama satu AI: label tebal di baris pertama, dipecah kalau terlalu panjang. */
export async function telegramSebagai(hermesHome: string, label: string, isi: string): Promise<boolean> {
    try {
        const { token, chat } = teleCreds(hermesHome);
        if (!token || !chat) return false;
        const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = (t: string) => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
        const potong: string[] = [];
        let sisa = isi.trim() || '(tidak ada jawaban)';
        while (sisa.length > 3500) {
            let i = sisa.lastIndexOf('\n', 3500);
            if (i < 1500) i = 3500;
            potong.push(sisa.slice(0, i)); sisa = sisa.slice(i).trimStart();
        }
        potong.push(sisa);
        for (let n = 0; n < potong.length; n++) {
            const head = `<b>${esc(label)}</b>${potong.length > 1 ? ` (${n + 1}/${potong.length})` : ''}\n`;
            const send = (body: any) => fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, disable_web_page_preview: true, ...body }) });
            const r = await send({ text: head + html(potong[n]), parse_mode: 'HTML' });
            if (!r.ok) await send({ text: `${label}\n${potong[n]}` }); // cadangan tanpa format
        }
        return true;
    } catch { return false; }
}

/** Tampilkan "sedang mengetik…" di Telegram selama fn berjalan. */
export async function sambilMengetik<T>(hermesHome: string, fn: () => Promise<T>): Promise<T> {
    let t: NodeJS.Timeout | undefined;
    try {
        const { token, chat } = teleCreds(hermesHome);
        if (token && chat) {
            const ping = () => fetch(`https://api.telegram.org/bot${token}/sendChatAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, action: 'typing' }) }).catch(() => undefined);
            ping(); t = setInterval(ping, 4500);
        }
    } catch { /* */ }
    try { return await fn(); } finally { if (t) clearInterval(t); }
}

/** Ringkasan bulanan untuk agen Keuangan (teks pendek, hemat token). */
export function ringkasanKeuangan(tx: Array<{ d: string; jenis: string; n: number; kat: string; pihak: string; bank: string }>, ym: string): string {
    const inMonth = tx.filter((t) => t.d.startsWith(ym));
    const keluar = inMonth.filter((t) => t.jenis === 'Keluar');
    const sum = (xs: typeof tx) => xs.reduce((a, t) => a + t.n, 0);
    const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
    const byKat = new Map<string, number>();
    keluar.forEach((t) => byKat.set(t.kat || 'Lainnya', (byKat.get(t.kat || 'Lainnya') || 0) + t.n));
    const days = new Set(inMonth.map((t) => t.d)).size;
    const [y, m] = ym.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const elapsed = today.startsWith(ym) ? Number(today.slice(8, 10)) : daysInMonth;
    // 3 bulan sebelumnya untuk pembanding
    const prev = [1, 2, 3].map((k) => {
        const d = new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 7);
        return `${d}: keluar ${rp(sum(tx.filter((t) => t.d.startsWith(d) && t.jenis === 'Keluar')))}, masuk ${rp(sum(tx.filter((t) => t.d.startsWith(d) && t.jenis === 'Masuk')))}`;
    });
    const top = [...keluar].sort((a, b) => b.n - a.n).slice(0, 5).map((t) => `${t.d} ${t.pihak} ${rp(t.n)} (${t.kat})`);
    return [
        `Ringkasan keuangan ${ym} (hari ke-${elapsed} dari ${daysInMonth}, ${days} hari ada transaksi)`,
        `Masuk ${rp(sum(inMonth.filter((t) => t.jenis === 'Masuk')))} · Keluar ${rp(sum(keluar))} (${keluar.length} transaksi) · rata-rata keluar/hari ${rp(sum(keluar) / Math.max(1, elapsed))}`,
        `Per kategori: ${Array.from(byKat.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${rp(v)}`).join('; ') || '-'}`,
        `5 terbesar: ${top.join('; ') || '-'}`,
        `Bulan-bulan sebelumnya: ${prev.join(' | ')}`,
        `Perlu dicek: ${tx.filter((t: any) => t.status === 'Perlu dicek').length}`
    ].join('\n');
}
