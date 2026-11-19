/**
 * Rem otonomi & pemutus sirkuit per AI (ATM dari Munder Difflin: "autonomy with a leash" + circuit breaker).
 * Tangga: normal → tegur → batasi → henti.
 *  - Galat beruntun: 3× = tegur, 6× = henti (otomatis lepas 60 menit, atau Pak Rico menekan "Lanjutkan").
 *  - Berputar-putar (tugas berjudul sama berulang dalam 30 menit): 5× = batasi (jeda 60 dtk/tugas), 10× = henti.
 *  - Anggaran token per AI per 5 jam / hari / minggu (perkiraan: 4 karakter ≈ 1 token):
 *      ≥80% = tegur, ≥100% = batasi (maks 1 tugas per 5 menit), ≥130% = henti sampai jendela waktunya lewat.
 * Chat langsung dari Pak Rico tidak dihitung sebagai "berputar" dan tidak pernah dibatasi jeda (hanya dihentikan kalau "henti").
 */
import fs from 'fs';
import path from 'path';

export type StatusRem = 'normal' | 'tegur' | 'batasi' | 'henti';
interface Jejak { at: number; tok: number; ok: boolean; sig: string }
interface StAi { status: StatusRem; sebab: string; sejak: number; lanjutHingga?: number; terakhirBatas?: number }
export interface Anggaran { jam5: number; hari: number; minggu: number }

const JAM = 3600_000;
const URUT: StatusRem[] = ['normal', 'tegur', 'batasi', 'henti'];

