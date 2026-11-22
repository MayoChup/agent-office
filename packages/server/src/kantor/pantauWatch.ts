import fs from 'fs';
import path from 'path';

/**
 * Pantauan AI per folder watchlist (termasuk Watchlist Utama), dengan jadwal sendiri (hari + jam WIB).
 * Laporan mendahulukan "yang berubah sejak laporan lalu" (sinyal, tahap diskon, berita baru, whales/orang dalam,
 * fundamental, laporan keuangan ≤7 hari), lalu satu baris per saham. Tanpa perubahan → satu baris saja, bukan spam.
 * Data dari penyaring kantor (gratis). Ringkasan pembuka ditulis AI gratis bila tersedia. Bukan saran beli/jual.
 */
export interface IsiPantau { sinyal: boolean; berita: boolean; whales: boolean; fundamental: boolean; kronos: boolean }
export interface AturPantau { nyala: boolean; hari: number[]; jam: string; isi: IsiPantau }
interface Snap { label?: string; skor?: number; tahap?: string | null; fundL?: string; fundS?: number; whL?: string; orangN?: number; orangNet?: number; judul?: string[]; laba?: string | null }
interface St { atur: Record<string, AturPantau>; snap: Record<string, Record<string, Snap>>; terkirim: Record<string, string>; laporanAt: Record<string, number> }
export interface FolderPantau { id: string; nama: string; simbol: string[] }

const BAWAAN = (utama: boolean): AturPantau => ({ nyala: utama, hari: [1, 2, 3, 4, 5], jam: '19:30', isi: { sinyal: true, berita: true, whales: true, fundamental: true, kronos: false } });
const wib = () => new Date(Date.now() + 7 * 3600_000);
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const bar = (s?: number) => (s == null ? '–' : `${Math.round((s + 1) * 50)}/100`);
const TAHAP: Record<string, string> = { pantau: 'Pantau', zona: 'Zona beli', balik: 'Mulai berbalik' };
const URUT = ['pantau', 'zona', 'balik'];
const usd = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : `$${Math.round(n).toLocaleString('id-ID')}`);
const tglId = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

