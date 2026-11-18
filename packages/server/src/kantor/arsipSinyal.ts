/**
 * Arsip sinyal harian: setiap sesi bursa, sinyal LENGKAP yang dikeluarkan kantor (teknikal + fundamental + berita + whales → label gabungan,
 * harga, target & stop, kepatuhan preset guru) disimpan ke data/arsip-sinyal/YYYY-MM-DD.json. Tidak pernah dibuang.
 * Dari arsip ini dibuat "simulasi dari sinyal tercatat": memutar ulang sinyal yang benar-benar dikirim kantor, tanpa menghitung ulang apa pun.
 */
import fs from 'fs';
import path from 'path';

export interface Potret { tgl: string; at: number; spy: number | null; baris: Array<{ s: string; c: number; L: Record<string, [number, string, number | null, number | null]>; g: Record<string, number> }> }
export interface OpsiArsip { H: number; guru: string | null; sinyal: string[]; dari: string | null; modal: number; porsi: number; beliPerHari: number; maksPosisi: number; keluar: { target: boolean; stop: boolean; jual: boolean }; biaya: number }
export interface Aksi { t: string; jenis: 'beli' | 'jual'; s: string; harga: number; nilai: number; pct?: number; untung?: number; sebab?: string; label?: string }
export interface HasilArsip {
    opsi: OpsiArsip; dari: string; sampai: string; hari: number; akhir: number; pct: number; spyPct: number | null; maxDD: number; trade: number; menang: number; rataTrade: number; untungTotal: number;
    kurva: Array<{ t: string; nilai: number; kas: number; spy: number | null }>; aksi: Aksi[]; terbuka: Array<{ s: string; masuk: string; hMasuk: number; harga: number; pct: number }>; catatan: string[];
}

export class ArsipSinyal {
    private dir: string;
    constructor(dataDir: string) { this.dir = path.join(dataDir, 'arsip-sinyal'); fs.mkdirSync(this.dir, { recursive: true }); }
    daftar() { try { return fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort(); } catch { return []; } }
    ada(tgl: string) { return fs.existsSync(path.join(this.dir, `${tgl}.json`)); }
    simpan(p: Potret) { if (!/^\d{4}-\d{2}-\d{2}$/.test(p.tgl) || !p.baris.length) return false; fs.writeFileSync(path.join(this.dir, `${p.tgl}.json`), JSON.stringify(p)); return true; }
    baca(tgl: string): Potret | null { try { return JSON.parse(fs.readFileSync(path.join(this.dir, `${tgl}.json`), 'utf8')); } catch { return null; } }
    info() { const d = this.daftar(); return { hari: d.length, dari: d[0] || null, sampai: d[d.length - 1] || null }; }