export class Rem {
    private file: string;
    private st: { ai: Record<string, StAi>; jejak: Record<string, Jejak[]>; anggaran: Record<string, Anggaran> } = { ai: {}, jejak: {}, anggaran: {} };
    private simpanT: ReturnType<typeof setTimeout> | null = null;
    onUbah?: (ai: string, lama: StatusRem, baru: StatusRem, sebab: string) => void;
    constructor(dataDir: string, private bawaan: Anggaran = { jam5: 200_000, hari: 600_000, minggu: 3_000_000 }) {
        this.file = path.join(dataDir, 'rem-ai.json');
        try { this.st = { ...this.st, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { /* baru */ }
    }
    private simpan() {
        if (this.simpanT) return;
        this.simpanT = setTimeout(() => { this.simpanT = null; try { fs.writeFileSync(this.file, JSON.stringify(this.st)); } catch (e: any) { console.warn('[Rem] simpan:', e?.message || e); } }, 2000);
    }
    anggaran(ai: string): Anggaran { return { ...this.bawaan, ...(this.st.anggaran[ai] || {}) }; }
    setAnggaran(ai: string, a: Partial<Anggaran>) {
        const v = (n: any, d: number) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : d);
        const lama = this.anggaran(ai);
        this.st.anggaran[ai] = { jam5: v(a.jam5, lama.jam5), hari: v(a.hari, lama.hari), minggu: v(a.minggu, lama.minggu) };
        this.nilai(ai); this.simpan(); return this.st.anggaran[ai];
    }
    private jejak(ai: string) { const now = Date.now(); const j = (this.st.jejak[ai] ||= []).filter((x) => now - x.at < 7 * 24 * JAM); this.st.jejak[ai] = j.slice(-3000); return this.st.jejak[ai]; }
    pakai(ai: string) {
        const now = Date.now(), j = this.jejak(ai);
        const sum = (ms: number) => j.filter((x) => now - x.at < ms).reduce((s, x) => s + x.tok, 0);
        return { jam5: sum(5 * JAM), hari: sum(24 * JAM), minggu: sum(7 * 24 * JAM) };
    }
    /** Hitung ulang status dari jejak. Status "henti" karena galat menunggu 60 menit atau tombol Lanjutkan. */
    private nilai(ai: string): StAi {
        const now = Date.now(), j = this.jejak(ai), lama = this.st.ai[ai] || { status: 'normal', sebab: '', sejak: now };
        if (lama.lanjutHingga && now < lama.lanjutHingga) return lama; // Pak Rico menekan Lanjutkan: dibebaskan sementara
        let status: StatusRem = 'normal', sebab = '';
        const naik = (s: StatusRem, alasan: string) => { if (URUT.indexOf(s) > URUT.indexOf(status)) { status = s; sebab = alasan; } };
        // Galat beruntun
        let gagal = 0; for (let i = j.length - 1; i >= 0 && !j[i].ok; i--) gagal++;
        const terakhirGagal = j[j.length - 1]?.at || 0;
        if (gagal >= 6 && now - terakhirGagal < JAM) naik('henti', `${gagal}× gagal berturut-turut`);
        else if (gagal >= 3) naik('tegur', `${gagal}× gagal berturut-turut`);
        // Berputar-putar
        const baru = j.filter((x) => now - x.at < 30 * 60_000 && x.sig && !x.sig.startsWith('chat:'));
        const hit = new Map<string, number>(); for (const x of baru) hit.set(x.sig, (hit.get(x.sig) || 0) + 1);
        const [sigTop, nTop] = [...hit.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
        if (nTop >= 10) naik('henti', `tugas "${sigTop.slice(0, 50)}" diulang ${nTop}× dalam 30 menit`);
        else if (nTop >= 5) naik('batasi', `tugas "${sigTop.slice(0, 50)}" diulang ${nTop}× dalam 30 menit`);
        // Anggaran
        const p = this.pakai(ai), a = this.anggaran(ai);
        for (const [k, label] of [['jam5', '5 jam'], ['hari', 'hari ini'], ['minggu', 'minggu ini']] as const) {
            const r = p[k] / a[k];
            if (r >= 1.3) naik('henti', `anggaran ${label} terpakai ${Math.round(r * 100)}%`);
            else if (r >= 1) naik('batasi', `anggaran ${label} terpakai ${Math.round(r * 100)}%`);
            else if (r >= 0.8) naik('tegur', `anggaran ${label} terpakai ${Math.round(r * 100)}%`);
        }
        const st: StAi = { ...lama, status, sebab, sejak: status === lama.status ? lama.sejak : now, lanjutHingga: undefined };
        this.st.ai[ai] = st;
        if (status !== lama.status) { this.simpan(); try { this.onUbah?.(ai, lama.status, status, sebab); } catch { /* */ } }
        return st;
    }
    /** Boleh jalan? Untuk "batasi": jeda yang harus ditunggu. Chat dari Pak Rico (sig "chat:…") tidak pernah dijeda. */
    izin(ai: string, sig: string): { boleh: boolean; tundaMs: number; status: StatusRem; sebab: string } {
        const s = this.nilai(ai);
        if (s.status === 'henti') return { boleh: false, tundaMs: 0, status: s.status, sebab: s.sebab };
        if (s.status === 'batasi' && !sig.startsWith('chat:')) {
            const jeda = /anggaran/.test(s.sebab) ? 5 * 60_000 : 60_000;
            const tunggu = Math.max(0, (s.terakhirBatas || 0) + jeda - Date.now());
            s.terakhirBatas = Date.now() + tunggu; this.simpan();
            return { boleh: true, tundaMs: tunggu, status: s.status, sebab: s.sebab };
        }
        return { boleh: true, tundaMs: 0, status: s.status, sebab: s.sebab };
    }
    catat(ai: string, masukChar: number, keluarChar: number, ok: boolean, sig: string) {
        this.jejak(ai).push({ at: Date.now(), tok: Math.round((masukChar + keluarChar) / 4), ok, sig: sig.slice(0, 80) });
        this.nilai(ai); this.simpan();
    }
    /** Pak Rico menekan "Lanjutkan": dibebaskan 2 jam, galat beruntun dianggap selesai. */
    lanjutkan(ai: string) {
        const j = this.jejak(ai); if (j.length && !j[j.length - 1].ok) j.push({ at: Date.now(), tok: 0, ok: true, sig: 'lanjutkan' });
        const lama = this.st.ai[ai]?.status || 'normal';
        this.st.ai[ai] = { status: 'normal', sebab: 'Dilanjutkan Pak Rico', sejak: Date.now(), lanjutHingga: Date.now() + 2 * JAM };
        this.simpan(); if (lama !== 'normal') try { this.onUbah?.(ai, lama, 'normal', 'Dilanjutkan Pak Rico'); } catch { /* */ }
    }
    ringkas(ai: string) {
        const s = this.nilai(ai), p = this.pakai(ai), a = this.anggaran(ai);
        return { status: s.status, sebab: s.sebab, sejak: s.sejak, pakai: p, anggaran: a, persen: { jam5: Math.round((p.jam5 / a.jam5) * 100), hari: Math.round((p.hari / a.hari) * 100), minggu: Math.round((p.minggu / a.minggu) * 100) } };
    }
}
