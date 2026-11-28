/**
 * Uji mundur (backtest) di thread terpisah, supaya server utama tetap lancar menjawab halaman lain
 * selama ±20–40 menit perhitungan ±500 saham. Status dikirim ke thread utama tiap detik.
 */
import { parentPort, workerData } from 'worker_threads';
import { ujiMundur, type StatusUji } from './kantor/ujimundur';

const st: StatusUji = { jalan: true, progres: 'memulai…', mulai: Date.now(), selesai: 0, galat: '' };
const kirim = (akhir?: { ok: boolean; galat?: string }) => parentPort?.postMessage({ st: { ...st }, akhir });
const t = setInterval(() => kirim(), 1000);
ujiMundur(workerData.daftar as string[], workerData.file as string, st, undefined, undefined, workerData.kelompok || {})
    .then(() => { clearInterval(t); kirim({ ok: true }); })
    .catch((e: any) => { clearInterval(t); kirim({ ok: false, galat: String(e?.message || e) }); });
