/**
 * Mesin desain kantor: menggambar slide carousel / postingan gambar, logo, foto profil, dan cover highlight sebagai PNG
 * langsung di VPS (tanpa browser, tanpa AI berbayar) memakai @napi-rs/canvas.
 *
 * 12 gaya diadaptasi dari preset "frontend-slides" (Zara Zhang, MIT): warna & pasangan font sama, tata letak diubah ke 4:5.
 * Font ada di folder fonta/ (Google Fonts, OFL).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const muat = createRequire(__filename);
let C: any = null;
/** Modul canvas dimuat saat pertama dipakai (paket asli/native; kalau tidak ada, fitur desain mati tanpa menjatuhkan kantor). */
function kanvas(): any {
    if (C) return C;
    C = muat('@napi-rs/canvas');
    const dirs = [process.env.KANTOR_FONTA, path.join(__dirname, 'fonta'), path.join(__dirname, '..', '..', '..', '..', 'kantor', 'fonta'), path.join(process.cwd(), 'fonta')].filter(Boolean) as string[];
    const dir = dirs.find((d) => fs.existsSync(path.join(d, 'Outfit.ttf')));
    if (dir) for (const [f, nama] of FONTA) { try { C.GlobalFonts.registerFromPath(path.join(dir, f), nama); } catch { /* lewati */ } }
    return C;
}
export function desainSiap(): { siap: boolean; pesan: string } {
    try { kanvas(); return { siap: true, pesan: 'Mesin desain siap.' }; } catch (e: any) { return { siap: false, pesan: `Mesin desain belum terpasang (${String(e?.message || e).slice(0, 100)}).` }; }
}

const FONTA: Array<[string, string]> = [
    ['ArchivoBlack.ttf', 'Archivo Black'], ['SpaceGrotesk.ttf', 'Space Grotesk'], ['Manrope.ttf', 'Manrope'], ['Syne.ttf', 'Syne'],
    ['SpaceMono-Regular.ttf', 'Space Mono'], ['SpaceMono-Bold.ttf', 'Space Mono'], ['Cormorant.ttf', 'Cormorant'], ['Cormorant-Italic.ttf', 'Cormorant'],
    ['IBMPlexSans.ttf', 'IBM Plex Sans'], ['BodoniModa.ttf', 'Bodoni Moda'], ['DMSans.ttf', 'DM Sans'], ['PlusJakartaSans.ttf', 'Plus Jakarta Sans'],
    ['Outfit.ttf', 'Outfit'], ['Fraunces.ttf', 'Fraunces'], ['WorkSans.ttf', 'Work Sans'], ['Unbounded.ttf', 'Unbounded'], ['Sora.ttf', 'Sora'],
    ['JetBrainsMono.ttf', 'JetBrains Mono'], ['Archivo.ttf', 'Archivo'], ['Nunito.ttf', 'Nunito'], ['CormorantGaramond.ttf', 'Cormorant Garamond'], ['SourceSerif4.ttf', 'Source Serif 4']
];
export const DAFTAR_FONT = [...new Set(FONTA.map((f) => f[1]))];

