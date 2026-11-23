import fs from 'node:fs';
import path from 'node:path';
import { makroMendatang, hariLagi } from './acara';

/**
 * Laporan sinyal pagi: dikirim ke chat Dito (dan notifikasi) Selasa–Sabtu, setelah bursa AS tutup.
 * Disusun langsung dari data kantor (tanpa AI): pasar semalam, Beli kuat (4 faktor lengkap), Pantul, watchlist/portofolio, acara pekan ini.
 */
export interface AturPagi { nyala: boolean; jam: string; hari: number[]; terakhir: string }
interface Sumber {
    baris: () => any[];
    /** Harga penutupan SPY (S&P 500) urut lama → baru. */
    spy: () => number[] | null;
    simbolPantau: () => { watch: string[]; pegang: string[] };
    kronos: (s: string) => { id: string; rr: number | null; harapan: number | null } | null;
    laba: () => Promise<Map<string, { tgl: string; waktu: string }>>;
    kirim: (teks: string) => Promise<void>;
}
const HARI_BAWAAN = [2, 3, 4, 5, 6]; // Selasa–Sabtu WIB (bursa AS Senin–Jumat); 0 = Minggu
const P = (v: number | null | undefined, d = 1) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const $ = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tglId = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const wib = () => new Date(Date.now() + 7 * 3600_000);

