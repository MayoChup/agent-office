/**
 * Pembuat gambar AI (aset baru: maskot pose lain, sudut produk lain, latar, properti) lewat API gambar OpenRouter,
 * memakai saldo OpenRouter Pak Rico. HANYA berjalan saat Pak Rico menekan "Buat" — tidak pernah otomatis.
 * Mengedit/menyusun gambar bukan tugas modul ini (itu Claude / mesin desain kantor).
 *
 * Model utama openai/gpt-image-2 (murah, teks rapi, terima 16 gambar acuan); cadangan google/gemini-3.1-flash-image.
 * Batas biaya harian (bawaan $0,50) dicatat dari angka biaya asli yang dikembalikan OpenRouter.
 */
import fs from 'fs';
import path from 'path';

interface Catatan { batas?: number; batasOto?: number; usdOtoHari?: number; hari: string; usdHari: number; bulan: string; usdBulan: number; n: number; riwayat: Array<{ at: number; model: string; n: number; usd: number; untuk: string }> }
const wib = () => new Date(Date.now() + 7 * 3600_000).toISOString();

export class GambarAi {
    private file: string; private c: Catatan;
    constructor(dataDir: string, private kunci: () => string, private env: Record<string, string | undefined> = process.env) {
        this.file = path.join(dataDir, 'gambar-ai.json');
        try { this.c = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.c = { hari: '', usdHari: 0, bulan: '', usdBulan: 0, n: 0, riwayat: [] }; }
    }
    private gulir() {
        const h = wib().slice(0, 10), b = h.slice(0, 7);
        if (this.c.hari !== h) { this.c.hari = h; this.c.usdHari = 0; this.c.usdOtoHari = 0; }
        if (this.c.bulan !== b) { this.c.bulan = b; this.c.usdBulan = 0; }
    }
    private simpan() { try { fs.writeFileSync(this.file, JSON.stringify(this.c)); } catch { /* */ } }
    batasHari() { return Math.max(0, this.c.batas ?? (Number(this.env.KANTOR_GAMBAR_BATAS ?? 0.5) || 0)); }
    /** Batas terpisah untuk elemen konten yang dibuat OTOMATIS (tanpa ditekan), bawaan $0,25/hari (±19 gambar standar). */
    batasOtomatis() { return Math.max(0, this.c.batasOto ?? (Number(this.env.KANTOR_ELEMEN_BATAS ?? 0.25) || 0)); }
    aturBatasOtomatis(usd: number) { if (!Number.isFinite(usd) || usd < 0 || usd > 10) throw new Error('Batas elemen otomatis antara $0 dan $10.'); this.c.batasOto = +usd.toFixed(2); this.simpan(); return this.batasOtomatis(); }
    bolehOtomatis() { this.gulir(); return !!this.kunci() && (this.c.usdOtoHari || 0) + this.perkiraan(1, false) <= this.batasOtomatis() + 1e-9; }
    aturBatas(usd: number) { if (!Number.isFinite(usd) || usd < 0 || usd > 20) throw new Error('Batas harian antara $0 dan $20.'); this.c.batas = +usd.toFixed(2); this.simpan(); return this.batasHari(); }
    models() { return [this.env.KANTOR_GAMBAR_MODEL || 'openai/gpt-image-2', this.env.KANTOR_GAMBAR_CADANGAN || 'google/gemini-3.1-flash-image']; }
    status() {
        this.gulir();
        return { ada: !!this.kunci(), batasHari: this.batasHari(), terpakaiHari: +this.c.usdHari.toFixed(4), terpakaiBulan: +this.c.usdBulan.toFixed(4), jumlah: this.c.n, batasOtomatis: this.batasOtomatis(), terpakaiOtomatis: +(this.c.usdOtoHari || 0).toFixed(4), model: this.models()[0],
            perkiraan: { standar: 0.013, tinggi: 0.21 } };
    }
    /** Perkiraan biaya untuk n gambar (dipakai untuk cek batas sebelum memanggil). */
    perkiraan(n: number, tinggi: boolean) { return n * (tinggi ? 0.21 : 0.013); }

