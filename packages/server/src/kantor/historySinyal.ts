/**
 * History sinyal: setiap strategi BELI yang pernah dikeluarkan kantor (dari arsip sinyal harian), lengkap dengan hasilnya.
 * Aturan:
 *  - Strategi baru lahir saat label (s, gaya H) menjadi "Beli kuat"/"Beli" dan tidak ada strategi (s, H) yang masih berjalan.
 *  - Masuk = harga penutupan hari sinyal. Target & stop = yang tercatat di sinyal hari itu.
 *  - Dicek hari demi hari memakai harga TERTINGGI/TERENDAH harian: tertinggi ≥ target → "Kena target" (tetap dihitung untung walau sesudahnya turun);
 *    terendah ≤ stop → "Kena stop". Kalau dua-duanya di hari yang sama → dianggap stop (konservatif).
 *  - Belum kena apa-apa dalam H hari bursa → "Berjalan" (floating, pakai harga sekarang). Lewat H hari → "Lewat durasi": hasil dikunci di harga penutupan hari ke-H.
 */
import fs from 'fs';
import path from 'path';
import type { ArsipSinyal } from './arsipSinyal';

export type StatusH = 'target' | 'stop' | 'berjalan' | 'durasi';
export type Profil = 'K' | 'M' | 'A';
export interface Strategi {
    id: string; s: string; H: number; profil: Profil; tgl: string; label: string; skor: number; masuk: number; target: number | null; stop: number | null;
    status: StatusH; tglSelesai: string | null; keluar: number; pct: number; sekarang: number | null; pctSekarang: number | null; hari: number; tertinggi: number; terendah: number; sumberHarga: 'ohlc' | 'tutup'; targetDihitung?: boolean;
}
export interface Hl { t: string; h: number; l: number; c: number }
type L6 = [number, string, number | null, number | null, (number | null)?, (number | null)?];
const GAYA = [1, 5, 20, 60];
const PROFIL: Array<[Profil, number]> = [['K', 0.3], ['M', 0.5], ['A', 0.72]];

/** Target per profil dari sejarah harga sampai hari sinyal (rumus yang sama dengan proyeksi kantor): kuantil kenaikan tertinggi dalam H hari. */
function targetDariSejarah(bar: Hl[], tgl: string, H: number, p: number, masuk: number): number | null {
    const lalu = bar.filter((x) => x.t <= tgl); const n = lalu.length;
    const ups: number[] = [];
    for (let i = Math.max(0, n - 1 - 250); i < n - H; i++) { let mx = -Infinity; for (let k = i + 1; k <= i + H; k++) mx = Math.max(mx, lalu[k].h); ups.push(mx / lalu[i].c - 1); }
    if (ups.length < 60) return null;
    ups.sort((a, b) => a - b);
    const g = Math.max(0.005, ups[Math.min(ups.length - 1, Math.max(0, Math.floor(p * ups.length)))]);
    return masuk * (1 + g);
}

/** Bangun & nilai semua strategi untuk tiga profil target (Konservatif / Moderat / Agresif). `ohlc(s)` = batang harian (boleh kosong → pakai harga penutupan arsip). */
export function bangunHistory(arsip: ArsipSinyal, ohlc: (s: string) => Hl[] | null, hargaKini: (s: string) => number | null): Strategi[] {
    const hari = arsip.daftar();
    const per = new Map<string, Array<{ t: string; c: number; L: Record<string, L6> }>>();
    for (const t of hari) {
        const p = arsip.baca(t); if (!p) continue;
        for (const b of p.baris) { if (!b.c) continue; const a = per.get(b.s) || []; a.push({ t, c: b.c, L: b.L }); per.set(b.s, a); }
    }
    const hasil: Strategi[] = [];
    for (const [s, deret] of per) {
        const bar = ohlc(s);
        const pakaiOhlc = !!bar && bar.some((x) => x.t >= deret[0].t);
        const kini = hargaKini(s) ?? (pakaiOhlc ? bar![bar!.length - 1].c : deret[deret.length - 1].c);
        for (const H of GAYA) for (const [profil, q] of PROFIL) {
            let bebasSejak = ''; // strategi berikutnya hanya boleh lahir mulai tanggal ini
            for (const d of deret) {
                const L = d.L[String(H)]; if (!L) continue;
                if (bebasSejak && d.t < bebasSejak) continue;
                if (L[1] !== 'Beli kuat' && L[1] !== 'Beli') continue;
                // Target: Moderat selalu tercatat; Konservatif/Agresif tercatat di arsip baru, untuk arsip lama dihitung ulang dari sejarah harga sampai hari itu.
                let target: number | null = profil === 'M' ? L[2] : profil === 'K' ? L[4] ?? null : L[5] ?? null, dihitung = false;
                if (target == null && profil !== 'M' && bar) { target = targetDariSejarah(bar, d.t, H, q, d.c); dihitung = target != null; }
                if (target == null) continue;
                const st = nilai(s, H, profil, d.t, d.c, [L[0], L[1], target, L[3]], pakaiOhlc ? bar!.filter((x) => x.t > d.t) : deret.filter((x) => x.t > d.t).map((x) => ({ t: x.t, h: x.c, l: x.c, c: x.c })), kini, pakaiOhlc);
                if (dihitung) st.targetDihitung = true;
                hasil.push(st);
                if (st.status === 'berjalan') break; // masih terbuka → tidak ada strategi baru untuk (s, H, profil)
                bebasSejak = st.tglSelesai || d.t;
            }
        }
    }
    return hasil;
}

