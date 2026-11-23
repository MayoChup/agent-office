/**
 * Perintah jadwal lewat chat — dibaca kantor sendiri (bukan AI), lalu mengubah pengaturan YANG SAMA dengan tombol di tampilan:
 *   "laporan pagi jam 06.30" · "laporan pagi cuma Selasa sama Jumat" · "matikan laporan pagi"
 *   "folder AI & chip laporan jam 20.00 tiap hari" · "pantau watchlist utama Senin–Jumat jam 19.30" · "jadwal laporan apa aja?"
 * Kalau bukan perintah jadwal → null (pesan diteruskan ke AI seperti biasa).
 */
export interface TargetJadwal { jenis: 'pagi' | 'folder'; id?: string; nama: string }
export interface Ubahan { nyala?: boolean; jam?: string; hari?: number[] }
export type HasilPerintah =
    | { aksi: 'daftar' }
    | { aksi: 'ubah'; target: TargetJadwal; ubah: Ubahan }
    | { aksi: 'tanya'; target: TargetJadwal; pesan: string };

const HARI: Array<[RegExp, number]> = [
    [/\b(senin|sen)\b/, 1], [/\b(selasa|sel)\b/, 2], [/\b(rabu|rab)\b/, 3], [/\b(kamis|kam)\b/, 4],
    [/\b(jumat|jum'?at|jum)\b/, 5], [/\b(sabtu|sab)\b/, 6], [/\b(minggu|ahad|min)\b/, 0]
];
const URUT = [1, 2, 3, 4, 5, 6, 0];
export const NAMA_HARI: Record<number, string> = { 0: 'Min', 1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab' };

function hariDari(t: string): number[] | undefined {
    if (/\b(tiap|setiap|semua)\s+hari\b|\bsetiap hari\b|\bdaily\b/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
    if (/\bhari kerja\b|\bweekday/.test(t)) return [1, 2, 3, 4, 5];
    if (/\b(akhir pekan|weekend)\b/.test(t)) return [0, 6];
    // Rentang "selasa sampai jumat" / "sel-jum" / "senin–jumat"
    const kata = '(senin|sen|selasa|sel|rabu|rab|kamis|kam|jumat|jum\'?at|jum|sabtu|sab|minggu|ahad|min)';
    const r = t.match(new RegExp(`\\b${kata}\\s*(?:-|–|—|sampai|sampe|s\\.?d\\.?|hingga|ke)\\s*${kata}\\b`));
    const nomor = (x: string) => HARI.find(([re]) => re.test(x))![1];
    if (r) {
        const a = URUT.indexOf(nomor(r[1])), b = URUT.indexOf(nomor(r[2]));
        if (a >= 0 && b >= 0) return a <= b ? URUT.slice(a, b + 1) : [...URUT.slice(a), ...URUT.slice(0, b + 1)];
    }
    const ada = HARI.filter(([re]) => re.test(t)).map(([, d]) => d);
    return ada.length ? [...new Set(ada)].sort((x, y) => URUT.indexOf(x) - URUT.indexOf(y)) : undefined;
}
function jamDari(t: string): string | undefined {
    const m = t.match(/\b(?:jam|pukul|pkl\.?)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(pagi|siang|sore|malam)?/);
    if (!m) return undefined;
    let h = Number(m[1]); const mnt = m[2] ? Number(m[2]) : 0;
    if ((m[3] === 'sore' || m[3] === 'malam') && h < 12) h += 12;
    if (m[3] === 'siang' && h < 11) h += 12;
    if (h > 23 || mnt > 59) return undefined;
    return `${String(h).padStart(2, '0')}:${String(mnt).padStart(2, '0')}`;
}

export function bacaPerintah(teks: string, folder: Array<{ id: string; nama: string }>): HasilPerintah | null {
    const t = ' ' + teks.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
    if (t.length > 220) return null; // pesan panjang = obrolan biasa
    if (/\b(jadwal|daftar)\s+(laporan|pantau\w*)\b.*\b(apa|mana|aja|saja|semua)\b|\bjadwal laporan\s*\??\s*$/.test(t.trim()) || /^(apa aja|apa saja) jadwal laporan/.test(t.trim())) return { aksi: 'daftar' };

    let target: TargetJadwal | null = null;
    if (/\blaporan (sinyal )?pagi\b/.test(t)) target = { jenis: 'pagi', nama: 'Laporan sinyal pagi' };
    else if (/\b(folder|watchlist|pantau\w*)\b/.test(t)) {
        if (/\b(watchlist|folder) utama\b|\butama\b/.test(t)) target = { jenis: 'folder', id: 'utama', nama: 'Watchlist Utama' };
        else {
            const f = [...folder].sort((a, b) => b.nama.length - a.nama.length).find((x) => x.nama && t.includes(` ${x.nama.toLowerCase()}`));
            if (f) target = { jenis: 'folder', id: f.id, nama: `folder ${f.nama}` };
        }
    }
    if (!target) return null;
    // Keluhan/pertanyaan ("laporan pagi tadi jam 7 kok ga masuk?") bukan perintah — kecuali ada kata kerja ubah yang jelas.
    const kerja = /\b(ubah|ganti|pindah\w*|set|atur|jadikan|jadi|matikan|nyalakan|hidupkan|aktifkan|stop|hentikan|cuma|hanya|tiap|setiap)\b/.test(t);
    if (!kerja && /\b(kok|kenapa|mengapa|kapan|belum|tadi|kemarin|ga|gak|nggak|tidak|apa)\b|\?/.test(t)) return null;
    // Harus ada kata kerja jadwal; kalau tidak, ini kemungkinan pertanyaan biasa tentang isi laporan.
    const ubah: Ubahan = {};
    if (/\b(matikan|mati|stop|hentikan|nonaktif\w*|off|jangan kirim)\b/.test(t)) ubah.nyala = false;
    else if (/\b(nyalakan|nyala|hidupkan|aktifkan|aktif|on|lanjutkan)\b/.test(t)) ubah.nyala = true;
    const jam = jamDari(t); if (jam) ubah.jam = jam;
    const hari = hariDari(t); if (hari) ubah.hari = hari;
    if (!Object.keys(ubah).length) {
        if (/\b(ubah|ganti|atur|pindah\w*|set|jadwal\w*)\b/.test(t)) return { aksi: 'tanya', target, pesan: `Mau diubah apanya untuk ${target.nama}? Contoh: "${target.jenis === 'pagi' ? 'laporan pagi' : target.nama} jam 06.30, Selasa sampai Jumat" atau "matikan ${target.jenis === 'pagi' ? 'laporan pagi' : target.nama}".` };
        return null;
    }
    // Menyebut jam/hari = otomatis menyala (kecuali diminta mati).
    if (ubah.nyala === undefined && (ubah.jam || ubah.hari)) ubah.nyala = true;
    return { aksi: 'ubah', target, ubah };
}

export const ringkasHari = (h: number[]) => {
    const s = [...h].sort((a, b) => URUT.indexOf(a) - URUT.indexOf(b));
    if (s.length === 7) return 'tiap hari';
    if (s.join() === '1,2,3,4,5') return 'Sen–Jum';
    if (s.join() === '2,3,4,5,6') return 'Sel–Sab';
    return s.map((d) => NAMA_HARI[d]).join(', ');
};
