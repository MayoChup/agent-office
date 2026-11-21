/**
 * Antrean Kronos: prediksi banyak saham di latar belakang (tidak perlu menunggu di halaman), hasil disimpan permanen.
 *  - Satu saham dikerjakan sekali satu (CPU VPS terbatas); antrean & hasil disimpan ke disk → aman saat kantor dimulai ulang.
 *  - Hasil per saham + gaya posisi (mode, H): ringkasan untuk lencana/kartu + hasil lengkap untuk halaman detail (tanpa hitung ulang).
 *  - Gaya posisi aktif disimpan di server (sama di HP & laptop) → dipakai hitungan massal & Kronos otomatis tiap malam.
 */
import fs from 'fs';
import path from 'path';

export interface Gaya { mode: string; tanggal?: string; H: number; label: string }
export interface Ringkas {
    s: string; mode: string; H: number; label: string; tanggal?: string; at: number; harga: number; mesin: string;
    medianPct: number | null; pNaik: number | null;
    /** profil Moderat: target/stop dalam % dari harga sekarang, peluang kena (dari jalur prediksi), risiko:hasil */
    targetPct: number; stopPct: number; pTarget: number; pStop: number; rr: number; harapan: number; hariTarget: number | null;
    /** Ketiga profil (Konservatif, Moderat, Agresif). Target/stop dalam % dari harga MASUK profil itu. */
    profil?: ProfilRingkas[];
}
export interface ProfilRingkas { id: 'k' | 'm' | 'a'; nama: string; masukPct: number; pMasuk: number; targetPct: number; stopPct: number; pTarget: number; pStop: number; pTidak: number; rr: number; harapan: number }
const ID_PROFIL = (n: string): 'k' | 'm' | 'a' => (/konserv/i.test(n) ? 'k' : /agres/i.test(n) ? 'a' : 'm');
/** Ringkas ketiga profil dari keluaran prediksi. */
export function ringkasProfil(out: any, harga: number): ProfilRingkas[] {
    const arr: any[] = Array.isArray(out?.profil) ? out.profil : Array.isArray(out?.hasil) ? out.hasil : [];
    return arr.filter((p) => p && p.masuk && p.target && p.stop).map((p) => {
        const m = Number(p.masuk);
        return { id: ID_PROFIL(String(p.nama || p.id || '')), nama: String(p.nama || ''), masukPct: +((m / harga - 1) * 100).toFixed(2), pMasuk: Math.round(p.pMasuk ?? 100),
            targetPct: +((p.target / m - 1) * 100).toFixed(2), stopPct: +((p.stop / m - 1) * 100).toFixed(2),
            pTarget: Math.round(p.pTarget ?? 0), pStop: Math.round(p.pStop ?? 0), pTidak: Math.round(p.pTidak ?? 0), rr: +(Number(p.rr) || 0).toFixed(2), harapan: +(Number(p.harapan) || 0).toFixed(2) };
    }).sort((a, b) => 'kma'.indexOf(a.id) - 'kma'.indexOf(b.id));
}
/** Profil dengan harapan terbaik (yang pernah bisa masuk). */
export function profilTerbaik(r: Pick<Ringkas, 'profil'>) { return (r.profil || []).filter((p) => p.pMasuk > 0).sort((a, b) => b.harapan - a.harapan)[0] || null; }
interface Tugas { s: string; mode: string; H: number; tanggal?: string; label: string; asal: 'massal' | 'satu' | 'malam'; at: number }
interface Status {
    antre: Tugas[]; jalan: (Tugas & { mulai: number }) | null; selesai: string[]; gagal: Array<{ s: string; galat: string }>;
    total: number; mulaiBatch: number; rataDetik: number; nDetik: number; malam: boolean; malamKe: string;
    /** Jadwal Kronos otomatis (WIB): jam "HH:MM" & hari (0=Minggu … 6=Sabtu). Bawaan: mati. */
    jadwal?: { jam: string; hari: number[] };
}
const LABEL: Record<string, string> = { scalping: 'Scalping', daytrade: 'Day trading', swingpendek: 'Swing pendek', swing: 'Swing', posisi: 'Posisi', investasi: 'Investasi', tanggal: 'Sampai tanggal' };
const H_MODE: Record<string, number> = { scalping: 1, daytrade: 1, swingpendek: 5, swing: 20, posisi: 60, investasi: 120 };
const wib = () => new Date(Date.now() + 7 * 3600_000);
/** Hasil Kronos hanya bergantung pada panjang horison (H hari bursa; H=1 = batang menit) → kunci = H. */
export const kunciGaya = (_mode: string, H: number) => `h:${H}`;
const labelH = (H: number) => ({ 1: 'Day trading', 5: 'Swing pendek', 20: 'Swing', 60: 'Posisi', 120: 'Investasi' } as Record<number, string>)[H] || `${H} hari bursa`;