/* ── Gaya ── */
export interface GayaDesain {
    id: string; nama: string; nuansa: string; gelap: boolean; cocok: string;
    judul: { f: string; w: number; italic?: boolean; huruf?: number }; isi: { f: string; w: number };
    w: Record<string, string>;
}
export const GAYA_DESAIN: GayaDesain[] = [
    { id: 'bold-signal', nama: 'Bold Signal', nuansa: 'Tegas, modern, berdampak', gelap: true, cocok: 'tips tegas, bisnis, motivasi', judul: { f: 'Archivo Black', w: 400 }, isi: { f: 'Space Grotesk', w: 500 }, w: { bg: '#1a1a1a', bg2: '#2d2d2d', aksen: '#FF5722', teks: '#ffffff', teksKartu: '#1a1a1a' } },
    { id: 'electric-studio', nama: 'Electric Studio', nuansa: 'Bersih, profesional, kontras tinggi', gelap: false, cocok: 'edukasi, jasa profesional', judul: { f: 'Manrope', w: 800 }, isi: { f: 'Manrope', w: 500 }, w: { bg: '#ffffff', gelap: '#0a0a0a', aksen: '#4361ee', teks: '#0a0a0a', terang: '#ffffff' } },
    { id: 'creative-voltage', nama: 'Creative Voltage', nuansa: 'Energik, kreatif, retro-modern', gelap: true, cocok: 'kreator, desain, anak muda', judul: { f: 'Syne', w: 800 }, isi: { f: 'Space Mono', w: 400 }, w: { bg: '#1a1a2e', aksen: '#0066ff', neon: '#d4ff00', teks: '#ffffff' } },
    { id: 'dark-botanical', nama: 'Dark Botanical', nuansa: 'Elegan, premium, artistik', gelap: true, cocok: 'kecantikan, kopi premium, fashion', judul: { f: 'Cormorant', w: 600, italic: true }, isi: { f: 'IBM Plex Sans', w: 300 }, w: { bg: '#0f0f0f', teks: '#e8e4df', teks2: '#9a9590', aksen: '#d4a574', pink: '#e8b4b8', emas: '#c9b896' } },
    { id: 'notebook-tabs', nama: 'Notebook Tabs', nuansa: 'Editorial, rapi, terasa nyata', gelap: false, cocok: 'catatan belajar, rangkuman', judul: { f: 'Bodoni Moda', w: 700 }, isi: { f: 'DM Sans', w: 400 }, w: { luar: '#2d2d2d', bg: '#f8f6f1', teks: '#1a1a1a', t1: '#98d4bb', t2: '#c7b8ea', t3: '#f4b8c5', t4: '#a8d8ea', t5: '#ffe6a7', aksen: '#c7b8ea' } },
    { id: 'pastel-geometry', nama: 'Pastel Geometry', nuansa: 'Ramah, rapi, mudah didekati', gelap: false, cocok: 'parenting, UMKM, tips harian', judul: { f: 'Plus Jakarta Sans', w: 800 }, isi: { f: 'Plus Jakarta Sans', w: 500 }, w: { bg: '#c8d9e6', kartu: '#faf9f7', teks: '#1a1a1a', p1: '#f0b4d4', p2: '#a8d4c4', p3: '#5a7c6a', p4: '#9b8dc4', aksen: '#7c6aad' } },
    { id: 'split-pastel', nama: 'Split Pastel', nuansa: 'Ceria, modern, kreatif', gelap: false, cocok: 'makanan, lifestyle, hiburan', judul: { f: 'Outfit', w: 800 }, isi: { f: 'Outfit', w: 500 }, w: { kiri: '#f5e6dc', kanan: '#e4dff0', teks: '#1a1a1a', b1: '#c8f0d8', b2: '#f0f0c8', b3: '#f0d4e0', aksen: '#1a1a1a' } },
    { id: 'vintage-editorial', nama: 'Vintage Editorial', nuansa: 'Cerdas, percaya diri, berkarakter', gelap: false, cocok: 'opini, storytelling, personal brand', judul: { f: 'Fraunces', w: 800 }, isi: { f: 'Work Sans', w: 400 }, w: { bg: '#f5f3ee', teks: '#1a1a1a', teks2: '#555555', aksen: '#e8d4c0' } },
    { id: 'neon-cyber', nama: 'Neon Cyber', nuansa: 'Futuristik, teknologi', gelap: true, cocok: 'teknologi, AI, gaming', judul: { f: 'Unbounded', w: 700 }, isi: { f: 'Sora', w: 400 }, w: { bg: '#0a0f1c', aksen: '#00ffcc', magenta: '#ff00aa', teks: '#e6fbff' } },
    { id: 'terminal-green', nama: 'Terminal Green', nuansa: 'Gaya programmer / hacker', gelap: true, cocok: 'coding, tutorial teknis', judul: { f: 'JetBrains Mono', w: 800 }, isi: { f: 'JetBrains Mono', w: 400 }, w: { bg: '#0d1117', aksen: '#39d353', teks: '#c9d1d9', redup: '#8b949e' } },
    { id: 'swiss-modern', nama: 'Swiss Modern', nuansa: 'Bersih, presisi, ala Bauhaus', gelap: false, cocok: 'data, fakta, bisnis', judul: { f: 'Archivo', w: 800 }, isi: { f: 'Nunito', w: 400 }, w: { bg: '#ffffff', teks: '#000000', aksen: '#ff3300', garis: '#e5e5e5' } },
    { id: 'paper-ink', nama: 'Paper & Ink', nuansa: 'Sastrawi, tenang, mendalam', gelap: false, cocok: 'renungan, buku, kutipan', judul: { f: 'Cormorant Garamond', w: 700 }, isi: { f: 'Source Serif 4', w: 400 }, w: { bg: '#faf9f7', teks: '#1a1a1a', aksen: '#c41e3a', teks2: '#555555' } }
];
export const gayaDesain = (id?: string) => GAYA_DESAIN.find((g) => g.id === id) || GAYA_DESAIN[0];

/* ── Data slide ── */
export interface IsiSlide { judul: string; isi?: string; label?: string; gambar?: Buffer | null; /** produk/logo transparan: ditampilkan utuh (contain); foto: memenuhi bingkai (cover) */ utuh?: boolean }
export interface InfoMerek { nama: string; handle?: string; warna?: string[]; logo?: Buffer | null; fontJudul?: string; fontIsi?: string; aksenMerek?: boolean }
export interface OpsiRender { w?: number; h?: number }

