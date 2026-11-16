/**
 * Simulasi Monte Carlo (10.000 jalur) — "mesin waktu" sederhana:
 * tiap jalur menyusun masa depan dari potongan pergerakan HISTORIS saham itu sendiri (bootstrap),
 * lalu dicatat apakah harga menyentuh harga masuk, target, atau stop lebih dulu.
 * Ini simulasi, bukan prediksi — tidak ada order yang dikirim.
 */
export interface Bar { h: number; l: number; c: number }      // relatif terhadap penutupan sebelumnya
export interface Profil { nama: string; masuk: number; target: number; stop: number; ket: string }
export interface HasilProfil extends Profil {
    pMasuk: number; pTarget: number; pStop: number; pTidak: number; rr: number; harapan: number; hariTarget: number | null;
}

function acak(seed: number) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };

/** Pergerakan relatif per langkah (hari atau batang menit) dari data historis. */
export function langkahDari(h: number[], l: number[], c: number[]): Bar[] {
    const out: Bar[] = [];
    for (let i = 1; i < c.length; i++) { const p = c[i - 1]; if (p > 0 && h[i] >= l[i]) out.push({ h: h[i] / p, l: l[i] / p, c: c[i] / p }); }
    return out;
}

export function simulasi(harga: number, langkah: Bar[], N: number, opsi: { profil: Array<'konservatif' | 'moderat' | 'agresif'>; jalur?: number; atr?: number; satuan: 'hari' | 'batang' }) {
    if (langkah.length < 30) throw new Error('Data historis kurang untuk simulasi');
    const SIM = 10_000, rnd = acak(Math.round(harga * 1000) + N * 7919);
    // 1) Bangun 10.000 jalur (disimpan ringkas: maks/min berjalan & penutupan tiap langkah).
    const jalur = new Float64Array(SIM * N * 3); // [h,l,c] per langkah, nilai absolut
    const maksNaik: number[] = [], maksTurun: number[] = [];
    for (let s = 0; s < SIM; s++) {
        let p = harga, hi = harga, lo = harga;
        for (let t = 0; t < N; t++) {
            const b = langkah[Math.floor(rnd() * langkah.length)];
            const k = (s * N + t) * 3;
            jalur[k] = p * b.h; jalur[k + 1] = p * b.l; jalur[k + 2] = p * b.c;
            hi = Math.max(hi, jalur[k]); lo = Math.min(lo, jalur[k + 1]); p = jalur[k + 2];
        }
        maksNaik.push(hi / harga - 1); maksTurun.push(1 - lo / harga);
    }
    // 2) Profil: target dari sebaran kenaikan maksimum, stop dari sebaran penurunan maksimum, masuk konservatif = tunggu koreksi.
    const P: Record<string, Profil> = {
        konservatif: { nama: 'Konservatif', masuk: harga * (1 - q(maksTurun, 0.3) * 0.5), target: 0, stop: 0, ket: 'Tunggu koreksi kecil untuk masuk, target dekat, stop rapat.' },
        moderat: { nama: 'Moderat', masuk: harga, target: 0, stop: 0, ket: 'Masuk di harga sekarang, target & stop seimbang.' },
        agresif: { nama: 'Agresif', masuk: harga, target: 0, stop: 0, ket: 'Masuk sekarang, target jauh, stop lebih longgar.' }
    };
    P.konservatif.target = P.konservatif.masuk * (1 + Math.max(0.002, q(maksNaik, 0.4)));
    P.konservatif.stop = P.konservatif.masuk * (1 - Math.max(0.002, q(maksTurun, 0.45)));
    P.moderat.target = harga * (1 + Math.max(0.003, q(maksNaik, 0.55)));
    P.moderat.stop = harga * (1 - Math.max(0.003, q(maksTurun, 0.6)));
    P.agresif.target = harga * (1 + Math.max(0.005, q(maksNaik, 0.75)));
    P.agresif.stop = harga * (1 - Math.max(0.004, q(maksTurun, 0.75)));
    // 3) Hitung kejadian per profil.
    const hasil: HasilProfil[] = [];
    const contoh: Array<{ c: number[]; akhir: 'target' | 'stop' | 'tidak' }> = [];
    for (const id of opsi.profil) {
        const pr = P[id];
        let masuk = 0, tgt = 0, stp = 0, untung = 0; const hari: number[] = [];
        for (let s = 0; s < SIM; s++) {
            let aktif = id !== 'konservatif', akhir: 'target' | 'stop' | 'tidak' = 'tidak', lastC = harga;
            for (let t = 0; t < N; t++) {
                const k = (s * N + t) * 3, H = jalur[k], L = jalur[k + 1]; lastC = jalur[k + 2];
                let baruMasuk = false;
                if (!aktif) { if (L <= pr.masuk) { aktif = true; baruMasuk = true; } else continue; }
                // Kalau target & stop tersentuh di langkah yang sama, dianggap stop dulu (lebih hati-hati).
                if (L <= pr.stop) { akhir = 'stop'; break; }
                // Di langkah saat baru masuk, urutan tertinggi/terendah tidak diketahui → target belum dihitung.
                if (!baruMasuk && H >= pr.target) { akhir = 'target'; hari.push(t + 1); break; }
            }
            if (!aktif) continue;
            masuk++;
            if (akhir === 'target') { tgt++; untung += pr.target / pr.masuk - 1; }
            else if (akhir === 'stop') { stp++; untung += pr.stop / pr.masuk - 1; }
            else untung += lastC / pr.masuk - 1;
            if (id === 'moderat' && contoh.length < (opsi.jalur ?? 70) && s % 13 === 0) {
                const cs: number[] = [harga];
                for (let t = 0; t < N; t++) cs.push(+jalur[(s * N + t) * 3 + 2].toFixed(4));
                contoh.push({ c: cs, akhir });
            }
        }
        const pm = masuk / SIM;
        hasil.push({
            ...pr, masuk: +pr.masuk.toFixed(2), target: +pr.target.toFixed(2), stop: +pr.stop.toFixed(2),
            pMasuk: Math.round(pm * 100), pTarget: masuk ? Math.round((tgt / masuk) * 100) : 0, pStop: masuk ? Math.round((stp / masuk) * 100) : 0,
            pTidak: masuk ? Math.round(((masuk - tgt - stp) / masuk) * 100) : 0,
            rr: +((pr.target - pr.masuk) / Math.max(1e-9, pr.masuk - pr.stop)).toFixed(2),
            harapan: masuk ? +((untung / masuk) * 100).toFixed(2) : 0,
            hariTarget: hari.length ? q(hari, 0.5) : null
        });
    }
    return { simulasi: SIM, langkah: N, satuan: opsi.satuan, harga, profil: hasil, contoh };
}
