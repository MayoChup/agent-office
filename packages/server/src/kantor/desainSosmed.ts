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
    ['JetBrainsMono.ttf', 'JetBrains Mono'], ['Archivo.ttf', 'Archivo'], ['Nunito.ttf', 'Nunito'], ['CormorantGaramond.ttf', 'Cormorant Garamond'], ['SourceSerif4.ttf', 'Source Serif 4'], ['Caveat.ttf', 'Caveat']
];
export const DAFTAR_FONT = [...new Set(FONTA.map((f) => f[1]))].filter((f) => f !== 'Caveat');

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
/** Tata letak per slide (supaya carousel tidak monoton). 'klasik' = tata bawaan gaya. */
export const TATA = ['klasik', 'sampul', 'daftar', 'angka', 'banding', 'kutipan', 'foto', 'penutup'] as const;
export type Tata = (typeof TATA)[number];
/** Elemen "dibuat tangan" yang ditempel di slide (digambar kode, gratis). */
export const ELEMEN = ['lingkari', 'garis-bawah', 'stabilo', 'panah', 'catatan', 'selotip', 'polaroid', 'stiker', 'harga', 'cap', 'lokasi', 'bintang', 'tekstur', 'maskot'] as const;
export interface Elemen { jenis: string; teks?: string }
export interface IsiSlide {
    judul: string; isi?: string; label?: string; gambar?: Buffer | null; /** produk/logo transparan: ditampilkan utuh (contain); foto: memenuhi bingkai (cover) */ utuh?: boolean;
    tata?: Tata; angka?: string; poin?: string[]; kiri?: string; kanan?: string; labelKiri?: string; labelKanan?: string; kutipan?: string; sumber?: string;
    elemen?: Elemen[]; /** gambar elemen konten (mis. ilustrasi kulkas, latar transparan) */ gambar2?: Buffer | null; maskot?: Buffer | null; komentar?: { teks: string; nama: string } | null;
}
export interface InfoMerek { nama: string; handle?: string; warna?: string[]; logo?: Buffer | null; fontJudul?: string; fontIsi?: string; aksenMerek?: boolean }
export interface OpsiRender { w?: number; h?: number }

