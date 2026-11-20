/**
 * Pusat kabar: semua pemberitahuan kantor & pengingat AI masuk ke CHAT APLIKASI (thread AI yang bersangkutan → notifikasi HP),
 * bukan ke Telegram. Telegram hanya salinan kalau Pak Rico menyalakannya (data/saluran-kabar.json, bawaan: mati).
 *
 *  - kabarAntre(): dipakai proses terpisah (pembaca WhatsApp, perintah CLI) → baris JSON di data/kabar-antre.jsonl,
 *    diteruskan proses utama tiap 5 detik.
 *  - pengamatCron(): pekerjaan terjadwal Hermes (pengingat, Reels, laporan) dengan deliver "local" menulis hasilnya ke
 *    cron/output/<job>/<waktu>.md; berkas baru diteruskan ke chat AI pemilik pekerjaan itu.
 */
import fs from 'fs';
import path from 'path';

export interface Saluran { telegram: boolean }
export const fileSaluran = (dataDir: string) => path.join(dataDir, 'saluran-kabar.json');
export function bacaSaluran(dataDir: string): Saluran { try { return { telegram: false, ...JSON.parse(fs.readFileSync(fileSaluran(dataDir), 'utf8')) }; } catch { return { telegram: false }; } }
export function simpanSaluran(dataDir: string, s: Partial<Saluran>) { const b = { ...bacaSaluran(dataDir), ...s }; fs.writeFileSync(fileSaluran(dataDir), JSON.stringify(b)); return b; }

/* ── Antrean untuk proses lain ── */
const fileAntre = (dataDir: string) => path.join(dataDir, 'kabar-antre.jsonl');
export function kabarAntre(dataDir: string, ai?: string) {
    return async (teks: string) => { try { fs.appendFileSync(fileAntre(dataDir), JSON.stringify({ at: Date.now(), ai: ai || null, teks: String(teks).slice(0, 6000) }) + '\n'); } catch { /* */ } };
}
export function ambilAntre(dataDir: string): Array<{ at: number; ai: string | null; teks: string }> {
    const f = fileAntre(dataDir), tmp = `${f}.proses`;
    try { fs.renameSync(f, tmp); } catch { return []; }
    try { return fs.readFileSync(tmp, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
    finally { try { fs.unlinkSync(tmp); } catch { /* */ } }
}

/* ── Hasil pekerjaan terjadwal Hermes ── */
interface CatatanCron { mulai: number; terkirim: Record<string, number> }
/** Isi jawaban dari dokumen hasil cron (bagian "Response" kalau ada; tanpa kepala metadata). */
export function isiCron(md: string): string {
    const t = md.replace(/\r/g, '');
    const m = t.match(/^#{1,3}\s*(Response|Output|Result|Jawaban|Hasil)\s*$/im);
    let isi = m ? t.slice((m.index || 0) + m[0].length) : t.replace(/^---\n[\s\S]*?\n---\n/, '');
    if (!m) isi = isi.replace(/^#\s*Cron[^\n]*\n/i, '').replace(/^\*\*(Job|Schedule|Run|Time|Waktu)[^\n]*\n/gim, '');
    return isi.replace(/\n{3,}/g, '\n\n').trim();
}
export function pengamatCron(o: { hermesHome: string; dataDir: string; kirim: (aiId: string, judul: string, isi: string) => void }) {
    const fCatat = path.join(o.dataDir, 'cron-terkirim.json');
    let c: CatatanCron;
    try { c = JSON.parse(fs.readFileSync(fCatat, 'utf8')); } catch { c = { mulai: Date.now(), terkirim: {} }; }
    const profil = () => {
        const out: Array<{ ai: string; dir: string }> = [{ ai: 'default', dir: o.hermesHome }];
        try { for (const p of fs.readdirSync(path.join(o.hermesHome, 'profiles'))) out.push({ ai: p, dir: path.join(o.hermesHome, 'profiles', p) }); } catch { /* */ }
        return out;
    };
    const namaJob = (dir: string) => {
        const m = new Map<string, string>();
        try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'cron', 'jobs.json'), 'utf8')); for (const x of (Array.isArray(j) ? j : j.jobs || [])) if (x?.id) m.set(String(x.id), String(x.name || x.prompt || 'Pekerjaan terjadwal').slice(0, 80)); } catch { /* */ }
        return m;
    };
    const putar = () => {
        let ubah = false;
        for (const p of profil()) {
            const out = path.join(p.dir, 'cron', 'output');
            let jobs: string[] = []; try { jobs = fs.readdirSync(out); } catch { continue; }
            const nama = namaJob(p.dir);
            for (const job of jobs) {
                let files: string[] = []; try { files = fs.readdirSync(path.join(out, job)).filter((f) => f.endsWith('.md')); } catch { continue; }
                for (const f of files) {
                    const full = path.join(out, job, f);
                    if (c.terkirim[full]) continue;
                    let st: fs.Stats; try { st = fs.statSync(full); } catch { continue; }
                    // Hasil lama (sebelum pengamat ini aktif) ditandai saja, tidak dikirim ulang. Berkas yang masih ditulis ditunggu 20 detik.
                    if (st.mtimeMs < c.mulai) { c.terkirim[full] = st.mtimeMs; ubah = true; continue; }
                    if (Date.now() - st.mtimeMs < 20_000) continue;
                    c.terkirim[full] = Date.now(); ubah = true;
                    let isi = ''; try { isi = isiCron(fs.readFileSync(full, 'utf8')); } catch { continue; }
                    if (!isi || /\[SILENT\]/.test(isi)) continue;
                    try { o.kirim(p.ai, nama.get(job) || 'Pekerjaan terjadwal', isi.slice(0, 6000)); } catch (e: any) { console.warn('[Pusat kabar] cron:', e?.message || e); }
                }
            }
        }
        if (ubah) {
            // Buang catatan berkas yang sudah tidak ada (dibersihkan Hermes).
            for (const k of Object.keys(c.terkirim)) if (!fs.existsSync(k)) delete c.terkirim[k];
            try { fs.writeFileSync(fCatat, JSON.stringify(c)); } catch { /* */ }
        }
    };
    try { fs.writeFileSync(fCatat, JSON.stringify(c)); } catch { /* */ }
    setTimeout(putar, 15_000);
    setInterval(putar, 60_000).unref();
}
