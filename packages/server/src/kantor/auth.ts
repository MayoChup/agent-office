import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Login sederhana untuk Kantor Virtual.
 *
 * - Kata sandi dari KANTOR_PASSWORD (.env). Kalau kosong, dibuatkan otomatis dan
 *   disimpan di data/kantor-password.txt (hanya bisa dibaca user kantor).
 * - Setelah login, browser menyimpan token (berlaku 30 hari), bukan kata sandinya.
 * - Mengganti kata sandi otomatis membatalkan semua token lama.
 */
export class KantorAuth {
    private password: string;
    private secret: Buffer;
    private attempts = new Map<string, { count: number; since: number }>();
    readonly generated: boolean;

    constructor(dataDir: string, password: string) {
        fs.mkdirSync(dataDir, { recursive: true });
        const pwFile = path.join(dataDir, 'kantor-password.txt');
        if (password) {
            this.password = password;
            this.generated = false;
        } else if (fs.existsSync(pwFile)) {
            this.password = fs.readFileSync(pwFile, 'utf8').trim();
            this.generated = true;
        } else {
            const words = ['kopi', 'meja', 'pixel', 'kantor', 'jeruk', 'awan', 'kucing', 'mangga', 'roket', 'pantai', 'bulan', 'teh'];
            const pick = () => words[crypto.randomInt(words.length)];
            this.password = `${pick()}-${pick()}-${pick()}-${crypto.randomInt(100, 999)}`;
            fs.writeFileSync(pwFile, this.password + '\n', { mode: 0o600 });
            this.generated = true;
        }

        const secretFile = path.join(dataDir, 'kantor-secret.key');
        if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
        const base = fs.readFileSync(secretFile, 'utf8').trim();
        this.secret = crypto.createHash('sha256').update(`${base}:${this.password}`).digest();
    }

    private sign(payload: string) {
        return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    }

    issueToken(days = 30): string {
        const exp = Date.now() + days * 24 * 3600 * 1000;
        const payload = `${exp}`;
        return `${payload}.${this.sign(payload)}`;
    }

    verify(token: unknown): boolean {
        if (typeof token !== 'string' || !token.includes('.')) return false;
        const [payload, sig] = token.split('.', 2);
        const expected = this.sign(payload);
        if (sig.length !== expected.length) return false;
        if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
        return Number(payload) > Date.now();
    }

    /** Cek kata sandi dengan batas percobaan per alamat (10x per 15 menit). */
    login(password: unknown, ip: string): { ok: boolean; token?: string; error?: string } {
        const now = Date.now();
        const rec = this.attempts.get(ip);
        if (rec && now - rec.since < 15 * 60_000 && rec.count >= 10) {
            return { ok: false, error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' };
        }
        const given = Buffer.from(String(password || ''));
        const real = Buffer.from(this.password);
        const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
        if (!ok) {
            if (!rec || now - rec.since >= 15 * 60_000) this.attempts.set(ip, { count: 1, since: now });
            else rec.count++;
            return { ok: false, error: 'Kata sandi salah.' };
        }
        this.attempts.delete(ip);
        return { ok: true, token: this.issueToken() };
    }
}