const hexOk = (s?: string) => !!s && /^#[0-9a-f]{6}$/i.test(s);
function terang(hex: string) { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
const kontras = (bg: string) => (terang(bg) > 0.6 ? '#111111' : '#ffffff');
function lum(hex: string) { const n = parseInt(hex.slice(1), 16); const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); }
function jenuh(hex: string) { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
function rasioKontras(a: string, b: string) { if (!hexOk(a) || !hexOk(b)) return 1; const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

/** Kata dengan bagian yang ditekankan. "**kata**?" → [{t:"kata",tekan:true},{t:"?",tekan:false}] */
type Kata = Array<{ t: string; tekan: boolean }>;
function urai(teks: string): Kata[] {
    const bagian = String(teks || '').replace(/\s+/g, ' ').trim().split('**');
    const kata: Kata[] = []; let kini: Kata = [];
    bagian.forEach((b, i) => {
        const tekan = i % 2 === 1;
        b.split(/( )/).forEach((p) => {
            if (p === ' ') { if (kini.length) kata.push(kini); kini = []; }
            else if (p) kini.push({ t: p, tekan });
        });
    });
    if (kini.length) kata.push(kini);
    return kata;
}
const polos = (k: Kata) => k.map((x) => x.t).join('');
/** Pecah teks jadi baris yang muat di lebar tertentu. */
function bungkus(g: any, kata: Kata[], lebar: number): Kata[][] {
    const baris: Kata[][] = []; let kini: Kata[] = [];
    const ukur = (ws: Kata[]) => g.measureText(ws.map(polos).join(' ')).width;
    for (const k of kata) {
        if (kini.length && ukur([...kini, k]) > lebar) { baris.push(kini); kini = [k]; } else kini.push(k);
    }
    if (kini.length) baris.push(kini);
    return baris;
}
/** Kotak kata yang ditekankan (**…**) pada blok judul terakhir — dipakai elemen coretan (lingkari, garis bawah, stabilo). */
let kotakTekan: Array<{ x: number; y: number; w: number; h: number }> = [];
let catatKotak = false;
/** Tulis blok teks yang mengecil sendiri sampai muat di kotak. Mengembalikan tinggi yang dipakai. */
function blok(g: any, teks: string, o: { x: number; y: number; w: number; h: number; f: string; w8: number; italic?: boolean; maks: number; min: number; warna: string; tekan?: string; lh?: number; rata?: 'kiri' | 'tengah'; huruf?: number; kering?: boolean }): number {
    if (!teks) return 0;
    const kata = urai(teks);
    let ukuran = o.maks, baris: Kata[][] = [];
    const lh = o.lh || 1.12;
    const lebarBaris = (b: Kata[]) => g.measureText(b.map(polos).join(' ')).width;
    for (; ukuran >= o.min; ukuran -= 2) {
        g.font = `${o.italic ? 'italic ' : ''}${o.w8} ${ukuran}px "${o.f}"`;
        baris = bungkus(g, kata, o.w);
        if (baris.length * ukuran * lh <= o.h && baris.every((b) => lebarBaris(b) <= o.w)) break;
    }
    ukuran = Math.max(ukuran, o.min);
    g.font = `${o.italic ? 'italic ' : ''}${o.w8} ${ukuran}px "${o.f}"`; g.textBaseline = 'top';
    let y = o.y;
    for (const b of baris) {
        let x = o.rata === 'tengah' ? o.x + (o.w - lebarBaris(b)) / 2 : o.x;
        b.forEach((k, i) => {
            for (const seg of k) {
                const lw = g.measureText(seg.t).width;
                if (seg.tekan && catatKotak) {
                    const akhir = kotakTekan[kotakTekan.length - 1];
                    if (akhir && Math.abs(akhir.y - y) < 2 && x - (akhir.x + akhir.w) < g.measureText(' ').width + 3) akhir.w = x + lw - akhir.x; else kotakTekan.push({ x, y, w: lw, h: ukuran });
                }
                g.fillStyle = seg.tekan && o.tekan ? o.tekan : o.warna;
                if (!o.kering) g.fillText(seg.t, x, y);
                x += lw;
            }
            if (i < b.length - 1) x += g.measureText(' ').width;
        });
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

/* ── Tata letak per slide ── */
interface Token { a: { x: number; y: number; w: number; h: number }; teks: string; teks2: string; aksen: string; tekan: string; kartu: string; garis: string; kaki: string; progres: string; gelap: boolean; rata?: 'kiri' | 'tengah' }
type Kotak = { x: number; y: number; w: number; h: number; r?: number };

/** Latar & ciri khas tiap gaya tanpa isi; mengembalikan area isi + warna. */
function dasar(g: any, st: GayaDesain, w: Record<string, string>, W: number, H: number, P: number, no: number, n: number, merek: InfoMerek, s: IsiSlide, fJ: string, fI: string): Token {
    const nomor = `${String(no).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    const atas = P + 90, bawah = H - P * 1.9;
    const label = (x: number, y: number, teks: string, bg: string, fg: string) => { g.font = `700 24px "${fI}"`; const tw = g.measureText(teks).width + 36; g.fillStyle = bg; bulat(g, x, y, tw, 48, 24); g.fill(); g.fillStyle = fg; g.textBaseline = 'middle'; g.fillText(teks, x + 18, y + 25); return tw; };
    g.textAlign = 'left';
    switch (st.id) {
        case 'bold-signal': {
            const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, w.bg); gr.addColorStop(0.5, w.bg2); gr.addColorStop(1, w.bg); g.fillStyle = gr; g.fillRect(0, 0, W, H);
            const kx = P * 0.6, ky = P * 1.5, kw = W - kx * 2, kh = H - ky - P * 1.75;
            g.fillStyle = w.aksen; bulat(g, kx, ky, kw, kh, 28); g.fill();
            g.font = `500 26px "${fI}"`; g.fillStyle = w.teks; g.globalAlpha = 0.6; g.textBaseline = 'top'; g.fillText((s.label || merek.nama).toUpperCase(), kx, P * 0.75); g.textAlign = 'right'; g.fillText(nomor, kx + kw, P * 0.75); g.textAlign = 'left'; g.globalAlpha = 1;
            const tk = w.teksKartu, tkn = w.tekanKartu || (tk === '#ffffff' ? '#1a1a1a' : '#ffffff'); return { a: { x: kx + 48, y: ky + 48, w: kw - 96, h: kh - 96 }, teks: tk, teks2: tk, aksen: tkn, tekan: tkn, kartu: 'rgba(0,0,0,0.14)', garis: 'rgba(0,0,0,0.25)', kaki: w.teks, progres: w.aksen, gelap: tk === '#ffffff' };
        }
        case 'electric-studio': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H); g.fillStyle = w.aksen; g.fillRect(0, 0, 22, H); g.fillRect(0, H - 14, W, 14);
            g.fillStyle = w.gelap; g.fillRect(P, P, 14, 92); g.font = `800 28px "${fJ}"`; g.textBaseline = 'top'; g.fillText(merek.nama, P + 34, P + 4);
            g.font = `500 24px "${fI}"`; g.globalAlpha = 0.55; g.fillText(nomor, P + 34, P + 44); g.globalAlpha = 1;
            return { a: { x: P, y: atas + 40, w: W - P * 2, h: bawah - atas - 40 }, teks: w.teks, teks2: '#333333', aksen: w.aksen, tekan: w.aksen, kartu: '#f1f3fb', garis: '#d7dbea', kaki: w.gelap, progres: w.aksen, gelap: false };
        }
        case 'creative-voltage': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H); g.fillStyle = w.aksen; g.fillRect(0, 0, W, 18);
            g.fillStyle = 'rgba(255,255,255,0.10)'; for (let y = H - 300; y < H; y += 28) for (let x = W - 300 + ((y / 28) % 2) * 14; x < W; x += 28) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
            label(P, P, (s.label || `#${String(no).padStart(2, '0')}`).toUpperCase(), w.neon, '#111111');
            return { a: { x: P, y: atas + 30, w: W - P * 2, h: bawah - atas - 30 }, teks: '#ffffff', teks2: '#d8d8e8', aksen: w.neon, tekan: w.neon, kartu: 'rgba(255,255,255,0.07)', garis: 'rgba(255,255,255,0.18)', kaki: '#ffffff', progres: w.neon, gelap: true };
        }
        case 'dark-botanical': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            const bola = (x: number, y: number, r: number, warna: string, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, warna); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; };
            bola(W * 0.95, H * 0.06, 380, w.aksen, 0.45); bola(W * 0.02, H * 0.97, 360, w.emas, 0.22);
            g.font = `italic 400 30px "${fJ}"`; g.fillStyle = w.teks2; g.textBaseline = 'top'; g.fillText(s.label || merek.nama, P, P); g.textAlign = 'right'; g.fillText(nomor, W - P, P); g.textAlign = 'left';
            return { a: { x: P, y: atas + 30, w: W - P * 2, h: bawah - atas - 30 }, teks: w.teks, teks2: w.teks2, aksen: w.aksen, tekan: w.aksen, kartu: 'rgba(255,255,255,0.05)', garis: 'rgba(212,165,116,0.35)', kaki: w.teks2, progres: w.aksen, gelap: true };
        }
        case 'notebook-tabs': {
            g.fillStyle = w.luar; g.fillRect(0, 0, W, H);
            const kx = 56, ky = 56, kw = W - 56 - 96, kh = H - 112;
            g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 30; g.fillStyle = w.bg; bulat(g, kx, ky, kw, kh, 14); g.fill(); g.shadowBlur = 0;
            const tab = [w.t1, w.t2, w.t3, w.t4, w.t5]; for (let i = 0; i < 5; i++) { g.fillStyle = tab[i]; bulat(g, kx + kw - 8, ky + 80 + i * 150, 66, 130, 10); g.fill(); }
            for (let i = 0; i < 3; i++) { g.fillStyle = w.luar; g.beginPath(); g.arc(kx + 34, ky + kh * (0.25 + i * 0.25), 12, 0, Math.PI * 2); g.fill(); }
            g.font = `500 24px "${fI}"`; g.fillStyle = '#1a1a1a'; g.globalAlpha = 0.5; g.textBaseline = 'top'; g.fillText(`${s.label || merek.nama} · ${nomor}`, kx + 90, ky + 56); g.globalAlpha = 1;
            return { a: { x: kx + 90, y: ky + 120, w: kw - 150, h: kh - 120 - 110 }, teks: w.teks, teks2: '#333333', aksen: '#7c5cc4', tekan: '#7c5cc4', kartu: '#efece4', garis: '#d9d4c7', kaki: '#1a1a1a', progres: '#7c5cc4', gelap: false };
        }
        case 'pastel-geometry': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            const kx = 60, ky = 70, kw = W - 60 - 150, kh = H - 140;
            g.shadowColor = 'rgba(40,60,90,0.18)'; g.shadowBlur = 40; g.shadowOffsetY = 10; g.fillStyle = w.kartu; bulat(g, kx, ky, kw, kh, 40); g.fill(); g.shadowBlur = 0; g.shadowOffsetY = 0;
            const pil = [w.p1, w.p2, w.p3, w.p4, w.aksen], tinggi = [120, 190, 260, 190, 120];
            let py = H / 2 - tinggi.reduce((a, b) => a + b + 18, 0) / 2; for (let i = 0; i < 5; i++) { g.fillStyle = pil[i]; bulat(g, W - 120, py, 58, tinggi[i], 29); g.fill(); py += tinggi[i] + 18; }
            label(kx + 60, ky + 56, `${no} / ${n}`, w.p2, '#1a1a1a');
            return { a: { x: kx + 60, y: ky + 140, w: kw - 120, h: kh - 140 - 110 }, teks: w.teks, teks2: '#3a3a3a', aksen: w.aksen, tekan: w.aksen, kartu: '#f0eef5', garis: '#dcd8e6', kaki: '#1a1a1a', progres: w.aksen, gelap: false };
        }
        case 'split-pastel': {
            const bagi = Math.round(W * 0.5); g.fillStyle = w.kiri; g.fillRect(0, 0, bagi, H); g.fillStyle = w.kanan; g.fillRect(bagi, 0, W - bagi, H);
            g.strokeStyle = 'rgba(26,26,26,0.07)'; g.lineWidth = 2; for (let x = bagi + 40; x < W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 40; y < H; y += 54) { g.beginPath(); g.moveTo(bagi, y); g.lineTo(W, y); g.stroke(); }
            const lw = label(P, P, s.label || merek.nama, w.b1, '#1a1a1a'); label(P + lw + 12, P, `${no}/${n}`, w.b2, '#1a1a1a');
            return { a: { x: P, y: atas + 30, w: W - P * 2, h: bawah - atas - 30 }, teks: w.teks, teks2: '#2b2b2b', aksen: '#c2185b', tekan: '#c2185b', kartu: 'rgba(255,255,255,0.65)', garis: 'rgba(26,26,26,0.15)', kaki: '#1a1a1a', progres: '#1a1a1a', gelap: false };
        }
        case 'vintage-editorial': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.beginPath(); g.arc(W - P - 50, P + 50, 50, 0, Math.PI * 2); g.stroke();
            g.beginPath(); g.moveTo(W - P - 230, P + 130); g.lineTo(W - P, P + 130); g.stroke(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(W - P - 256, P + 130, 8, 0, Math.PI * 2); g.fill();
            g.font = `italic 400 30px "${fJ}"`; g.fillStyle = w.teks2; g.textBaseline = 'top'; g.fillText(`No. ${no}`, P, P + 20);
            return { a: { x: P, y: atas + 70, w: W - P * 2, h: bawah - atas - 70 }, teks: w.teks, teks2: w.teks2, aksen: '#a0522d', tekan: '#a0522d', kartu: '#ece6da', garis: '#1a1a1a', kaki: w.teks, progres: '#1a1a1a', gelap: false };
        }
        case 'neon-cyber': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = 'rgba(0,255,204,0.08)'; g.lineWidth = 1; for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
            g.font = `400 24px "${fI}"`; g.fillStyle = w.aksen; g.textBaseline = 'top'; g.fillText(`// ${String(no).padStart(2, '0')}_${(s.label || merek.nama).toUpperCase().replace(/\s+/g, '_')}`, P, P);
            return { a: { x: P, y: atas + 20, w: W - P * 2, h: bawah - atas - 20 }, teks: w.teks, teks2: '#9fd8e0', aksen: w.aksen, tekan: w.magenta, kartu: 'rgba(0,255,204,0.06)', garis: 'rgba(0,255,204,0.35)', kaki: w.aksen, progres: w.aksen, gelap: true };
        }
        case 'terminal-green': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(255,255,255,0.018)'; g.fillRect(0, y, W, 1); }
            g.fillStyle = '#161b22'; g.fillRect(0, 0, W, 76); for (const [i, cw] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) { g.fillStyle = cw; g.beginPath(); g.arc(40 + i * 34, 38, 10, 0, Math.PI * 2); g.fill(); }
            g.font = `400 24px "${fI}"`; g.fillStyle = w.redup; g.textBaseline = 'middle'; g.fillText(`~/${(merek.handle || merek.nama).replace(/^@/, '').toLowerCase().replace(/\s+/g, '-')} — slide ${no}/${n}`, 160, 38);
            return { a: { x: P, y: 150, w: W - P * 2, h: bawah - 150 }, teks: w.teks, teks2: w.redup, aksen: w.aksen, tekan: '#f0f6fc', kartu: '#161b22', garis: '#30363d', kaki: w.redup, progres: w.aksen, gelap: true };
        }
        case 'swiss-modern': {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = w.garis; g.lineWidth = 2; for (let i = 1; i < 6; i++) { const x = (W / 6) * i; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
            g.fillStyle = w.aksen; g.fillRect(W - W / 6, 0, W / 6, 150); g.font = `800 96px "${fJ}"`; g.fillStyle = '#ffffff'; g.textBaseline = 'top'; g.textAlign = 'center'; g.fillText(String(no), W - W / 12, 26); g.textAlign = 'left';
            return { a: { x: P * 0.7, y: 200, w: W - P * 0.7 - W / 6 - 20, h: bawah - 200 }, teks: w.teks, teks2: '#222222', aksen: w.aksen, tekan: w.aksen, kartu: '#f4f4f4', garis: '#000000', kaki: '#000000', progres: w.aksen, gelap: false };
        }
        case 'paper-ink': default: {
            g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
            g.strokeStyle = w.teks; g.lineWidth = 1.5; g.beginPath(); g.moveTo(P, P + 70); g.lineTo(W - P, P + 70); g.stroke();
            g.font = `italic 400 26px "${fI}"`; g.fillStyle = w.teks2; g.textBaseline = 'top'; g.fillText(merek.nama, P, P + 20); g.textAlign = 'right'; g.fillText(`${no} · ${n}`, W - P, P + 20); g.textAlign = 'left';
            return { a: { x: P, y: P + 130, w: W - P * 2, h: bawah - P - 130 }, teks: w.teks, teks2: w.teks2, aksen: w.aksen, tekan: w.aksen, kartu: '#f1eee8', garis: w.teks, kaki: w.teks2, progres: w.aksen, gelap: false };
        }
    }
}