const hexOk = (s?: string) => !!s && /^#[0-9a-f]{6}$/i.test(s);
function terang(hex: string) { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
const kontras = (bg: string) => (terang(bg) > 0.6 ? '#111111' : '#ffffff');

/** Pecah teks jadi baris yang muat di lebar tertentu. "**kata**" = ditekankan (warna aksen). */
function bungkus(g: any, teks: string, lebar: number): string[][] {
    const kata = String(teks || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const baris: string[][] = []; let kini: string[] = [];
    const ukur = (ws: string[]) => g.measureText(ws.join(' ').replace(/\*\*/g, '')).width;
    for (const k of kata) {
        if (kini.length && ukur([...kini, k]) > lebar) { baris.push(kini); kini = [k]; } else kini.push(k);
    }
    if (kini.length) baris.push(kini);
    return baris;
}
/** Tulis blok teks yang mengecil sendiri sampai muat di kotak. Mengembalikan tinggi yang dipakai. */
function blok(g: any, teks: string, o: { x: number; y: number; w: number; h: number; f: string; w8: number; italic?: boolean; maks: number; min: number; warna: string; tekan?: string; lh?: number; rata?: 'kiri' | 'tengah'; huruf?: number }): number {
    if (!teks) return 0;
    let ukuran = o.maks, baris: string[][] = [];
    const lh = o.lh || 1.12;
    for (; ukuran >= o.min; ukuran -= 2) {
        g.font = `${o.italic ? 'italic ' : ''}${o.w8} ${ukuran}px "${o.f}"`;
        baris = bungkus(g, teks, o.w);
        if (baris.length * ukuran * lh <= o.h && baris.every((b) => g.measureText(b.join(' ').replace(/\*\*/g, '')).width <= o.w)) break;
    }
    ukuran = Math.max(ukuran, o.min);
    g.font = `${o.italic ? 'italic ' : ''}${o.w8} ${ukuran}px "${o.f}"`; g.textBaseline = 'top';
    let y = o.y; let tekan = false;
    for (const b of baris) {
        const lebarBaris = g.measureText(b.join(' ').replace(/\*\*/g, '')).width;
        let x = o.rata === 'tengah' ? o.x + (o.w - lebarBaris) / 2 : o.x;
        for (let i = 0; i < b.length; i++) {
            let k = b[i];
            const buka = k.startsWith('**'), tutup = k.endsWith('**') && k.length > 2;
            if (buka) { tekan = true; k = k.slice(2); }
            if (tutup || (buka && k.endsWith('**'))) k = k.replace(/\*\*$/, '');
            g.fillStyle = tekan && o.tekan ? o.tekan : o.warna;
            const t = k + (i < b.length - 1 ? ' ' : '');
            g.fillText(t, x, y); x += g.measureText(t).width;
            if (tutup || (buka && b[i].endsWith('**') && b[i].length > 4)) tekan = false;
        }
        y += ukuran * lh;
    }
    return y - o.y;
}
function bulat(g: any, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
async function pasangGambar(g: any, buf: Buffer, x: number, y: number, w: number, h: number, o: { utuh?: boolean; r?: number } = {}) {
    const { loadImage } = kanvas();
    const im = await loadImage(buf);
    const sk = o.utuh ? Math.min(w / im.width, h / im.height) : Math.max(w / im.width, h / im.height);
    const dw = im.width * sk, dh = im.height * sk;
    g.save();
    if (!o.utuh) { bulat(g, x, y, w, h, o.r ?? 24); g.clip(); }
    g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    g.restore();
}

/** Gambar satu slide. no = 1..n. */
export async function renderSlide(gayaId: string, s: IsiSlide, no: number, n: number, merek: InfoMerek, opsi: OpsiRender = {}): Promise<Buffer> {
    const { createCanvas } = kanvas();
    const st = gayaDesain(gayaId), W = opsi.w || 1080, H = opsi.h || 1350;
    const w = { ...st.w }; if (merek.aksenMerek && hexOk(merek.warna?.[0])) w.aksen = merek.warna![0];
    const fJ = merek.fontJudul && DAFTAR_FONT.includes(merek.fontJudul) ? merek.fontJudul : st.judul.f;
    const fI = merek.fontIsi && DAFTAR_FONT.includes(merek.fontIsi) ? merek.fontIsi : st.isi.f;
    const c = createCanvas(W, H), g = c.getContext('2d');
    const pertama = no === 1, akhir = no === n && n > 1;
    const P = Math.round(W * 0.083); // tepi aman
    const J = (o: Partial<Parameters<typeof blok>[2]> & { x: number; y: number; w: number; h: number; maks: number; warna: string }) => blok(g, s.judul, { f: fJ, w8: st.judul.w, italic: st.judul.italic, min: 30, ...o } as any);
    const I = (o: Partial<Parameters<typeof blok>[2]> & { x: number; y: number; w: number; h: number; maks: number; warna: string }, teks = s.isi || '') => blok(g, teks, { f: fI, w8: st.isi.w, min: 24, lh: 1.38, ...o } as any);
    let teksUtama = w.teks || '#111', warnaKaki = teksUtama, aksenProgres = w.aksen;
    // kotak media (untuk aset gambar) per gaya; null = tanpa gambar
    let media: { x: number; y: number; w: number; h: number; r?: number } | null = null;

    switch (st.id) {
        case 'bold-signal': {
            const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, w.bg); gr.addColorStop(0.5, w.bg2); gr.addColorStop(1, w.bg); g.fillStyle = gr; g.fillRect(0, 0, W, H);
            const kx = P * 0.7, ky = P * 1.6, kw = W - kx * 2, kh = H - ky - P * 1.8;
            g.fillStyle = w.aksen; bulat(g, kx, ky, kw, kh, 28); g.fill();
            g.font = `400 ${pertama ? 150 : 120}px "${fJ}"`; g.fillStyle = w.teksKartu; g.textBaseline = 'top'; g.globalAlpha = 0.9; g.fillText(String(no).padStart(2, '0'), kx + 48, ky + 40); g.globalAlpha = 1;
            g.font = `500 26px "${fI}"`; g.fillStyle = w.teks; g.globalAlpha = 0.6; g.fillText((s.label || merek.nama).toUpperCase(), P * 0.7, P * 0.8); g.globalAlpha = 1;
            if (s.gambar) media = { x: kx + 48, y: ky + 230, w: kw - 96, h: kh * 0.36, r: 18 };
            const ty = media ? media.y + media.h + 36 : ky + kh * (pertama ? 0.36 : 0.3);
            const hj = J({ x: kx + 48, y: ty, w: kw - 96, h: (ky + kh - 48 - ty) * (s.isi ? 0.58 : 1), maks: pertama ? 104 : 80, warna: w.teksKartu, tekan: '#ffffff', lh: 1.04 });
            I({ x: kx + 48, y: ty + hj + 22, w: kw - 96, h: ky + kh - 48 - (ty + hj + 22), maks: 38, warna: w.teksKartu });
            teksUtama = w.teks; warnaKaki = w.teks; aksenProgres = w.aksen;
            break;
        }
        case 'electric-studio': {
            const batas = Math.round(H * (pertama ? 0.62 : 0.5));
            g.fillStyle = w.bg; g.fillRect(0, 0, W, batas); g.fillStyle = w.aksen; g.fillRect(0, batas, W, H - batas);
            g.fillStyle = w.gelap; g.fillRect(P, P, 14, 110);
            g.font = `800 28px "${fJ}"`; g.fillStyle = w.gelap; g.textBaseline = 'top'; g.fillText(merek.nama, P + 34, P + 4);
            g.font = `500 24px "${fI}"`; g.globalAlpha = 0.55; g.fillText(`${String(no).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, P + 34, P + 44); g.globalAlpha = 1;
            if (s.gambar) { media = { x: W - P - 360, y: batas - 300, w: 360, h: 360, r: 24 }; }
            J({ x: P, y: P + 170, w: W - P * 2 - (media ? 380 : 0), h: batas - P - 200, maks: pertama ? 110 : 84, warna: w.teks, tekan: w.aksen, lh: 1.04 });
            I({ x: P, y: batas + 60, w: W - P * 2, h: H - batas - 200, maks: 44, warna: w.terang });
            warnaKaki = w.terang; aksenProgres = w.terang;
            break;
        }
        case 'creative-voltage': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            const kiri = Math.round(W * (pertama ? 1 : 0.38)); g.fillStyle = w.aksen; g.fillRect(0, 0, kiri, H);
            g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = 30; y < H; y += 28) for (let x = 30 + ((y / 28) % 2) * 14; x < kiri; x += 28) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
            g.font = `700 26px "${fI}"`; const lb = (s.label || `#${String(no).padStart(2, '0')}`).toUpperCase(); const lbw = g.measureText(lb).width + 36;
            g.fillStyle = w.neon; bulat(g, P, P, lbw, 52, 26); g.fill(); g.fillStyle = '#111'; g.textBaseline = 'middle'; g.fillText(lb, P + 18, P + 27);
            if (pertama) {
                if (s.gambar) media = { x: P, y: H * 0.5, w: W - P * 2, h: H * 0.28, r: 20 };
                J({ x: P, y: P + 120, w: W - P * 2, h: (media ? media.y - 40 : H * 0.62) - P - 120, maks: 120, warna: '#ffffff', tekan: w.neon, lh: 1.0 });
                I({ x: P, y: media ? media.y + media.h + 30 : H * 0.66, w: W - P * 2, h: H * 0.2, maks: 34, warna: '#ffffff' });
            } else {
                if (s.gambar) media = { x: 40, y: H * 0.3, w: kiri - 80, h: H * 0.4, r: 18 };
                J({ x: kiri + 50, y: P + 120, w: W - kiri - 50 - P, h: H * 0.42, maks: 76, warna: '#ffffff', tekan: w.neon, lh: 1.02 });
                I({ x: kiri + 50, y: H * 0.58, w: W - kiri - 50 - P, h: H * 0.3, maks: 30, warna: '#d8d8e8' });
            }
            warnaKaki = '#ffffff'; aksenProgres = w.neon;
            break;
        }
        case 'dark-botanical': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            const bola = (x: number, y: number, r: number, warna: string, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, warna); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; };
            bola(W * 0.92, H * 0.1, 420, w.aksen, 0.55); bola(W * 0.72, H * 0.02, 300, w.pink, 0.45); bola(W * 0.05, H * 0.95, 380, w.emas, 0.25);
            g.strokeStyle = w.aksen; g.globalAlpha = 0.6; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, P); g.lineTo(W / 2, P + 90); g.stroke(); g.globalAlpha = 1;
            if (s.gambar) media = { x: W * 0.2, y: H * 0.17, w: W * 0.6, h: H * 0.3, r: 200 };
            const ty = media ? H * 0.52 : H * (pertama ? 0.3 : 0.26);
            const hj = J({ x: P, y: ty, w: W - P * 2, h: H * (s.isi ? 0.24 : 0.4), maks: pertama ? 118 : 92, warna: w.teks, tekan: w.aksen, rata: 'tengah', lh: 1.02 });
            g.fillStyle = w.aksen; g.fillRect(W / 2 - 40, ty + hj + 26, 80, 2);
            I({ x: P + 30, y: ty + hj + 60, w: W - P * 2 - 60, h: H * 0.86 - (ty + hj + 60), maks: 36, warna: w.teks2, rata: 'tengah' });
            warnaKaki = w.teks2; aksenProgres = w.aksen;
            break;
        }
        case 'notebook-tabs': {
            g.fillStyle = w.luar; g.fillRect(0, 0, W, H);
            const kx = 56, ky = 56, kw = W - 56 - 96, kh = H - 112;
            g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 30; g.fillStyle = w.bg; bulat(g, kx, ky, kw, kh, 14); g.fill(); g.shadowBlur = 0;
            const tab = [w.t1, w.t2, w.t3, w.t4, w.t5];
            for (let i = 0; i < 5; i++) { const ty = ky + 80 + i * 150; g.fillStyle = tab[i]; bulat(g, kx + kw - 8, ty, 66, 130, 10); g.fill(); if (i === (no - 1) % 5) { g.save(); g.translate(kx + kw + 34, ty + 65); g.rotate(Math.PI / 2); g.font = `600 20px "${fI}"`; g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(no).padStart(2, '0'), 0, 0); g.restore(); } }
            for (let i = 0; i < 3; i++) { g.fillStyle = w.luar; g.beginPath(); g.arc(kx + 34, ky + kh * (0.25 + i * 0.25), 12, 0, Math.PI * 2); g.fill(); }
            const ix = kx + 90, iw = kw - 150;
            g.font = `500 24px "${fI}"`; g.fillStyle = '#1a1a1a'; g.globalAlpha = 0.5; g.textBaseline = 'top'; g.fillText((s.label || merek.nama), ix, ky + 60); g.globalAlpha = 1;
            if (s.gambar) media = { x: ix, y: ky + kh * 0.5, w: iw, h: kh * 0.3, r: 12 };
            const hj = J({ x: ix, y: ky + 130, w: iw, h: kh * (media ? 0.28 : 0.38), maks: pertama ? 104 : 80, warna: w.teks, tekan: '#7c5cc4', lh: 1.06 });
            g.strokeStyle = '#1a1a1a'; g.globalAlpha = 0.15; g.lineWidth = 2; g.beginPath(); g.moveTo(ix, ky + 150 + hj); g.lineTo(ix + iw, ky + 150 + hj); g.stroke(); g.globalAlpha = 1;
            I({ x: ix, y: ky + 180 + hj, w: iw, h: (media ? media.y - 30 : ky + kh - 120) - (ky + 180 + hj), maks: 36, warna: '#333333' });
            warnaKaki = '#1a1a1a'; aksenProgres = '#7c5cc4';
            break;
        }
        case 'pastel-geometry': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            const kx = 60, ky = 70, kw = W - 60 - 150, kh = H - 140;
            g.shadowColor = 'rgba(40,60,90,0.18)'; g.shadowBlur = 40; g.shadowOffsetY = 10; g.fillStyle = w.kartu; bulat(g, kx, ky, kw, kh, 40); g.fill(); g.shadowBlur = 0; g.shadowOffsetY = 0;
            const pil = [w.p1, w.p2, w.p3, w.p4, w.aksen], tinggi = [120, 190, 260, 190, 120];
            let py = H / 2 - tinggi.reduce((a, b) => a + b + 18, 0) / 2; for (let i = 0; i < 5; i++) { g.fillStyle = pil[i]; bulat(g, W - 120, py, 58, tinggi[i], 29); g.fill(); py += tinggi[i] + 18; }
            const ix = kx + 60, iw = kw - 120;
            g.fillStyle = w.p2; bulat(g, ix, ky + 60, 120, 44, 22); g.fill(); g.font = `700 22px "${fI}"`; g.fillStyle = '#1a1a1a'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(`${no} / ${n}`, ix + 60, ky + 83); g.textAlign = 'left';
            if (s.gambar) media = { x: ix, y: ky + kh * 0.48, w: iw, h: kh * 0.32, r: 28 };
            const hj = J({ x: ix, y: ky + 150, w: iw, h: kh * (media ? 0.3 : 0.4), maks: pertama ? 96 : 74, warna: w.teks, tekan: w.aksen, lh: 1.06 });
            I({ x: ix, y: ky + 180 + hj, w: iw, h: (media ? media.y - 20 : ky + kh - 110) - (ky + 180 + hj), maks: 36, warna: '#3a3a3a' });
            warnaKaki = '#1a1a1a';
            break;
        }
        case 'split-pastel': {
            const bagi = Math.round(W * 0.5); g.fillStyle = w.kiri; g.fillRect(0, 0, bagi, H); g.fillStyle = w.kanan; g.fillRect(bagi, 0, W - bagi, H);
            g.strokeStyle = 'rgba(26,26,26,0.07)'; g.lineWidth = 2; for (let x = bagi + 40; x < W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 40; y < H; y += 54) { g.beginPath(); g.moveTo(bagi, y); g.lineTo(W, y); g.stroke(); }
            const bd = [w.b1, w.b2, w.b3]; g.font = `600 24px "${fI}"`; let bx = P; for (const [i, t] of [s.label || merek.nama, `${no}/${n}`].entries()) { const tw = g.measureText(t).width + 40; g.fillStyle = bd[i % 3]; bulat(g, bx, P, tw, 50, 25); g.fill(); g.fillStyle = '#1a1a1a'; g.textBaseline = 'middle'; g.fillText(t, bx + 20, P + 26); bx += tw + 12; }
            if (s.gambar) media = { x: bagi + 30, y: H * 0.5, w: W - bagi - 30 - P * 0.6, h: H * 0.34, r: 30 };
            const hj = J({ x: P, y: P + 120, w: W - P * 2, h: H * (media ? 0.32 : 0.42), maks: pertama ? 112 : 84, warna: w.teks, lh: 1.02, tekan: '#c2185b' });
            I({ x: P, y: P + 150 + hj, w: media ? bagi - P - 20 : W - P * 2, h: H - P * 2.6 - (P + 150 + hj), maks: 36, warna: '#2b2b2b' });
            warnaKaki = '#1a1a1a'; aksenProgres = '#1a1a1a';
            break;
        }
        case 'vintage-editorial': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.beginPath(); g.arc(W - P - 70, P + 90, 70, 0, Math.PI * 2); g.stroke();
            g.beginPath(); g.moveTo(W - P - 260, P + 200); g.lineTo(W - P, P + 200); g.stroke(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(W - P - 290, P + 200, 9, 0, Math.PI * 2); g.fill();
            g.fillStyle = w.aksen; g.beginPath(); g.arc(P + 40, H - P - 140, 120, 0, Math.PI * 2); g.fill();
            g.font = `italic 400 30px "${fJ}"`; g.fillStyle = w.teks2; g.textBaseline = 'top'; g.fillText(`No. ${no}`, P, P + 40);
            if (s.gambar) media = { x: P, y: H * 0.46, w: W - P * 2, h: H * 0.3, r: 4 };
            const hj = J({ x: P, y: P + 260, w: W - P * 2, h: H * (media ? 0.2 : 0.34), maks: pertama ? 120 : 88, warna: w.teks, tekan: '#a0522d', lh: 1.0 });
            const iy = P + 300 + hj, ih = (media ? media.y - 30 : H - P * 2.4) - iy;
            if (s.isi) { const tinggi = I({ x: P + 30, y: iy + 10, w: W - P * 2 - 60, h: Math.min(ih, 420) - 20, maks: 36, warna: w.teks2 }); g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.strokeRect(P, iy - 18, W - P * 2, tinggi + 56); }
            warnaKaki = w.teks; aksenProgres = '#1a1a1a';
            break;
        }
        case 'neon-cyber': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = 'rgba(0,255,204,0.08)'; g.lineWidth = 1; for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
            for (let i = 0; i < 40; i++) { const x = (i * 197) % W, y = (i * 331) % H; g.fillStyle = i % 3 ? 'rgba(0,255,204,0.5)' : 'rgba(255,0,170,0.5)'; g.fillRect(x, y, 3, 3); }
            g.font = `400 24px "${fI}"`; g.fillStyle = w.aksen; g.textBaseline = 'top'; g.fillText(`// ${String(no).padStart(2, '0')}_${(s.label || merek.nama).toUpperCase().replace(/\s+/g, '_')}`, P, P);
            if (s.gambar) media = { x: P, y: H * 0.52, w: W - P * 2, h: H * 0.28, r: 16 };
            g.shadowColor = w.aksen; g.shadowBlur = 24;
            const hj = J({ x: P, y: P + 110, w: W - P * 2, h: H * (media ? 0.3 : 0.42), maks: pertama ? 96 : 72, warna: w.teks, tekan: w.magenta, lh: 1.1 });
            g.shadowBlur = 0;
            I({ x: P, y: P + 150 + hj, w: W - P * 2, h: (media ? media.y - 30 : H - P * 2.4) - (P + 150 + hj), maks: 34, warna: '#9fd8e0' });
            warnaKaki = w.aksen;
            break;
        }
        case 'terminal-green': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(255,255,255,0.018)'; g.fillRect(0, y, W, 1); }
            g.fillStyle = '#161b22'; g.fillRect(0, 0, W, 76); for (const [i, cw] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) { g.fillStyle = cw; g.beginPath(); g.arc(40 + i * 34, 38, 10, 0, Math.PI * 2); g.fill(); }
            g.font = `400 24px "${fI}"`; g.fillStyle = w.redup; g.textBaseline = 'middle'; g.fillText(`~/${(merek.handle || merek.nama).replace(/^@/, '').toLowerCase().replace(/\s+/g, '-')} — slide ${no}/${n}`, 160, 38);
            g.font = `700 30px "${fI}"`; g.fillStyle = w.aksen; g.textBaseline = 'top'; g.fillText('$', P, 150);
            if (s.gambar) media = { x: P, y: H * 0.54, w: W - P * 2, h: H * 0.26, r: 8 };
            const hj = J({ x: P + 40, y: 146, w: W - P * 2 - 40, h: H * (media ? 0.3 : 0.4), maks: pertama ? 84 : 64, warna: w.aksen, tekan: '#f0f6fc', lh: 1.14 });
            const iy = 196 + hj;
            const tinggiIsi = I({ x: P + 40, y: iy, w: W - P * 2 - 40, h: (media ? media.y - 30 : H - P * 2.4) - iy, maks: 32, warna: w.teks });
            g.fillStyle = w.aksen; g.fillRect(P + 40, iy + tinggiIsi + 20, 22, 38);
            warnaKaki = w.redup;
            break;
        }
        case 'swiss-modern': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = w.garis; g.lineWidth = 2; for (let i = 1; i < 6; i++) { const x = (W / 6) * i; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
            g.fillStyle = w.aksen; g.fillRect(W - W / 6 * 2, 0, W / 6 * 2, pertama ? H * 0.34 : 160);
            g.font = `800 ${pertama ? 200 : 150}px "${fJ}"`; g.fillStyle = '#ffffff'; g.textBaseline = 'top'; g.fillText(String(no), W - W / 6 * 2 + 30, pertama ? H * 0.34 - 220 : 4);
            g.fillStyle = '#000'; g.beginPath(); g.arc(W / 6, H - 220, 40, 0, Math.PI * 2); g.fill();
            if (s.gambar) media = { x: W / 6, y: H * 0.52, w: W / 6 * 4, h: H * 0.28, r: 0 };
            const hj = J({ x: P * 0.6, y: pertama ? H * 0.38 : 260, w: W / 6 * 4.6, h: H * (media ? 0.22 : 0.36), maks: pertama ? 116 : 86, warna: w.teks, tekan: w.aksen, lh: 0.98 });
            I({ x: W / 6, y: (pertama ? H * 0.38 : 260) + hj + 40, w: W / 6 * 4, h: (media ? media.y - 30 : H - 300) - ((pertama ? H * 0.38 : 260) + hj + 40), maks: 34, warna: '#222' });
            warnaKaki = '#000'; aksenProgres = w.aksen;
            break;
        }
        case 'paper-ink': default: {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = w.teks; g.lineWidth = 1.5; g.beginPath(); g.moveTo(P, P + 70); g.lineTo(W - P, P + 70); g.stroke();
            g.font = `italic 400 26px "${fI}"`; g.fillStyle = w.teks2; g.textBaseline = 'top'; g.fillText(merek.nama, P, P + 20); g.textAlign = 'right'; g.fillText(`${no} · ${n}`, W - P, P + 20); g.textAlign = 'left';
            if (s.gambar) media = { x: P, y: H * 0.5, w: W - P * 2, h: H * 0.3, r: 2 };
            const hj = J({ x: P, y: P + 140, w: W - P * 2, h: H * (media ? 0.24 : 0.32), maks: pertama ? 116 : 88, warna: w.teks, tekan: w.aksen, lh: 1.02 });
            g.fillStyle = w.aksen; g.fillRect(P, P + 170 + hj, 120, 4);
            const iy = P + 210 + hj;
            if (s.isi) {
                const huruf = s.isi.trim().charAt(0), sisa = s.isi.trim().slice(1);
                g.font = `700 140px "${fJ}"`; g.fillStyle = w.aksen; g.fillText(huruf, P - 4, iy - 18);
                const lebarHuruf = g.measureText(huruf).width + 18;
                I({ x: P + lebarHuruf, y: iy + 6, w: W - P * 2 - lebarHuruf, h: (media ? media.y - 30 : H - P * 2.4) - iy, maks: 36, warna: w.teks }, sisa);
            }
            warnaKaki = w.teks2;
            break;
        }
    }
    void teksUtama;
    if (media && s.gambar) { try { await pasangGambar(g, s.gambar, media.x, media.y, media.w, media.h, { utuh: s.utuh, r: media.r }); } catch { /* gambar rusak → lewati */ } }

    // Kaki: logo/handle, progres, panah geser
    const kakiY = H - Math.round(P * 0.95);
    let kx = P;
    if (merek.logo && (pertama || akhir)) { try { await pasangGambar(g, merek.logo, P, kakiY - 26, 52, 52, { utuh: true }); kx += 66; } catch { /* */ } }
    g.font = `600 24px "${fI}"`; g.fillStyle = warnaKaki; g.textBaseline = 'middle'; g.globalAlpha = 0.85; g.fillText(merek.handle ? `@${merek.handle.replace(/^@/, '')}` : merek.nama, kx, kakiY); g.globalAlpha = 1;
    if (n > 1) {
        const pw = 200, px = W - P - pw - (akhir ? 0 : 70);
        g.globalAlpha = 0.25; g.fillStyle = warnaKaki; bulat(g, px, kakiY - 4, pw, 8, 4); g.fill(); g.globalAlpha = 1;
        g.fillStyle = aksenProgres; bulat(g, px, kakiY - 4, Math.max(16, (pw * no) / n), 8, 4); g.fill();
        if (!akhir) { g.strokeStyle = warnaKaki; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(W - P - 36, kakiY - 16); g.lineTo(W - P - 16, kakiY); g.lineTo(W - P - 36, kakiY + 16); g.moveTo(W - P - 52, kakiY); g.lineTo(W - P - 18, kakiY); g.stroke(); }
    }
    return c.toBuffer('image/png');
}