function nilai(s: string, H: number, profil: Profil, tgl: string, masuk: number, L: [number, string, number | null, number | null], sesudah: Hl[], kini: number, pakaiOhlc: boolean): Strategi {
    const [skor, label, target, stop] = L;
    let status: StatusH = 'berjalan', tglSelesai: string | null = null, keluar = kini, tinggi = masuk, rendah = masuk;
    const jendela = sesudah.slice(0, H);
    for (const b of jendela) {
        tinggi = Math.max(tinggi, b.h); rendah = Math.min(rendah, b.l);
        const kenaStop = stop != null && b.l <= stop, kenaTarget = target != null && b.h >= target;
        if (kenaStop) { status = 'stop'; tglSelesai = b.t; keluar = stop!; break; }
        if (kenaTarget) { status = 'target'; tglSelesai = b.t; keluar = target!; break; }
    }
    if (status === 'berjalan' && sesudah.length >= H && H > 0) { const z = jendela[jendela.length - 1]; status = 'durasi'; tglSelesai = z.t; keluar = z.c; }
    const hariJalan = tglSelesai ? sesudah.findIndex((b) => b.t === tglSelesai) + 1 : sesudah.length;
    const r2 = (n: number) => +n.toFixed(2);
    return {
        id: `${s}-${H}-${profil}-${tgl}`, s, H, profil, tgl, label, skor: r2(skor), masuk: r2(masuk), target: target != null ? r2(target) : null, stop: stop != null ? r2(stop) : null,
        status, tglSelesai, keluar: r2(keluar), pct: r2((keluar / masuk - 1) * 100), sekarang: r2(kini), pctSekarang: r2((kini / masuk - 1) * 100), hari: hariJalan,
        tertinggi: r2(tinggi), terendah: r2(rendah), sumberHarga: pakaiOhlc ? 'ohlc' : 'tutup'
    };
}

/** Simpanan harga tertinggi/terendah harian per saham (diisi Dito tiap hari) + hasil terakhir. */
export class HistorySinyal {
    private fOhlc: string; private fHasil: string;
    ohlc: Record<string, { at: number; bar: Hl[] }> = {};
    data: { at: number; item: Strategi[] } = { at: 0, item: [] };
    constructor(dataDir: string) {
        this.fOhlc = path.join(dataDir, 'history-ohlc.json'); this.fHasil = path.join(dataDir, 'history-sinyal.json');
        try { this.ohlc = JSON.parse(fs.readFileSync(this.fOhlc, 'utf8')); } catch { /* kosong */ }
        try { this.data = JSON.parse(fs.readFileSync(this.fHasil, 'utf8')); } catch { /* kosong */ }
    }
    simbolArsip(arsip: ArsipSinyal) { const set = new Set<string>(); for (const t of arsip.daftar()) for (const b of arsip.baca(t)?.baris || []) set.add(b.s); return [...set]; }
    simpanOhlc(s: string, bar: Hl[], dari: string) { const awal = new Date(Date.parse(`${dari}T00:00:00Z`) - 400 * 86400_000).toISOString().slice(0, 10); this.ohlc[s] = { at: Date.now(), bar: bar.filter((b) => b.t >= awal) }; }
    tulisOhlc() { fs.writeFileSync(this.fOhlc, JSON.stringify(this.ohlc)); }
    hitung(arsip: ArsipSinyal, hargaKini: (s: string) => number | null) {
        this.data = { at: Date.now(), item: bangunHistory(arsip, (s) => this.ohlc[s]?.bar || null, hargaKini) };
        fs.writeFileSync(this.fHasil, JSON.stringify(this.data));
        return this.data;
    }
    /** Daftar berhalaman + ringkasan. */
    daftar(q: { hal: number; n: number; H: number | null; profil: Profil; dari: string | null; sampai: string | null; status: StatusH | null; urut: 'terbaru' | 'cuan' | 'rugi'; q: string }) {
        let it = this.data.item.filter((x) => (x.profil || 'M') === q.profil && (!q.H || x.H === q.H) && (!q.dari || x.tgl >= q.dari) && (!q.sampai || x.tgl <= q.sampai) && (!q.q || x.s.includes(q.q.toUpperCase())));
        const ringkas = (a: Strategi[]) => {
            const selesai = a.filter((x) => x.status !== 'berjalan');
            return {
                total: a.length, target: a.filter((x) => x.status === 'target').length, stop: a.filter((x) => x.status === 'stop').length, durasi: a.filter((x) => x.status === 'durasi').length, berjalan: a.length - selesai.length,
                menang: selesai.length ? +((selesai.filter((x) => x.pct > 0).length / selesai.length) * 100).toFixed(1) : null,
                rata: a.length ? +(a.reduce((s, x) => s + x.pct, 0) / a.length).toFixed(2) : null
            };
        };
        const sum = ringkas(it);
        if (q.status) it = it.filter((x) => x.status === q.status);
        it = [...it].sort(q.urut === 'cuan' ? (a, b) => b.pct - a.pct : q.urut === 'rugi' ? (a, b) => a.pct - b.pct : (a, b) => b.tgl.localeCompare(a.tgl) || b.skor - a.skor);
        const n = Math.max(5, Math.min(100, q.n || 20)), halaman = Math.max(1, Math.ceil(it.length / n)), hal = Math.max(1, Math.min(halaman, q.hal || 1));
        return { at: this.data.at, ringkas: sum, total: it.length, hal, halaman, n, item: it.slice((hal - 1) * n, hal * n) };
    }
}