export class LaporanPagi {
    private f: string;
    private jalan = false;
    constructor(dataDir: string, private src: Sumber) {
        this.f = path.join(dataDir, 'laporan-pagi.json');
        setInterval(() => { this.cek().catch((e) => console.warn('[Laporan pagi]', e?.message || e)); }, 60_000).unref?.();
    }
    atur(): AturPagi { try { return { nyala: true, jam: '07:00', hari: HARI_BAWAAN, terakhir: '', ...JSON.parse(fs.readFileSync(this.f, 'utf8')) }; } catch { return { nyala: true, jam: '07:00', hari: HARI_BAWAAN, terakhir: '' }; } }
    ubah(x: Partial<AturPagi>): AturPagi {
        const a = this.atur();
        if (typeof x.nyala === 'boolean') a.nyala = x.nyala;
        if (typeof x.jam === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.jam)) a.jam = x.jam;
        if (Array.isArray(x.hari)) { const h = [...new Set(x.hari.map(Number).filter((d) => d >= 0 && d <= 6))].sort(); if (h.length) a.hari = h; }
        fs.writeFileSync(this.f, JSON.stringify(a)); return a;
    }
    private async cek() {
        const a = this.atur(), w = wib(), hari = w.toISOString().slice(0, 10), jam = w.toISOString().slice(11, 16);
        if (!a.nyala || this.jalan || a.terakhir === hari || !a.hari.includes(w.getUTCDay()) || jam < a.jam) return;
        if (jam > a.jam.replace(/^(\d\d)/, (h) => String(Math.min(23, +h + 5)).padStart(2, '0'))) return; // server baru menyala jauh setelah jadwal → lewati hari ini
        this.jalan = true;
        try { await this.src.kirim(await this.susun()); fs.writeFileSync(this.f, JSON.stringify({ ...a, terakhir: hari })); }
        finally { this.jalan = false; }
    }
    async kirimSekarang() { const t = await this.susun(); await this.src.kirim(t); return t; }

    async susun(): Promise<string> {
        const baris = this.src.baris().filter((b) => b && b.harga > 0);
        const cari = new Map(baris.map((b) => [b.s, b]));
        const L: string[] = [`☀️ Laporan sinyal pagi · ${wib().toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}`];

        // 1) Pasar semalam
        const sc = this.src.spy() || [];
        const spyChg = sc.length >= 2 ? (sc[sc.length - 1] / sc[sc.length - 2] - 1) * 100 : cari.get('SPY')?.chg1d ?? null;
        const sek = new Map<string, number[]>();
        for (const b of baris) if (b.sektor && b.s !== 'SPY') { const xs = sek.get(b.sektor) || []; xs.push(b.chg1d); sek.set(b.sektor, xs); }
        const rata = [...sek.entries()].filter(([, xs]) => xs.length >= 5).map(([k, xs]) => [k, xs.reduce((a, c) => a + c, 0) / xs.length] as [string, number]).sort((a, b) => b[1] - a[1]);
        L.push('', '📊 Pasar semalam');
        L.push(`S&P 500 ${P(spyChg, 2)}${rata.length ? ` · terkuat ${rata[0][0]} ${P(rata[0][1])} · terlemah ${rata[rata.length - 1][0]} ${P(rata[rata.length - 1][1])}` : ''}`);

        // 2) Beli kuat (sinyal tidak ditahan = 4 faktor lengkap)
        const kuat = baris.filter((b) => b.skor?.semua?.label === 'Beli kuat' && !b.skor.semua.asli).sort((a, b) => b.skor.semua.skor - a.skor.semua.skor).slice(0, 5);
        L.push('', '🟢 Beli kuat (4 faktor lengkap)');
        if (!kuat.length) L.push('Tidak ada saham Beli kuat dengan keempat faktor lengkap hari ini.');
        for (const b of kuat) {
            const k = this.src.kronos(b.s);
            const alasan = (b.skor.semua.alasan || [])[0];
            L.push(`• ${b.s} ${$(b.harga)} (${P(b.chg1d)}) · skor ${Math.round((b.skor.semua.skor + 1) * 50)}/100${k ? ` · Kronos R:R ${k.rr ?? '–'}, harapan ${P(k.harapan)}` : ''}${alasan ? `\n  ${alasan}` : ''}`);
        }

        // 3) Pantul
        const URUT: Record<string, number> = { balik: 0, zona: 1, pantau: 2 };
        const pantul = baris.filter((b) => b.diskon && b.diskon.tahap !== 'pantau').sort((a, b) => URUT[a.diskon.tahap] - URUT[b.diskon.tahap] || (b.skor?.fundamental?.skor ?? 0) - (a.skor?.fundamental?.skor ?? 0)).slice(0, 5);
        L.push('', '🔄 Pantul (peluang balik naik)');
        if (!pantul.length) L.push('Belum ada saham di tahap Zona beli / Mulai berbalik.');
        for (const b of pantul) L.push(`• ${b.s} ${$(b.harga)} · ${b.diskon.tahap === 'balik' ? 'Mulai berbalik' : 'Zona beli'} · ${b.diskon.jenis === 'koreksi' ? 'koreksi di tren naik' : 'diskon dalam'} · ${(b.diskon.alasan || [])[0] || ''}`);

        // 4) Watchlist & portofolio
        const { watch, pegang } = this.src.simbolPantau();
        const milik = [...new Set([...pegang, ...watch])];
        const gerak = milik.map((s) => cari.get(s)).filter((b) => b && Math.abs(b.chg1d) >= 3).sort((a, b) => Math.abs(b.chg1d) - Math.abs(a.chg1d));
        const untung = milik.map((s) => cari.get(s)).filter((b) => b?.ambilUntung && b.ambilUntung.tahap !== 'pantau');
        const lemah = pegang.map((s) => cari.get(s)).filter((b) => b?.skor?.semua?.label === 'Jual kuat');
        L.push('', '👀 Watchlist & portofolio');
        if (!gerak.length && !untung.length && !lemah.length) L.push(milik.length ? 'Tidak ada gerakan besar (±3%) atau tanda khusus.' : 'Watchlist masih kosong.');
        for (const b of gerak.slice(0, 6)) L.push(`• ${b.s} ${P(b.chg1d)} ke ${$(b.harga)}${pegang.includes(b.s) ? ' (Bapak pegang)' : ''}`);
        for (const b of untung) L.push(`• ${b.s}: tanda Ambil untung sebagian (${(b.ambilUntung.alasan || [])[0] || 'jenuh beli'})`);
        for (const b of lemah) L.push(`• ${b.s} (Bapak pegang): sinyal Jual kuat — cek ulang alasan memegangnya`);

        // 5) Acara pekan ini
        const laba = await this.src.laba().catch(() => new Map<string, { tgl: string; waktu: string }>());
        const penting = [...new Set([...kuat.map((b) => b.s), ...pantul.map((b) => b.s), ...milik])];
        const lb = penting.map((s) => ({ s, l: laba.get(s) })).filter((x) => x.l && hariLagi(x.l.tgl) >= 0 && hariLagi(x.l.tgl) <= 7).sort((a, b) => a.l!.tgl.localeCompare(b.l!.tgl));
        const mk = makroMendatang(7);
        L.push('', '📅 Acara pekan ini');
        if (!lb.length && !mk.length) L.push('Tidak ada laporan laba saham pantauan atau acara besar pasar 7 hari ke depan.');
        for (const a of mk) L.push(`• ${tglId(a.tgl)}: ${a.judul}, ${a.jamWib}${a.catatan ? ` — ${a.catatan}` : ''}`);
        for (const x of lb) L.push(`• ${tglId(x.l!.tgl)}: laporan laba ${x.s}${x.l!.waktu ? ` (${x.l!.waktu})` : ''}`);
        if (lb.length || mk.length) L.push('Di sekitar acara ini harga bisa bergerak liar — pertimbangkan ukuran posisi.');

        L.push('', 'Prediksi statistik dari data kantor, bukan saran beli/jual.');
        return L.join('\n');
    }
}