export class PantauWatch {
    private file: string; private st: St; private sibuk = new Set<string>();
    private laba: { at: number; m: Map<string, { tgl: string; waktu: string }> } = { at: 0, m: new Map() };
    constructor(dataDir: string, private o: {
        folders: () => FolderPantau[];
        detail: (s: string) => any | null;
        kronos: (s: string) => { rr: number; harapan: number; id: string } | null;
        kalender: () => Promise<Map<string, { tgl: string; waktu: string }>>;
        kirim: (teks: string) => Promise<void> | void;
        ringkas?: (data: string) => Promise<string | null>;
    }) {
        this.file = path.join(dataDir, 'pantau-watch.json');
        try { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.st = { atur: {}, snap: {}, terkirim: {}, laporanAt: {} }; }
        this.st.laporanAt ||= {};
        setInterval(() => this.cek().catch(() => {}), 60_000);
    }
    private simpan() { try { fs.writeFileSync(this.file, JSON.stringify(this.st)); } catch { /* */ } }
    atur(id: string): AturPantau { return this.st.atur[id] || BAWAAN(id === 'utama'); }
    semua() { return this.o.folders().map((f) => ({ id: f.id, nama: f.nama, n: f.simbol.length, atur: this.atur(f.id), terakhir: this.st.laporanAt[f.id] || 0 })); }
    ubah(id: string, b: Partial<AturPantau>): AturPantau {
        if (!this.o.folders().some((f) => f.id === id)) throw new Error('Folder tidak ada');
        const a = { ...this.atur(id) };
        if (b.nyala != null) a.nyala = !!b.nyala;
        if (Array.isArray(b.hari)) a.hari = Array.from(new Set(b.hari.map(Number).filter((x) => x >= 0 && x <= 6))).sort();
        if (b.jam != null) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.jam))) throw new Error('Jam harus HH:MM'); a.jam = String(b.jam); }
        if (b.isi) a.isi = { ...a.isi, ...Object.fromEntries(Object.entries(b.isi).filter(([k]) => k in a.isi).map(([k, v]) => [k, !!v])) } as IsiPantau;
        if (a.nyala && !a.hari.length) throw new Error('Pilih minimal satu hari');
        this.st.atur[id] = a; this.simpan(); return a;
    }

    /** Dicek tiap menit: kirim sekali per hari terjadwal, dalam 60 menit setelah jamnya. */
    private async cek() {
        const w = wib(), hari = w.toISOString().slice(0, 10), dow = w.getUTCDay(), menit = w.getUTCHours() * 60 + w.getUTCMinutes();
        for (const f of this.o.folders()) {
            const a = this.atur(f.id); if (!a.nyala || !a.hari.includes(dow) || this.st.terkirim[f.id] === hari) continue;
            const [hh, mm] = a.jam.split(':').map(Number), t = hh * 60 + mm;
            if (menit < t || menit > t + 60) continue;
            this.st.terkirim[f.id] = hari; this.simpan();
            try { await this.laporan(f.id); } catch (e: any) { console.warn('[Pantau watchlist]', f.nama, e?.message || e); }
        }
    }
    private async kalender() {
        if (Date.now() - this.laba.at < 12 * 3600_000) return this.laba.m;
        try { this.laba = { at: Date.now(), m: await this.o.kalender() }; } catch { this.laba.at = Date.now() - 11 * 3600_000; }
        return this.laba.m;
    }

    /** Susun & kirim laporan satu folder sekarang. Mengembalikan teksnya. */
    async laporan(id: string, kirim = true): Promise<string> {
        if (this.sibuk.has(id)) throw new Error('Laporan folder ini sedang disusun');
        this.sibuk.add(id);
        try {
            const f = this.o.folders().find((x) => x.id === id); if (!f) throw new Error('Folder tidak ada');
            const a = this.atur(id), isi = a.isi;
            if (!f.simbol.length) { const t = `📁 **${f.nama}** — folder masih kosong. Simpan saham ke folder ini lewat ☆ di halaman Sinyal.`; if (kirim) await this.o.kirim(t); return t; }
            const laba = await this.kalender();
            const lama = this.st.snap[id] || {}, baru: Record<string, Snap> = {};
            const ubah: Array<{ s: string; t: string; bobot: number }> = [], per: string[] = [];
            for (const s of f.simbol.slice(0, 40)) {
                const d = this.o.detail(s); const b = d?.baris;
                if (!b) { per.push(`- **${s}** · belum ada di data penyaring (data diambil saat penyaring berikutnya)`); continue; }
                const g = d.skor?.semua, fu = d.skor?.fundamental, wh = d.skor?.whales, br = d.berita, or = d.orang, dk = d.diskon;
                const lb = laba.get(s);
                const n: Snap = { label: g?.asli || g?.label, skor: g?.skorAsli ?? g?.skor, tahap: dk?.tahap || null, fundL: fu?.label, fundS: fu?.skor, whL: wh?.label, orangN: or?.n || 0, orangNet: or?.net || 0, judul: (br?.judul || []).map((j: any) => j.t).slice(0, 12), laba: lb ? lb.tgl : null };
                baru[s] = n;
                const p = lama[s];
                if (p) {
                    if (isi.sinyal && n.label && p.label && n.label !== p.label) ubah.push({ s, t: `sinyal ${p.label} → **${n.label}** (${bar(n.skor)})`, bobot: /Beli/.test(n.label) ? 3 : 2 });
                    else if (isi.sinyal && n.skor != null && p.skor != null && Math.abs(n.skor - p.skor) >= 0.2) ubah.push({ s, t: `skor ${bar(p.skor)} → ${bar(n.skor)}`, bobot: 1 });
                    if (isi.sinyal && n.tahap && URUT.indexOf(n.tahap) > URUT.indexOf(p.tahap || '')) ubah.push({ s, t: `pantul naik ke **${TAHAP[n.tahap]}** (${dk.jenis === 'koreksi' ? 'koreksi di tren naik' : `diskon dalam −${Math.round(dk.dariPuncak)}% dari puncak`}; ${dk.alasan.filter((x: string) => !/puncak|tren panjang/.test(x)).slice(0, 2).join(', ') || 'fundamental kuat'})`, bobot: n.tahap === 'balik' ? 4 : 3 });
                    if (isi.fundamental && n.fundL && p.fundL && n.fundL !== p.fundL) ubah.push({ s, t: `fundamental ${p.fundL} → **${n.fundL}** (Raka)`, bobot: 2 });
                    if (isi.whales && n.whL && p.whL && n.whL !== p.whL) ubah.push({ s, t: `whales ${p.whL} → **${n.whL}** (Sari)`, bobot: 2 });
                    if (isi.whales && (n.orangN || 0) > (p.orangN || 0) && or) ubah.push({ s, t: `orang dalam: ${or.n - (p.orangN || 0)} transaksi baru, bersih ${or.net >= 0 ? 'beli' : 'jual'} ${usd(Math.abs(or.net))} (Sari)`, bobot: or.net > 0 ? 3 : 1 });
                    if (isi.berita) {
                        const lihat = new Set(p.judul || []), segar = (br?.judul || []).filter((j: any) => !lihat.has(j.t) && j.s !== 0);
                        if (segar.length) { const kuat = [...segar].sort((x: any, y: any) => Math.abs(y.s) - Math.abs(x.s))[0]; ubah.push({ s, t: `${segar.length} berita baru (${segar.filter((j: any) => j.s > 0).length} positif, ${segar.filter((j: any) => j.s < 0).length} negatif) — "${String(kuat.t).slice(0, 110)}" (Nina)`, bobot: 1 + Math.min(2, Math.abs(kuat.s)) }); }
                    }
                }
                if (lb && (!p || p.laba !== lb.tgl)) ubah.push({ s, t: `laporan keuangan **${tglId(lb.tgl)}**${lb.waktu ? `, ${lb.waktu}` : ''}`, bobot: 3 });
                // Satu baris per saham
                const bag: string[] = [];
                if (isi.sinyal) bag.push(`${g ? `${g.label}${g.asli ? ` (asli ${g.asli})` : ''} ${bar(g.skorAsli ?? g.skor)}` : 'sinyal –'}${dk ? ` · pantul ${TAHAP[dk.tahap]}` : ''}${d.ambilUntung && d.ambilUntung.tahap !== 'pantau' ? ' · ambil untung sebagian?' : ''}`);
                if (isi.berita) bag.push(br?.n ? `berita ${br.judul.filter((j: any) => j.s > 0).length}+ ${br.judul.filter((j: any) => j.s < 0).length}−` : 'berita –');
                if (isi.whales) bag.push(`whales ${wh?.label || '–'}${or?.n ? `, orang dalam ${or.net >= 0 ? 'beli' : 'jual'} ${usd(Math.abs(or.net))}` : ''}`);
                if (isi.fundamental) bag.push(`fundamental ${fu?.label || '–'}${b.f?.per ? ` (PER ${Math.round(b.f.per)}×, ROE ${b.f.roe ?? '–'}%)` : ''}`);
                if (isi.kronos) { const k = this.o.kronos(s); bag.push(k ? `Kronos ${k.id.toUpperCase()} 1:${String(k.rr).replace('.', ',')} (${k.harapan > 0 ? '+' : ''}${String(k.harapan).replace('.', ',')}%)` : 'Kronos belum dihitung'); }
                per.push(`- **${s}** · $${b.harga} (${b.chg1d >= 0 ? '+' : ''}${b.chg1d}%) · ${bag.join(' · ')}`);
            }
            const w = wib();
            const sejak = this.st.laporanAt[id] ? `${HARI[new Date(this.st.laporanAt[id] + 7 * 3600_000).getUTCDay()]} ${new Date(this.st.laporanAt[id] + 7 * 3600_000).toISOString().slice(8, 10)}/${new Date(this.st.laporanAt[id] + 7 * 3600_000).toISOString().slice(5, 7)}` : '';
            ubah.sort((x, y) => y.bobot - x.bobot);
            const bagUbah = !this.st.laporanAt[id] && !ubah.length
                ? 'Ini laporan pertama folder ini — perubahan mulai dilacak dari sekarang.'
                : ubah.length ? `**Yang berubah${sejak ? ` sejak ${sejak}` : ''}:**\n${ubah.slice(0, 12).map((u) => `• **${u.s}**: ${u.t}`).join('\n')}${ubah.length > 12 ? `\n• …dan ${ubah.length - 12} perubahan kecil lain` : ''}` : `Tidak ada perubahan penting${sejak ? ` sejak ${sejak}` : ''}.`;
            let pembuka = '';
            if (ubah.length && this.o.ringkas) { try { pembuka = (await this.o.ringkas(`Folder ${f.nama}. Perubahan:\n${ubah.slice(0, 12).map((u) => `${u.s}: ${u.t}`).join('\n')}`))?.trim() || ''; } catch { /* AI tidak tersedia */ } }
            const teks = [
                `📁 **${f.nama}** — ${HARI[w.getUTCDay()]} ${w.toISOString().slice(11, 16)} WIB · ${f.simbol.length} saham`,
                pembuka,
                bagUbah,
                ubah.length || !this.st.laporanAt[id] ? `**Per saham:**\n${per.join('\n')}` : '',
                'Detail di Trading → Sinyal → Watchlist. Prediksi statistik, bukan saran beli/jual.'
            ].filter(Boolean).join('\n\n');
            this.st.snap[id] = baru; this.st.laporanAt[id] = Date.now(); this.simpan();
            if (kirim) await this.o.kirim(teks);
            return teks;
        } finally { this.sibuk.delete(id); }
    }
}