/** Hari bursa NY dari hari ini sampai tanggal (inklusif), kira-kira (tanpa libur) — untuk mode "sampai tanggal". */
function hariBursaSampai(t: string) {
    const d = new Date(Date.now() - 5 * 3600_000); d.setUTCHours(12, 0, 0, 0); let n = 0;
    for (let i = 0; i < 400; i++) { d.setUTCDate(d.getUTCDate() + 1); const s = d.toISOString().slice(0, 10); if (s > t) break; const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return Math.max(1, Math.min(120, n));
}
export function gayaDari(mode: string, tanggal?: string, Hui?: number): Gaya {
    if (mode === 'tanggal' && tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { mode, tanggal, H: Hui && Hui >= 1 && Hui <= 120 ? Math.round(Hui) : hariBursaSampai(tanggal), label: `s/d ${new Date(tanggal + 'T12:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` };
    const m = H_MODE[mode] ? mode : 'swing';
    return { mode: m, H: H_MODE[m], label: LABEL[m] };
}

export class KronosAntre {
    private fHasil: string; private dHasil: string; private fStatus: string; private fGaya: string;
    private hasil: Record<string, Ringkas> = {};
    private st: Status;
    private kerja = false;
    constructor(private dataDir: string, private o: {
        hitung: (s: string, H: number, mode: string) => Promise<any>;
        terpasang: () => boolean;
        watchlist: () => string[];
        kabar: (teks: string) => void;
        papan: <T>(judul: string, detail: string, fn: () => Promise<T>) => Promise<T>;
    }) {
        this.fHasil = path.join(dataDir, 'kronos-hasil.json');
        this.dHasil = path.join(dataDir, 'kronos-hasil');
        this.fStatus = path.join(dataDir, 'kronos-antre.json');
        this.fGaya = path.join(dataDir, 'trading-gaya.json');
        fs.mkdirSync(this.dHasil, { recursive: true });
        try { this.hasil = JSON.parse(fs.readFileSync(this.fHasil, 'utf8')); } catch { /* baru */ }
        // Hasil lama (dulu hanya Moderat) → lengkapi ketiga profil dari hasil lengkap yang tersimpan, tanpa hitung ulang.
        let isi = 0;
        for (const [k, r] of Object.entries(this.hasil)) {
            if (r.profil?.length) continue;
            const [s, g] = k.split('|');
            try { const j = JSON.parse(fs.readFileSync(this.fileLengkap(s, g), 'utf8')); const pr = ringkasProfil(j.out, r.harga); if (pr.length) { r.profil = pr; isi++; } } catch { /* tidak ada */ }
        }
        if (isi) this.simpanHasil();
        try { this.st = JSON.parse(fs.readFileSync(this.fStatus, 'utf8')); } catch { this.st = { antre: [], jalan: null, selesai: [], gagal: [], total: 0, mulaiBatch: 0, rataDetik: 60, nDetik: 0, malam: false, malamKe: '' }; }
        if (!this.st.jadwal) this.st.jadwal = { jam: '06:00', hari: [2, 3, 4, 5, 6] };
        // Tugas yang sedang jalan saat kantor mati → kembali ke depan antrean.
        if (this.st.jalan) { const { mulai: _m, ...t } = this.st.jalan; this.st.antre.unshift(t); this.st.jalan = null; }
        this.simpanSt();
        setTimeout(() => this.putar(), 20_000);
        setInterval(() => this.cekMalam(), 60_000).unref();
    }
    private simpanSt() { try { fs.writeFileSync(this.fStatus, JSON.stringify(this.st)); } catch { /* */ } }
    private simpanHasil() { try { fs.writeFileSync(this.fHasil, JSON.stringify(this.hasil)); } catch { /* */ } }
    private fileLengkap(s: string, g: string) { return path.join(this.dHasil, `${s.replace(/[^A-Z0-9.\-]/g, '_')}_${g.replace(/[^a-z0-9:]/g, '_').replace(':', '-')}.json`); }

    /* ── Gaya aktif (sama di semua perangkat) ── */
    gaya(): Gaya { try { const j = JSON.parse(fs.readFileSync(this.fGaya, 'utf8')); return gayaDari(j.mode, j.tanggal, j.H); } catch { return gayaDari('swing'); } }
    adaGaya() { return fs.existsSync(this.fGaya); }
    aturGaya(mode: string, tanggal?: string, H?: number) { const g = gayaDari(mode, tanggal, H); fs.writeFileSync(this.fGaya, JSON.stringify({ mode: g.mode, tanggal: g.tanggal, H: g.H, at: Date.now() })); return g; }

    /* ── Hasil ── */
    /** Simpan hasil prediksi lengkap (dipanggil juga dari halaman detail saat Bapak menghitung satu saham). */
    catat(s: string, mode: string, H: number, out: any) {
        if (!out || out.mesin !== 'kronos') return;
        const mod = (out.profil || out.hasil || []).find?.((p: any) => /moderat/i.test(p.nama || p.id || '')) || (out.profil || out.hasil || [])[1];
        if (!mod) return;
        const harga = Number(out.harga) || Number(mod.masuk) || 0; if (!harga) return;
        const g = kunciGaya(mode, H), gy = { label: labelH(H) };
        const r: Ringkas = {
            s, mode, H, label: gy.label, at: Date.now(), harga, mesin: out.mesin,
            medianPct: out.medianPct ?? null, pNaik: out.pNaik ?? null,
            targetPct: +((mod.target / harga - 1) * 100).toFixed(2), stopPct: +((mod.stop / harga - 1) * 100).toFixed(2),
            pTarget: Math.round(mod.pTarget ?? 0), pStop: Math.round(mod.pStop ?? 0), rr: +(Number(mod.rr) || 0).toFixed(2), harapan: +(Number(mod.harapan) || 0).toFixed(2), hariTarget: mod.hariTarget ?? null,
            profil: ringkasProfil(out, harga)
        };
        this.hasil[`${s}|${g}`] = r; this.simpanHasil();
        try { fs.writeFileSync(this.fileLengkap(s, g), JSON.stringify({ at: r.at, out })); } catch { /* */ }
    }
    /** Hasil lengkap tersimpan (untuk halaman detail: tampil langsung tanpa menunggu). */
    lengkap(s: string, mode: string, H: number): { at: number; out: any } | null {
        try { return JSON.parse(fs.readFileSync(this.fileLengkap(s, kunciGaya(mode, H)), 'utf8')); } catch { return null; }
    }
    /** Kedaluwarsa: harian = lewat satu sesi bursa (±24 jam); intraday = lewat 1 jam. */
    static basi(at: number, H: number) { return Date.now() - at > (H <= 1 ? 3600_000 : 24 * 3600_000); }
    daftar(mode: string, H: number) {
        const g = kunciGaya(mode, H), aktif: Record<string, Ringkas & { basi: boolean }> = {}, lain: Record<string, Array<{ label: string; at: number }>> = {};
        for (const [k, r] of Object.entries(this.hasil)) {
            const [s, gk] = k.split('|');
            if (gk === g) aktif[s] = { ...r, basi: KronosAntre.basi(r.at, r.H) };
            else (lain[s] ||= []).push({ label: r.label, at: r.at });
        }
        return { aktif, lain };
    }

    /* ── Antrean ── */
    status() {
        const sisa = this.st.antre.length + (this.st.jalan ? 1 : 0);
        const lewat = this.st.jalan ? (Date.now() - this.st.jalan.mulai) / 1000 : 0;
        return { antre: this.st.antre.map((t) => t.s), jalan: this.st.jalan ? { s: this.st.jalan.s, label: this.st.jalan.label, detik: Math.round(lewat) } : null, selesai: this.st.selesai.length, gagal: this.st.gagal.slice(-10), total: this.st.total,
            sisaDetik: Math.max(0, Math.round(sisa * this.st.rataDetik - lewat)), rataDetik: Math.round(this.st.rataDetik), malam: this.st.malam, malamKe: this.st.malamKe, jadwal: this.st.jadwal, terpasang: this.o.terpasang(), gaya: this.gaya() };
    }
    tambah(simbol: string[], g: Gaya, asal: Tugas['asal']) {
        if (!this.o.terpasang()) throw new Error('Kronos belum terpasang di VPS. Pasang dulu dari halaman prediksi salah satu saham.');
        const ada = new Set([...this.st.antre, ...(this.st.jalan ? [this.st.jalan] : [])].map((t) => `${t.s}|${kunciGaya(t.mode, t.H)}`));
        const baru = [...new Set(simbol.map((s) => String(s).toUpperCase().trim()).filter((s) => /^[A-Z0-9.\-]{1,12}$/.test(s)))]
            .filter((s) => !ada.has(`${s}|${kunciGaya(g.mode, g.H)}`)).map((s) => ({ s, mode: g.mode, H: g.H, tanggal: g.tanggal, label: g.label, asal, at: Date.now() }));
        if (!this.st.jalan && !this.st.antre.length) { this.st.selesai = []; this.st.gagal = []; this.st.total = 0; this.st.mulaiBatch = Date.now(); }
        this.st.antre.push(...baru); this.st.total += baru.length; this.simpanSt();
        void this.putar();
        return baru.length;
    }
    batal() { const n = this.st.antre.length; this.st.total -= n; this.st.antre = []; this.simpanSt(); return n; }
    aturMalam(nyala: boolean, jadwal?: { jam?: string; hari?: number[] }) {
        this.st.malam = nyala;
        if (jadwal) {
            const jam = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(jadwal.jam || '')) ? String(jadwal.jam) : this.st.jadwal!.jam;
            const hari = Array.isArray(jadwal.hari) ? [...new Set(jadwal.hari.map(Number).filter((h) => h >= 0 && h <= 6))].sort() : this.st.jadwal!.hari;
            if (!hari.length) throw new Error('Pilih minimal satu hari.');
            if (jam !== this.st.jadwal!.jam) this.st.malamKe = ''; // jam diganti → boleh jalan lagi hari ini
            this.st.jadwal = { jam, hari };
        }
        this.simpanSt(); return nyala;
    }

    private async putar() {
        if (this.kerja) return; this.kerja = true;
        try {
            while (this.st.antre.length) {
                const t = this.st.antre.shift()!; this.st.jalan = { ...t, mulai: Date.now() }; this.simpanSt();
                try {
                    const out = await this.o.hitung(t.s, t.H, t.mode);
                    if (out?.mesin !== 'kronos') throw new Error(out?.kronos?.catatan || 'Kronos tidak menjawab (memakai simulasi cadangan).');
                    this.catat(t.s, t.mode, t.H, out);
                    this.st.selesai.push(t.s);
                    const det = (Date.now() - this.st.jalan.mulai) / 1000;
                    this.st.nDetik++; this.st.rataDetik = this.st.nDetik === 1 ? det : this.st.rataDetik * 0.7 + det * 0.3;
                } catch (e: any) { this.st.gagal.push({ s: t.s, galat: String(e?.message || e).slice(0, 160) }); }
                this.st.jalan = null; this.simpanSt();
            }
            if (this.st.total > 1) this.laporBatch();
        } finally { this.kerja = false; }
    }
    private laporBatch() {
        const g = this.gaya(), d = this.daftar(g.mode, g.H).aktif;
        const ok = this.st.selesai.map((s) => d[s]).filter(Boolean);
        const terbaik = (r: Ringkas) => profilTerbaik(r)?.harapan ?? r.harapan;
        const bagus = ok.filter((r) => terbaik(r) > 0).sort((a, b) => terbaik(b) - terbaik(a)).slice(0, 6);
        const f = (x: number) => String(x).replace('.', ',');
        const baris = (r: Ringkas) => {
            const pr = r.profil?.length ? r.profil : [{ id: 'm', rr: r.rr, harapan: r.harapan, pMasuk: 100 } as ProfilRingkas];
            const b = profilTerbaik(r);
            return `- **${r.s}** · ${pr.map((p) => `${p.id.toUpperCase()} 1:${f(p.rr)} (${p.harapan > 0 ? '+' : ''}${f(p.harapan)}%)${b && b.id === p.id ? '★' : ''}`).join(' · ')}`;
        };
        const menit = Math.max(1, Math.round((Date.now() - this.st.mulaiBatch) / 60_000));
        const teks = [`🔮 **Kronos selesai** — ${ok.length} saham, gaya ${g.label} (±${menit} menit).`,
            bagus.length ? `Harapan per posisi positif (K/M/A = Konservatif/Moderat/Agresif · R:R (harapan) · ★ terbaik):\n${bagus.map(baris).join('\n')}` : 'Belum ada saham dengan harapan per posisi positif di profil mana pun.',
            this.st.gagal.length ? `Gagal: ${this.st.gagal.map((x) => x.s).join(', ')}.` : '',
            'Detail di Trading → Watchlist (tanda 🔮). Ini prediksi statistik, bukan saran beli/jual.'].filter(Boolean).join('\n\n');
        try { this.o.kabar(teks); } catch { /* */ }
    }
    /** Kronos otomatis sesuai jadwal Pak Rico (jam & hari WIB). Jalan sekali per hari terjadwal, dalam 30 menit setelah jamnya. */
    private cekMalam() {
        if (!this.st.malam || !this.o.terpasang() || !this.st.jadwal) return;
        const w = wib(), hari = w.toISOString().slice(0, 10), dow = w.getUTCDay();
        const [hh, mm] = this.st.jadwal.jam.split(':').map(Number), menit = w.getUTCHours() * 60 + w.getUTCMinutes(), target = hh * 60 + mm;
        if (this.st.malamKe === hari || !this.st.jadwal.hari.includes(dow) || menit < target || menit > target + 30) return;
        this.st.malamKe = hari; this.simpanSt();
        const g = this.gaya();
        try { this.tambah(this.o.watchlist(), g, 'malam'); } catch (e: any) { console.warn('[Kronos] terjadwal:', e?.message || e); }
    }
}