/** Isi slide menurut tata letaknya. Mengembalikan kotak gambar (untuk elemen panah/selotip). */
async function isiTata(g: any, tata: Tata, t: Token, s: IsiSlide, o: { W: number; H: number; P: number; pertama: boolean; J: (o: any, teks?: string) => number; I: (o: any, teks?: string) => number; fJ: string; fI: string; st: GayaDesain }): Promise<Kotak | null> {
    const A = t.a, ada = (j: string) => !!s.elemen?.some((e) => e.jenis === j);
    const hias = { polaroid: ada('polaroid'), stiker: ada('stiker'), selotip: ada('selotip') };
    const gb = s.gambar || null, gb2 = s.gambar2 || null;
    // Gambar pendamping (aset gudang atau elemen AI) untuk tata yang memberi ruang gambar kecil.
    const pendamping = async (k: Kotak, putar = 0) => {
        const buf = gb || gb2; if (!buf) return null;
        const utuh = gb ? s.utuh !== false : true;
        return gambarHias(g, buf, k, { utuh, ...hias, putar, stiker: hias.stiker || (!gb && !!gb2) });
    };
    switch (tata) {
        case 'sampul': {
            const adaGb = !!(gb || gb2), hJudul = adaGb ? A.h * 0.5 : A.h * 0.72;
            const hj = o.J({ x: A.x, y: A.y, w: A.w, h: hJudul, maks: 132, warna: t.teks, tekan: t.tekan, lh: 1.0 });
            const hi = o.I({ x: A.x, y: A.y + hj + 30, w: adaGb ? A.w * 0.46 : A.w, h: A.h * 0.2, maks: 36, warna: t.teks2 });
            if (!adaGb) return null;
            const sisi = Math.min(A.w * 0.52, A.y + A.h - (A.y + hj + 20));
            return pendamping({ x: A.x + A.w - sisi, y: A.y + A.h - sisi, w: sisi, h: sisi, r: 20 }, -0.06);
            void hi;
        }
        case 'daftar': {
            const hj = o.J({ x: A.x, y: A.y, w: A.w, h: A.h * 0.26, maks: 76, warna: t.teks, tekan: t.tekan, lh: 1.04 });
            const poin = (s.poin?.length ? s.poin : String(s.isi || '').split(/\n|;|•/)).map((x) => x.trim()).filter(Boolean).slice(0, 6);
            const adaGb = !!(gb || gb2);
            let y = A.y + hj + 44; const lebar = adaGb ? A.w * 0.66 : A.w, sisaH = A.y + A.h - y, per = Math.min(150, sisaH / Math.max(1, poin.length));
            poin.forEach((p, i) => {
                // penanda: centang dalam lingkaran
                g.fillStyle = t.aksen; g.beginPath(); g.arc(A.x + 24, y + 26, 24, 0, Math.PI * 2); g.fill();
                g.strokeStyle = t.gelap && kontras(t.aksen) === '#111111' ? '#111111' : kontras(t.aksen); g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
                g.beginPath(); g.moveTo(A.x + 13, y + 27); g.lineTo(A.x + 21, y + 35); g.lineTo(A.x + 36, y + 17); g.stroke();
                o.I({ x: A.x + 68, y: y + 4, w: lebar - 68, h: per - 18, maks: 40, warna: t.teks, lh: 1.25 }, p);
                if (i < poin.length - 1) { g.strokeStyle = t.garis; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.beginPath(); g.moveTo(A.x + 68, y + per - 10); g.lineTo(A.x + lebar, y + per - 10); g.stroke(); g.globalAlpha = 1; }
                y += per;
            });
            if (!adaGb) return null;
            const sisi = A.w * 0.32; return pendamping({ x: A.x + A.w - sisi, y: A.y + hj + 40, w: sisi, h: sisi, r: 16 }, 0.05);
        }
        case 'angka': {
            const angka = String(s.angka || '').slice(0, 10) || '1';
            let u = 330; g.textBaseline = 'top'; for (; u > 90; u -= 10) { g.font = `${o.st.judul.w} ${u}px "${o.fJ}"`; if (g.measureText(angka).width <= A.w) break; }
            g.fillStyle = t.aksen; g.fillText(angka, A.x - u * 0.03, A.y);
            const ya = A.y + u * 0.98;
            g.fillStyle = t.aksen; g.fillRect(A.x, ya + 10, 90, 8);
            const hj = o.J({ x: A.x, y: ya + 50, w: A.w, h: A.h * 0.24, maks: 72, warna: t.teks, tekan: t.tekan, lh: 1.05 });
            o.I({ x: A.x, y: ya + 70 + hj, w: (gb || gb2) ? A.w * 0.6 : A.w, h: A.y + A.h - (ya + 70 + hj), maks: 38, warna: t.teks2 });
            if (!(gb || gb2)) return null;
            const sisi = A.w * 0.34; return pendamping({ x: A.x + A.w - sisi, y: A.y + A.h - sisi, w: sisi, h: sisi, r: 16 }, -0.05);
        }
        case 'banding': {
            const hj = o.J({ x: A.x, y: A.y, w: A.w, h: A.h * 0.22, maks: 72, warna: t.teks, tekan: t.tekan, lh: 1.04 });
            const y0 = A.y + hj + 36, tinggi = (A.y + A.h - y0 - 24) / 2;
            const kartu = (y: number, salah: boolean, judul: string, isi: string) => {
                g.fillStyle = t.kartu; bulat(g, A.x, y, A.w, tinggi, 22); g.fill();
                const warna = salah ? '#e5484d' : '#30a46c';
                g.fillStyle = warna; g.beginPath(); g.arc(A.x + 50, y + 52, 26, 0, Math.PI * 2); g.fill();
                g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath();
                if (salah) { g.moveTo(A.x + 40, y + 42); g.lineTo(A.x + 60, y + 62); g.moveTo(A.x + 60, y + 42); g.lineTo(A.x + 40, y + 62); } else { g.moveTo(A.x + 38, y + 53); g.lineTo(A.x + 47, y + 62); g.lineTo(A.x + 63, y + 42); }
                g.stroke();
                g.font = `700 30px "${o.fI}"`; g.fillStyle = warna; g.textBaseline = 'middle'; g.fillText(judul, A.x + 92, y + 53);
                const ht = o.I({ x: A.x + 36, y: 0, w: A.w - 72, h: tinggi - 124, maks: 46, warna: t.teks, lh: 1.3, kering: true }, isi); o.I({ x: A.x + 36, y: y + 100 + Math.max(0, (tinggi - 124 - ht) / 2), w: A.w - 72, h: tinggi - 124, maks: 46, warna: t.teks, lh: 1.3 }, isi);
            };
            kartu(y0, true, s.labelKiri || 'Salah', s.kiri || ''); kartu(y0 + tinggi + 24, false, s.labelKanan || 'Benar', s.kanan || '');
            return null;
        }
        case 'kutipan': {
            g.font = `700 260px "${o.fJ}"`; g.fillStyle = t.aksen; g.textBaseline = 'top'; g.globalAlpha = 0.9; g.fillText('“', A.x - 10, A.y - 60); g.globalAlpha = 1;
            const hj = o.J({ x: A.x, y: A.y + 150, w: A.w, h: A.h * 0.55, maks: 80, warna: t.teks, tekan: t.tekan, lh: 1.12, italic: true }, s.kutipan || s.judul);
            if (s.sumber) { g.font = `600 30px "${o.fI}"`; g.fillStyle = t.teks2; g.textBaseline = 'top'; g.fillText(`— ${s.sumber}`, A.x, A.y + 190 + hj); }
            if (s.isi && s.kutipan) o.I({ x: A.x, y: A.y + 260 + hj, w: A.w, h: A.y + A.h - (A.y + 260 + hj), maks: 34, warna: t.teks2 });
            return null;
        }
        case 'foto': {
            const k = { x: A.x, y: A.y, w: A.w, h: A.h * 0.66, r: 24 };
            await gambarHias(g, gb!, k, { utuh: false, ...hias });
            const hj = o.J({ x: A.x, y: k.y + k.h + 30, w: A.w, h: A.h * 0.2, maks: 68, warna: t.teks, tekan: t.tekan, lh: 1.04 });
            o.I({ x: A.x, y: k.y + k.h + 50 + hj, w: A.w, h: A.y + A.h - (k.y + k.h + 50 + hj), maks: 34, warna: t.teks2 });
            return k;
        }
        case 'penutup': {
            const adaGb = !!(s.maskot || gb || gb2);
            const hj = o.J({ x: A.x, y: A.y + (adaGb ? 0 : A.h * 0.12), w: A.w, h: A.h * 0.36, maks: 104, warna: t.teks, tekan: t.tekan, lh: 1.02, rata: 'tengah' });
            const y1 = A.y + (adaGb ? 0 : A.h * 0.12) + hj + 26;
            const hi = o.I({ x: A.x, y: y1, w: A.w, h: A.h * 0.16, maks: 36, warna: t.teks2, rata: 'tengah' });
            // Ikon simpan · bagikan · ikuti
            const yI = y1 + hi + 50, cx = A.x + A.w / 2;
            const ikon = [(x: number, y: number) => { g.beginPath(); g.moveTo(x - 18, y - 26); g.lineTo(x + 18, y - 26); g.lineTo(x + 18, y + 26); g.lineTo(x, y + 12); g.lineTo(x - 18, y + 26); g.closePath(); g.stroke(); },
                (x: number, y: number) => { g.beginPath(); g.moveTo(x - 24, y + 4); g.lineTo(x + 24, y - 22); g.lineTo(x + 6, y + 24); g.lineTo(x - 2, y + 4); g.closePath(); g.stroke(); },
                (x: number, y: number) => { g.beginPath(); g.arc(x - 6, y - 10, 13, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x - 6, y + 26, 24, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); g.beginPath(); g.moveTo(x + 22, y - 6); g.lineTo(x + 22, y + 14); g.moveTo(x + 12, y + 4); g.lineTo(x + 32, y + 4); g.stroke(); }];
            const tulisan = ['Simpan', 'Bagikan', 'Ikuti'];
            ikon.forEach((f, i) => { const x = cx + (i - 1) * 190; g.fillStyle = t.kartu; g.beginPath(); g.arc(x, yI + 40, 56, 0, Math.PI * 2); g.fill(); g.strokeStyle = t.aksen; g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round'; f(x, yI + 40); g.font = `600 24px "${o.fI}"`; g.fillStyle = t.teks2; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(tulisan[i], x, yI + 108); g.textAlign = 'left'; });
            const buf = s.maskot || gb || gb2; if (!buf) return null;
            const sisi = Math.min(A.w * 0.42, A.y + A.h - (yI + 150));
            if (sisi < 120) return null;
            const k = { x: cx - sisi / 2, y: A.y + A.h - sisi, w: sisi, h: sisi };
            await gambarHias(g, buf, k, { utuh: true, stiker: !s.maskot && hias.stiker });
            return k;
        }
    }
    return null;
}

/** Gambar dengan hiasan: polaroid, stiker berpinggiran putih, selotip, sedikit diputar. */
async function gambarHias(g: any, buf: Buffer, k: Kotak, o: { utuh?: boolean; polaroid?: boolean; stiker?: boolean; selotip?: boolean; putar?: number }): Promise<Kotak> {
    let nyata: Kotak = k;
    const { loadImage, createCanvas } = kanvas();
    const im = await loadImage(buf);
    g.save();
    const cx = k.x + k.w / 2, cy = k.y + k.h / 2;
    const putar = o.putar ?? (o.polaroid ? -0.04 : 0);
    g.translate(cx, cy); g.rotate(putar); g.translate(-cx, -cy);
    if (o.polaroid) {
        const pad = k.w * 0.05, bawah = k.w * 0.16;
        g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = '#fdfdfb'; g.fillRect(k.x, k.y, k.w, k.h); g.shadowColor = 'transparent';
        const ix = k.x + pad, iy = k.y + pad, iw = k.w - pad * 2, ih = k.h - pad - bawah;
        const sk = Math.max(iw / im.width, ih / im.height); g.save(); g.beginPath(); g.rect(ix, iy, iw, ih); g.clip(); g.drawImage(im, ix + (iw - im.width * sk) / 2, iy + (ih - im.height * sk) / 2, im.width * sk, im.height * sk); g.restore();
    } else if (o.stiker || o.utuh) {
        const sk = Math.min(k.w / im.width, k.h / im.height), dw = im.width * sk, dh = im.height * sk, dx = k.x + (k.w - dw) / 2, dy = k.y + (k.h - dh) / 2;
        nyata = { x: dx, y: dy, w: dw, h: dh };
        if (o.stiker) {
            // siluet putih di sekeliling gambar transparan = pinggiran stiker
            const tb = Math.max(6, Math.round(Math.min(dw, dh) * 0.03));
            const c2 = createCanvas(Math.ceil(dw + tb * 2), Math.ceil(dh + tb * 2)), g2 = c2.getContext('2d');
            for (let a = 0; a < 16; a++) { const r = (a / 16) * Math.PI * 2; g2.drawImage(im, tb + Math.cos(r) * tb, tb + Math.sin(r) * tb, dw, dh); }
            g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, c2.width, c2.height);
            g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 18; g.shadowOffsetY = 8; g.drawImage(c2, dx - tb, dy - tb); g.shadowColor = 'transparent';
        } else { g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 24; g.shadowOffsetY = 10; }
        g.drawImage(im, dx, dy, dw, dh); g.shadowColor = 'transparent';
    } else {
        const sk = Math.max(k.w / im.width, k.h / im.height);
        g.save(); bulat(g, k.x, k.y, k.w, k.h, k.r ?? 24); g.clip(); g.drawImage(im, k.x + (k.w - im.width * sk) / 2, k.y + (k.h - im.height * sk) / 2, im.width * sk, im.height * sk); g.restore();
    }
    if (o.selotip) {
        const pita = (x: number, y: number, r: number) => { g.save(); g.translate(x, y); g.rotate(r); g.fillStyle = 'rgba(244, 226, 170, 0.82)'; g.fillRect(-70, -22, 140, 44); g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = -70; i < 70; i += 10) g.fillRect(i, -22, 4, 44); g.restore(); };
        pita(k.x + 30, k.y + 6, -0.6); pita(k.x + k.w - 30, k.y + 6, 0.6);
    }
    g.restore();
    return nyata;
}