    /**
     * Buat n pilihan gambar. acuan = gambar dari Gudang aset (maskot/produk) supaya tokoh & produk tetap sama.
     * Mengembalikan buffer gambar + biaya asli.
     */
    async buat(o: { prompt: string; n: number; rasio?: string; acuan?: Array<{ mime: string; data: Buffer }>; tinggi?: boolean; latarTransparan?: boolean; untuk: string; otomatis?: boolean }): Promise<{ gambar: Array<{ data: Buffer; mime: string }>; usd: number; model: string }> {
        const kunci = this.kunci(); if (!kunci) throw new Error('Kunci OpenRouter belum ada di VPS (OPENROUTER_API_KEY).');
        this.gulir();
        const n = Math.max(1, Math.min(4, Math.round(o.n || 2)));
        const batas = this.batasHari();
        if (o.otomatis) { if ((this.c.usdOtoHari || 0) + this.perkiraan(n, false) > this.batasOtomatis() + 1e-9) throw new Error('Batas elemen otomatis hari ini tercapai.'); }
        else if (this.c.usdHari + this.perkiraan(n, !!o.tinggi) > batas + 1e-9) throw new Error(`Batas biaya gambar AI hari ini ($${batas.toFixed(2)}) tercapai — terpakai $${this.c.usdHari.toFixed(3)}. Ubah batas di Konten → Gudang aset, atau coba besok.`);
        const galat: string[] = [];
        for (const model of this.models()) {
            try {
                const body: any = { model, prompt: o.prompt.slice(0, 4000), n, aspect_ratio: o.rasio || '1:1', quality: o.tinggi ? 'high' : 'auto', output_format: 'png', response_format: 'b64_json', provider: { data_collection: 'deny' } };
                if (o.latarTransparan) body.background = 'transparent';
                if (o.acuan?.length) body.input_references = o.acuan.slice(0, 8).map((g) => ({ type: 'image_url', image_url: { url: `data:${g.mime};base64,${g.data.toString('base64')}` } }));
                const r = await fetch('https://openrouter.ai/api/v1/images', { method: 'POST', headers: { Authorization: `Bearer ${kunci}`, 'Content-Type': 'application/json', 'X-Title': 'Kantor Virtual' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
                const j: any = await r.json().catch(() => ({}));
                if (!r.ok) { galat.push(`${model}: ${String(j?.error?.message || `HTTP ${r.status}`).slice(0, 160)}`); if (r.status === 402) break; continue; }
                let gambar: Array<{ data: Buffer; mime: string }> = (Array.isArray(j.data) ? j.data : []).filter((x: any) => x?.b64_json).map((x: any) => ({ data: Buffer.from(x.b64_json, 'base64'), mime: x.media_type || 'image/png' }));
                // Penyedia yang hanya membuat 1 gambar per panggilan: panggil lagi sampai n (biaya tetap dihitung).
                let usd = Number(j?.usage?.cost) || 0;
                while (gambar.length && gambar.length < n && model === this.models()[0]) {
                    const r2 = await fetch('https://openrouter.ai/api/v1/images', { method: 'POST', headers: { Authorization: `Bearer ${kunci}`, 'Content-Type': 'application/json', 'X-Title': 'Kantor Virtual' }, body: JSON.stringify({ ...body, n: 1 }), signal: AbortSignal.timeout(180_000) });
                    const j2: any = await r2.json().catch(() => ({})); if (!r2.ok) break;
                    usd += Number(j2?.usage?.cost) || 0;
                    const satu = (j2.data || []).find((x: any) => x?.b64_json); if (!satu) break;
                    gambar.push({ data: Buffer.from(satu.b64_json, 'base64'), mime: satu.media_type || 'image/png' });
                }
                gambar = gambar.slice(0, n);
                if (!usd) usd = this.perkiraan(gambar.length, !!o.tinggi);
                if (o.otomatis) this.c.usdOtoHari = (this.c.usdOtoHari || 0) + usd; else this.c.usdHari += usd;
                this.c.usdBulan += usd; this.c.n += gambar.length;
                this.c.riwayat = [...this.c.riwayat, { at: Date.now(), model, n: gambar.length, usd: +usd.toFixed(4), untuk: o.untuk.slice(0, 80) }].slice(-60); this.simpan();
                if (!gambar.length) { galat.push(`${model}: tidak mengembalikan gambar`); continue; }
                return { gambar, usd, model };
            } catch (e: any) { galat.push(`${model}: ${String(e?.message || e).slice(0, 120)}`); }
        }
        throw new Error(`Gambar AI gagal dibuat. ${galat.join(' · ')}`);
    }
}