/** Render semua slide satu carousel (atau 1 slide untuk feed). */
export async function renderCarousel(gayaId: string, slide: IsiSlide[], merek: InfoMerek, opsi: OpsiRender = {}): Promise<Buffer[]> {
    const out: Buffer[] = [];
    for (let i = 0; i < slide.length; i++) out.push(await renderSlide(gayaId, slide[i], i + 1, slide.length, merek, opsi));
    return out;
}

/** Contoh isi untuk pratinjau gaya (pakai nama & warna akun Pak Rico). */
export function contohSlide(topik: string): IsiSlide[] {
    const t = topik.trim() || 'konten akun ini';
    return [
        { judul: `3 kesalahan **${t.split(/\s+/).slice(0, 3).join(' ')}** yang sering terjadi`, isi: 'Geser untuk lihat cara menghindarinya →', label: 'Tips' },
        { judul: 'Kesalahan #1', isi: 'Mulai tanpa rencana. Tentukan satu tujuan kecil yang bisa dicapai minggu ini, lalu ukur hasilnya.', label: 'Tips' },
        { judul: 'Simpan untuk nanti', isi: 'Ikuti akun ini untuk tips berikutnya setiap minggu.', label: 'Tips' }
    ];
}

/* ── Brand kit: logo, foto profil, cover highlight ── */
export interface KonsepLogo { jenis: 'monogram' | 'wordmark' | 'lencana' | 'garis'; teks: string; sub?: string; font?: string; warna: string; latar: string }
export async function renderLogo(k: KonsepLogo, ukuran = 1080): Promise<Buffer> {
    const { createCanvas } = kanvas();
    const c = createCanvas(ukuran, ukuran), g = c.getContext('2d'), S = ukuran, f = k.font && DAFTAR_FONT.includes(k.font) ? k.font : 'Outfit';
    const latar = hexOk(k.latar) ? k.latar : '#111111', warna = hexOk(k.warna) ? k.warna : kontras(latar);
    g.fillStyle = latar; g.fillRect(0, 0, S, S);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const pas = (teks: string, w8: number, maksPx: number, lebar: number) => { let u = maksPx; for (; u > 20; u -= 4) { g.font = `${w8} ${u}px "${f}"`; if (g.measureText(teks).width <= lebar) break; } return u; };
    if (k.jenis === 'monogram') {
        g.strokeStyle = warna; g.lineWidth = S * 0.018; g.beginPath(); g.arc(S / 2, S / 2, S * 0.34, 0, Math.PI * 2); g.stroke();
        const t = k.teks.slice(0, 3).toUpperCase(); pas(t, 800, S * 0.3, S * 0.5); g.fillStyle = warna; g.fillText(t, S / 2, S / 2 + S * 0.01);
    } else if (k.jenis === 'lencana') {
        g.fillStyle = warna; g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); g.fill();
        const t = k.teks.toUpperCase(); pas(t, 800, S * 0.16, S * 0.56); g.fillStyle = latar; g.fillText(t, S / 2, S / 2 - (k.sub ? S * 0.04 : 0));
        if (k.sub) { pas(k.sub.toUpperCase(), 600, S * 0.05, S * 0.5); g.fillText(k.sub.toUpperCase(), S / 2, S / 2 + S * 0.1); }
    } else if (k.jenis === 'garis') {
        const t = k.teks; pas(t, 700, S * 0.17, S * 0.7); g.fillStyle = warna; g.fillText(t, S / 2, S / 2 - S * 0.03);
        g.fillRect(S * 0.3, S / 2 + S * 0.08, S * 0.4, S * 0.012);
        if (k.sub) { pas(k.sub, 500, S * 0.05, S * 0.6); g.fillText(k.sub, S / 2, S / 2 + S * 0.16); }
    } else {
        const t = k.teks; pas(t, 800, S * 0.2, S * 0.74); g.fillStyle = warna; g.fillText(t, S / 2, S / 2 - (k.sub ? S * 0.03 : 0));
        if (k.sub) { g.globalAlpha = 0.8; pas(k.sub, 500, S * 0.05, S * 0.6); g.fillText(k.sub, S / 2, S / 2 + S * 0.11); g.globalAlpha = 1; }
    }
    return c.toBuffer('image/png');
}
/** Cover highlight IG: lingkaran aman di tengah, teks pendek. */
export async function renderCover(teks: string, latar: string, warna: string, font = 'Outfit', ukuran = 1080): Promise<Buffer> {
    const { createCanvas } = kanvas();
    const c = createCanvas(ukuran, ukuran), g = c.getContext('2d'), S = ukuran;
    const bg = hexOk(latar) ? latar : '#111111', fg = hexOk(warna) ? warna : kontras(bg), f = DAFTAR_FONT.includes(font) ? font : 'Outfit';
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    g.strokeStyle = fg; g.globalAlpha = 0.35; g.lineWidth = S * 0.01; g.beginPath(); g.arc(S / 2, S / 2, S * 0.33, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    const t = teks.trim().slice(0, 14); let u = S * 0.16; for (; u > 30; u -= 4) { g.font = `800 ${u}px "${f}"`; if (g.measureText(t).width <= S * 0.52) break; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, S / 2, S / 2);
    return c.toBuffer('image/png');
}
/** Foto profil dari logo yang sudah ada: logo di tengah lingkaran aman dengan latar warna merek. */
export async function renderFotoProfil(logo: Buffer, latar: string, ukuran = 1080): Promise<Buffer> {
    const { createCanvas } = kanvas();
    const c = createCanvas(ukuran, ukuran), g = c.getContext('2d');
    g.fillStyle = hexOk(latar) ? latar : '#ffffff'; g.fillRect(0, 0, ukuran, ukuran);
    await pasangGambar(g, logo, ukuran * 0.2, ukuran * 0.2, ukuran * 0.6, ukuran * 0.6, { utuh: true });
    return c.toBuffer('image/png');
}
/** Kecilkan gambar untuk thumbnail / dikirim ke AI visi (maks sisi terpanjang). */
export async function kecilkan(buf: Buffer, maks = 768): Promise<Buffer> {
    const { createCanvas, loadImage } = kanvas();
    const im = await loadImage(buf); const sk = Math.min(1, maks / Math.max(im.width, im.height));
    const c = createCanvas(Math.max(1, Math.round(im.width * sk)), Math.max(1, Math.round(im.height * sk)));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toBuffer('image/jpeg', 85);
}