/** Garis bergaya tangan: sedikit goyang supaya tidak terlihat seperti garis komputer. */
function goyang(i: number) { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x) - 0.5; }
/** Elemen dibuat-tangan di atas slide. */
async function hiasi(g: any, s: IsiSlide, o: { W: number; H: number; P: number; media: Kotak | null; tekan: string; teks: string; gelap: boolean; fJ: string; pertama: boolean; akhir: boolean }) {
    const el = (s.elemen || []).slice(0, 3); if (!el.length) return;
    const { W, H, P } = o, kt = kotakTekan[0];
    const coret = o.tekan;
    const tangan = (teks: string, x: number, y: number, ukuran: number, warna: string, putar = -0.05, rata: 'left' | 'center' = 'left') => { g.save(); g.translate(x, y); g.rotate(putar); g.font = `700 ${ukuran}px "Caveat"`; g.fillStyle = warna; g.textBaseline = 'middle'; g.textAlign = rata; g.fillText(teks, 0, 0); const lb = g.measureText(teks).width; g.restore(); return lb; };
    for (const [i, e] of el.entries()) {
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
        switch (e.jenis) {
            case 'lingkari': {
                if (!kt) break;
                g.strokeStyle = coret; g.lineWidth = 6; g.beginPath();
                const cx = kt.x + kt.w / 2, cy = kt.y + kt.h * 0.55, rx = kt.w / 2 + 20, ry = kt.h * 0.56 + 6;
                for (let a = 0; a <= 1.08; a += 0.02) { const t = -0.4 + a * Math.PI * 2, j = 1 + goyang(a * 40) * 0.05; const x = cx + Math.cos(t) * rx * j, y = cy + Math.sin(t) * ry * j; a === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
                g.stroke(); break;
            }
            case 'garis-bawah': {
                if (!kt) break;
                g.strokeStyle = coret; g.lineWidth = 7; g.beginPath();
                const y = kt.y + kt.h * 1.02; g.moveTo(kt.x - 6, y + 4); for (let x = kt.x; x <= kt.x + kt.w + 10; x += 14) g.lineTo(x, y + goyang(x) * 8);
                g.moveTo(kt.x + kt.w * 0.1, y + 16); g.lineTo(kt.x + kt.w * 0.85, y + 12); g.stroke(); break;
            }
            case 'stabilo': break; // sudah digambar di belakang teks (lihat J)
            case 'panah': {
                if (!o.media) break;
                const m = o.media, kanan = m.x + m.w + 150 < W, dari = kanan ? { x: m.x + m.w + 110, y: m.y - 50 } : { x: m.x - 110, y: m.y - 50 }, ke = kanan ? { x: m.x + m.w - 10, y: m.y + m.h * 0.25 } : { x: m.x + 10, y: m.y + m.h * 0.25 };
                g.strokeStyle = coret; g.lineWidth = 6; g.beginPath(); g.moveTo(dari.x, dari.y);
                const kx = (dari.x + ke.x) / 2 + (kanan ? 50 : -50), ky = (dari.y + ke.y) / 2 - 10; g.quadraticCurveTo(kx, ky, ke.x, ke.y); g.stroke();
                const sud = Math.atan2(ke.y - ky, ke.x - kx); g.beginPath(); g.moveTo(ke.x, ke.y); g.lineTo(ke.x - Math.cos(sud - 0.5) * 30, ke.y - Math.sin(sud - 0.5) * 30); g.moveTo(ke.x, ke.y); g.lineTo(ke.x - Math.cos(sud + 0.5) * 30, ke.y - Math.sin(sud + 0.5) * 30); g.stroke();
                if (e.teks) tangan(e.teks.slice(0, 24), dari.x, dari.y - 34, 46, coret, -0.06, 'center');
                break;
            }
            case 'catatan': {
                const t = (e.teks || '').slice(0, 40); if (!t) break;
                const x = o.media ? Math.max(P, o.media.x - 20) : P + 10, y = o.media ? Math.max(P * 2, o.media.y - 60) : H - P * 2.6;
                tangan(t, x, y, 50, coret, -0.05);
                break;
            }
            case 'harga': case 'cap': {
                const t = (e.teks || (e.jenis === 'cap' ? 'BARU' : '')).slice(0, 14); if (!t) break;
                const r = e.jenis === 'harga' ? 112 : 104, m = o.media, x = m ? Math.min(W - r - 20, m.x + m.w - r * 0.4) : W - P - r + 10, y = m ? Math.max(r + 20, m.y + r * 0.5) : H - P * 2 - r - 40;
                g.translate(x, y); g.rotate(e.jenis === 'harga' ? 0.18 : -0.22);
                if (e.jenis === 'harga') { g.fillStyle = '#ffd60a'; g.beginPath(); for (let a = 0; a < 32; a++) { const t2 = (a / 32) * Math.PI * 2, rr = a % 2 ? r * 0.86 : r; a === 0 ? g.moveTo(Math.cos(t2) * rr, Math.sin(t2) * rr) : g.lineTo(Math.cos(t2) * rr, Math.sin(t2) * rr); } g.closePath(); g.fill(); g.fillStyle = '#111111'; }
                else { g.strokeStyle = coret; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r - 14, 0, Math.PI * 2); g.stroke(); g.fillStyle = coret; }
                let u = 64; for (; u > 22; u -= 2) { g.font = `800 ${u}px "${o.fJ}"`; if (g.measureText(t).width < r * 1.45) break; }
                g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 4);
                break;
            }
            case 'lokasi': {
                const t = (e.teks || '').slice(0, 24); if (!t) break;
                g.font = `700 28px "${o.fJ}"`; const tw = g.measureText(t).width + 86, x = W - P - tw, y = P + 64;
                g.fillStyle = o.gelap ? 'rgba(255,255,255,0.92)' : '#111111'; bulat(g, x, y, tw, 58, 29); g.fill();
                const fg = o.gelap ? '#111111' : '#ffffff'; g.fillStyle = '#e5484d'; g.beginPath(); g.arc(x + 32, y + 24, 12, Math.PI, 0); g.lineTo(x + 32, y + 46); g.closePath(); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 32, y + 24, 5, 0, Math.PI * 2); g.fill();
                g.fillStyle = fg; g.textBaseline = 'middle'; g.fillText(t, x + 58, y + 30);
                break;
            }
            case 'bintang': {
                const pos = kt ? [{ x: kt.x + kt.w + 26, y: kt.y - 4, r: 22 }, { x: kt.x + kt.w + 56, y: kt.y + 26, r: 12 }] : [{ x: W - P - 40, y: P + 140, r: 26 }, { x: W - P - 90, y: P + 190, r: 14 }];
                g.fillStyle = coret; for (const p of pos) { g.beginPath(); for (let a = 0; a < 8; a++) { const t2 = (a / 8) * Math.PI * 2, rr = a % 2 ? p.r * 0.28 : p.r; a === 0 ? g.moveTo(p.x + Math.cos(t2) * rr, p.y + Math.sin(t2) * rr) : g.lineTo(p.x + Math.cos(t2) * rr, p.y + Math.sin(t2) * rr); } g.closePath(); g.fill(); }
                break;
            }
            case 'tekstur': {
                const { createCanvas } = kanvas(); const c2 = createCanvas(256, 256), g2 = c2.getContext('2d'), d = g2.createImageData(256, 256);
                for (let p = 0; p < d.data.length; p += 4) { const v = 128 + goyang(p * 0.37 + i) * 255; d.data[p] = d.data[p + 1] = d.data[p + 2] = v; d.data[p + 3] = 22; }
                g2.putImageData(d, 0, 0); g.globalCompositeOperation = o.gelap ? 'screen' : 'multiply'; g.fillStyle = g.createPattern(c2, 'repeat'); g.fillRect(0, 0, W, H);
                break;
            }
            case 'maskot': {
                if (!s.maskot) break;
                const sisi = W * 0.3; await gambarHias(g, s.maskot, { x: W - sisi - P * 0.2, y: H - sisi - P * 1.5, w: sisi, h: sisi }, { utuh: true, putar: -0.08 });
                break;
            }
        }
        g.restore();
    }
    if (s.komentar?.teks) {
        // Kartu komentar asli (bukan karangan): dipakai hanya bila komentar sungguhan dipilih.
        const kw = W - P * 2, x = P, ky = H - P * 1.9 - 190;
        g.save(); g.shadowColor = 'rgba(0,0,0,0.2)'; g.shadowBlur = 24; g.shadowOffsetY = 8; g.fillStyle = '#ffffff'; bulat(g, x, ky, kw, 170, 24); g.fill(); g.restore();
        g.fillStyle = '#e4e4e7'; g.beginPath(); g.arc(x + 52, ky + 52, 26, 0, Math.PI * 2); g.fill();
        g.font = '700 26px "Plus Jakarta Sans"'; g.fillStyle = '#111111'; g.textBaseline = 'middle'; g.fillText(s.komentar.nama.slice(0, 30), x + 92, ky + 46);
        blok(g, s.komentar.teks, { x: x + 92, y: ky + 72, w: kw - 120, h: 84, f: 'Plus Jakarta Sans', w8: 500, maks: 28, min: 20, warna: '#333333', lh: 1.3 });
    }
}