    /** Putar ulang sinyal tercatat: tiap hari beli maks N saham (skor tertinggi), alokasi % dari nilai portofolio saat itu (efek bola salju). */
    simulasi(o: OpsiArsip): HasilArsip {
        const tgl = this.daftar().filter((t) => !o.dari || t >= o.dari);
        if (tgl.length < 2) throw new Error(`Arsip sinyal baru ${tgl.length} hari. Simulasi butuh minimal 2 hari bursa tercatat — arsip bertambah otomatis tiap sesi.`);
        const H = String(o.H);
        let kas = o.modal;
        const buka = new Map<string, { s: string; masuk: string; hMasuk: number; lembar: number; hari: number; target: number | null; stop: number | null; label: string; biayaMasuk: number }>();
        const aksi: Aksi[] = []; const kurva: HasilArsip['kurva'] = [];
        let spy0: number | null = null, menang = 0, trade = 0, jumlahPct = 0, untungTotal = 0;
        let hargaTerakhir = new Map<string, number>();
        const jual = (s: string, t: string, harga: number, sebab: string) => {
            const p = buka.get(s)!; const bersih = p.lembar * harga * (1 - o.biaya); const modalPos = p.biayaMasuk;
            kas += bersih; buka.delete(s);
            const pct = (bersih / modalPos - 1) * 100, untung = bersih - modalPos;
            trade++; jumlahPct += pct; untungTotal += untung; if (untung > 0) menang++;
            aksi.push({ t, jenis: 'jual', s, harga: +harga.toFixed(2), nilai: +bersih.toFixed(2), pct: +pct.toFixed(2), untung: +untung.toFixed(2), sebab, label: p.label });
        };
        for (let i = 0; i < tgl.length; i++) {
            const t = tgl[i]; const p = this.baca(t); if (!p) continue;
            const per = new Map(p.baris.map((b) => [b.s, b]));
            hargaTerakhir = new Map([...hargaTerakhir, ...p.baris.map((b) => [b.s, b.c] as [string, number])]);
            if (spy0 == null && p.spy) spy0 = p.spy;
            // 1) Cek posisi terbuka: target, stop, sinyal jual, atau masa pegang habis.
            for (const pos of [...buka.values()]) {
                const b = per.get(pos.s); if (!b) continue;
                pos.hari++;
                const lbl = b.L[H]?.[1];
                if (o.keluar.target && pos.target && b.c >= pos.target) jual(pos.s, t, b.c, 'kena target');
                else if (o.keluar.stop && pos.stop && b.c <= pos.stop) jual(pos.s, t, b.c, 'kena stop');
                else if (o.keluar.jual && (lbl === 'Jual' || lbl === 'Jual kuat')) jual(pos.s, t, b.c, `sinyal ${lbl}`);
                else if (pos.hari >= o.H) jual(pos.s, t, b.c, 'masa pegang habis');
            }
            // 2) Beli: sinyal hari ini yang cocok, skor tertinggi dulu, maks N per hari.
            const nilaiNow = () => kas + [...buka.values()].reduce((s, q) => s + q.lembar * (hargaTerakhir.get(q.s) ?? q.hMasuk), 0);
            if (i < tgl.length - 1) {
                const calon = p.baris.filter((b) => b.L[H] && o.sinyal.includes(b.L[H][1]) && !buka.has(b.s) && (!o.guru || (b.g[o.guru] ?? 0) >= 75)).sort((a, b) => b.L[H][0] - a.L[H][0]);
                let dibeli = 0;
                for (const b of calon) {
                    if (dibeli >= o.beliPerHari || buka.size >= o.maksPosisi) break;
                    const dana = Math.min(kas, nilaiNow() * o.porsi);
                    if (dana < 20 || !b.c) continue;
                    const lembar = dana / (b.c * (1 + o.biaya));
                    kas -= dana; dibeli++;
                    buka.set(b.s, { s: b.s, masuk: t, hMasuk: b.c, lembar, hari: 0, target: b.L[H][2], stop: b.L[H][3], label: b.L[H][1], biayaMasuk: dana });
                    aksi.push({ t, jenis: 'beli', s: b.s, harga: b.c, nilai: +dana.toFixed(2), label: b.L[H][1] });
                }
            }
            kurva.push({ t, nilai: +nilaiNow().toFixed(2), kas: +kas.toFixed(2), spy: spy0 && p.spy ? +(o.modal * (p.spy / spy0)).toFixed(2) : null });
        }
        const akhir = kurva[kurva.length - 1]?.nilai ?? o.modal;
        let puncak = -Infinity, maxDD = 0; for (const k of kurva) { puncak = Math.max(puncak, k.nilai); maxDD = Math.min(maxDD, k.nilai / puncak - 1); }
        const spyAkhir = kurva[kurva.length - 1]?.spy;
        return {
            opsi: o, dari: kurva[0]?.t || tgl[0], sampai: kurva[kurva.length - 1]?.t || tgl[tgl.length - 1], hari: kurva.length,
            akhir, pct: +((akhir / o.modal - 1) * 100).toFixed(2), spyPct: spyAkhir != null ? +((spyAkhir / o.modal - 1) * 100).toFixed(2) : null, maxDD: +(maxDD * 100).toFixed(2),
            trade, menang: trade ? +((menang / trade) * 100).toFixed(1) : 0, rataTrade: trade ? +(jumlahPct / trade).toFixed(2) : 0, untungTotal: +untungTotal.toFixed(2),
            kurva, aksi, terbuka: [...buka.values()].map((q) => { const h = hargaTerakhir.get(q.s) ?? q.hMasuk; return { s: q.s, masuk: q.masuk, hMasuk: q.hMasuk, harga: h, pct: +((h / q.hMasuk - 1) * 100).toFixed(2) }; }),
            catatan: [
                'Memakai sinyal yang benar-benar dikeluarkan kantor tiap sesi (teknikal + fundamental + berita + whales), tanpa dihitung ulang.',
                'Beli & jual memakai harga penutupan hari sinyal tercatat; target/stop dicek terhadap harga penutupan harian (bukan harga tertinggi/terendah).',
                `Biaya transaksi ${(o.biaya * 100).toFixed(2)}% per sisi. Untung dari penjualan langsung diputar lagi (efek bola salju).`,
                'Posisi yang belum terjual dihitung dengan harga terakhir. Bukan saran keuangan.'
            ]
        };
    }
}