/** Gambar satu slide. no = 1..n. */
export async function renderSlide(gayaId: string, s: IsiSlide, no: number, n: number, merek: InfoMerek, opsi: OpsiRender = {}): Promise<Buffer> {
    const { createCanvas } = kanvas();
    const st = gayaDesain(gayaId), W = opsi.w || 1080, H = opsi.h || 1350;
    const w = { ...st.w };
    let tekanKartu = '#ffffff';
    if (merek.aksenMerek && merek.warna?.some(hexOk)) {
        // Hanya warna merek yang "berwarna" (utama/aksen, bukan netral) yang dipakai sebagai aksen, dan hanya kalau terbaca:
        // gaya yang memakai aksen sebagai LATAR teks putih → kontras dengan putih; selain itu → kontras dengan latar gaya.
        const calon = [merek.warna![0], merek.warna![3], ...merek.warna!].filter((c) => hexOk(c) && jenuh(c) > 0.25);
        const sbgLatar = st.id === 'electric-studio' || st.id === 'creative-voltage';
        const cocok = st.id === 'bold-signal' ? calon.find((c) => rasioKontras(c, w.bg) >= 1.8 && Math.max(rasioKontras(c, '#ffffff'), rasioKontras(c, '#111111')) >= 4.5)
            : calon.find((c) => (sbgLatar ? rasioKontras(c, '#ffffff') : rasioKontras(c, w.bg || w.kartu || '#ffffff')) >= 3);
        if (cocok) {
            w.aksen = cocok;
            if (st.id === 'bold-signal') { const t = kontras(cocok); tekanKartu = calon.find((c) => c !== cocok && rasioKontras(c, cocok) >= 3) || (t === '#ffffff' ? '#ffd166' : '#ffffff'); }
        }
    }
    if (st.id === 'bold-signal' && w.aksen !== st.w.aksen) { w.teksKartu = kontras(w.aksen); w.tekanKartu = tekanKartu; }
    const fJ = merek.fontJudul && DAFTAR_FONT.includes(merek.fontJudul) ? merek.fontJudul : st.judul.f;
    const fI = merek.fontIsi && DAFTAR_FONT.includes(merek.fontIsi) ? merek.fontIsi : st.isi.f;
    const c = createCanvas(W, H), g = c.getContext('2d');
    const pertama = no === 1, akhir = no === n && n > 1;
    const P = Math.round(W * 0.083); // tepi aman
    // Slide tanpa gambar: huruf dibuat lebih besar supaya ruang terisi & mudah dibaca di HP.
    const lega = s.gambar ? 1 : pertama ? 1.04 : 1.14, legaIsi = s.gambar ? 1 : 1.22;
    kotakTekan = [];
    const stabilo = !!s.elemen?.some((e) => e.jenis === 'stabilo');
    const J = (o: Partial<Parameters<typeof blok>[2]> & { x: number; y: number; w: number; h: number; maks: number; warna: string }, teks = s.judul) => {
        const opsi = { f: fJ, w8: st.judul.w, italic: st.judul.italic, min: 30, ...o, maks: Math.round(o.maks * lega) } as any;
        if (stabilo && !o.kering && teks.includes('**')) {
            // Stabilo digambar DI BELAKANG kata yang ditekankan: ukur dulu, warnai, baru tulis.
            const awal = kotakTekan.length; catatKotak = true; blok(g, teks, { ...opsi, kering: true }); catatKotak = false;
            const gelapLatar = terang(o.warna.startsWith('#') ? o.warna : '#111111') > 0.6;
            for (const k of kotakTekan.splice(awal)) { g.save(); g.fillStyle = gelapLatar ? 'rgba(255, 214, 10, 0.95)' : 'rgba(255, 221, 0, 0.7)'; g.beginPath(); g.moveTo(k.x - 8, k.y + k.h * 0.42); g.lineTo(k.x + k.w + 10, k.y + k.h * 0.36); g.lineTo(k.x + k.w + 6, k.y + k.h * 1.02); g.lineTo(k.x - 10, k.y + k.h * 1.06); g.closePath(); g.fill(); g.restore(); }
            opsi.tekan = gelapLatar ? '#111111' : opsi.warna;
        }
        catatKotak = !o.kering; try { return blok(g, teks, opsi); } finally { catatKotak = false; }
    };
    const I = (o: Partial<Parameters<typeof blok>[2]> & { x: number; y: number; w: number; h: number; maks: number; warna: string }, teks = s.isi || '') => blok(g, teks, { f: fI, w8: st.isi.w, min: 24, lh: 1.38, ...o, maks: Math.round(o.maks * legaIsi) } as any);
    let teksUtama = w.teks || '#111', warnaKaki = teksUtama, aksenProgres = w.aksen;
    // kotak media (untuk aset gambar) per gaya; null = tanpa gambar
    let media: { x: number; y: number; w: number; h: number; r?: number } | null = null;
    const ada = (j: string) => !!s.elemen?.some((e) => e.jenis === j);
    const tata = s.tata && s.tata !== 'klasik' && TATA.includes(s.tata) && !(s.tata === 'foto' && !s.gambar) ? s.tata : null;
    let tok: Token | null = null;
    if (tata) {
        tok = dasar(g, st, w, W, H, P, no, n, merek, s, fJ, fI);
        warnaKaki = tok.kaki; aksenProgres = tok.progres;
        media = await isiTata(g, tata, tok, s, { W, H, P, pertama, J, I, fJ, fI, st });
    } else switch (st.id) {
        case 'bold-signal': {
            const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, w.bg); gr.addColorStop(0.5, w.bg2); gr.addColorStop(1, w.bg); g.fillStyle = gr; g.fillRect(0, 0, W, H);
            const kx = P * 0.7, ky = P * 1.6, kw = W - kx * 2, kh = H - ky - P * 1.8;
            g.fillStyle = w.aksen; bulat(g, kx, ky, kw, kh, 28); g.fill();
            g.font = `400 ${pertama ? 150 : 120}px "${fJ}"`; g.fillStyle = w.teksKartu; g.textBaseline = 'top'; g.globalAlpha = 0.9; g.fillText(String(no).padStart(2, '0'), kx + 48, ky + 40); g.globalAlpha = 1;
            g.font = `500 26px "${fI}"`; g.fillStyle = w.teks; g.globalAlpha = 0.6; g.fillText((s.label || merek.nama).toUpperCase(), P * 0.7, P * 0.8); g.globalAlpha = 1;
            if (s.gambar) media = { x: kx + 48, y: ky + 230, w: kw - 96, h: kh * 0.36, r: 18 };
            const ty = media ? media.y + media.h + 36 : ky + kh * (pertama ? 0.36 : 0.3);
            const hj = J({ x: kx + 48, y: ty, w: kw - 96, h: (ky + kh - 48 - ty) * (s.isi ? 0.58 : 1), maks: pertama ? 104 : 80, warna: w.teksKartu, tekan: w.aksen === st.w.aksen ? '#ffffff' : tekanKartu, lh: 1.04 });
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
            g.fillStyle = st.w.aksen; g.beginPath(); g.arc(P + 40, H - P - 140, 120, 0, Math.PI * 2); g.fill();
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
    if (!tata && media && s.gambar) { try { media = await gambarHias(g, s.gambar, media, { utuh: s.utuh, polaroid: ada('polaroid'), stiker: ada('stiker'), selotip: ada('selotip') }); } catch { /* gambar rusak → lewati */ } }
    await hiasi(g, s, { W, H, P, media, tekan: tok?.aksen || (st.id === 'bold-signal' ? w.teksKartu : st.id === 'creative-voltage' ? w.neon : st.id === 'notebook-tabs' ? '#7c5cc4' : st.id === 'split-pastel' ? '#c2185b' : st.id === 'vintage-editorial' ? '#a0522d' : w.aksen), teks: tok?.teks || teksUtama, gelap: tok ? tok.gelap : st.gelap, fJ, pertama, akhir });

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
