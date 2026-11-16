import React from 'react';

export type Shot = 'dekat' | 'sedang' | 'jauh' | 'layar' | 'teks';
export interface Sketsa { shot: Shot; kamera: string; objek: Array<{ jenis: string; posisi: 'kiri' | 'tengah' | 'kanan'; label?: string }> }
export interface Adegan { no: number; detik: string; visual: string; teksLayar: string; narasi: string; sfx?: string; sketsa?: Sketsa }

const KATA: Array<[RegExp, string]> = [[/\b(hp|ponsel|handphone|smartphone|phone|layar hp|notif)/i, 'hp'], [/laptop|komputer|pc\b/i, 'laptop'], [/wajah|muka|ekspresi|face/i, 'wajah'], [/tangan|jari|hand/i, 'tangan'],
    [/grafik|chart|angka|data|tabel/i, 'grafik'], [/kotak|paket|stok|barang|produk|box/i, 'kotak'], [/uang|rupiah|harga|duit|money/i, 'uang'], [/rumah|toko|warung|kantor/i, 'rumah'], [/mobil|motor|kirim|kurir/i, 'mobil'],
    [/makan|kopi|minum|food/i, 'makanan'], [/orang|pemilik|pria|wanita|dia|presenter|kreator/i, 'orang']];
/** Kalau AI tidak memberi sketsa, tebak dari kata di deskripsi visual (supaya tetap ada gambaran). */
export function tebakSketsa(a: Adegan): Sketsa {
    if (a.sketsa && (a.sketsa.objek.length || a.sketsa.shot === 'teks')) return a.sketsa;
    const v = `${a.visual} ${a.teksLayar}`, ada = KATA.filter(([r]) => r.test(v)).map(([, j]) => j).slice(0, 2);
    const pos: Array<'tengah' | 'kiri' | 'kanan'> = ada.length > 1 ? ['kiri', 'kanan'] : ['tengah'];
    return { shot: a.sketsa?.shot || (/layar|screen|rekaman layar/i.test(v) ? 'layar' : /close|dekat/i.test(v) ? 'dekat' : 'sedang'), kamera: a.sketsa?.kamera || (/zoom/i.test(v) ? 'zoom-in' : 'diam'), objek: (ada.length ? ada : ['orang']).map((jenis, i) => ({ jenis, posisi: pos[i] })) };
}

const X = { kiri: 24, tengah: 45, kanan: 66 };
/** Satu objek digambar sebagai coretan pensil sederhana, berpusat di (0,0), ±14 satuan. */
function Objek({ jenis }: { jenis: string }) {
    switch (jenis) {
        case 'wajah': return <g><circle r="13" /><circle cx="-4.5" cy="-3" r="1.3" className="isi" /><circle cx="4.5" cy="-3" r="1.3" className="isi" /><path d="M-5 5 Q0 9 5 5" /><path d="M-8 -9 Q-4 -12 0 -11" /></g>;
        case 'orang': return <g><circle cy="-10" r="5.5" /><path d="M-11 13 Q-11 0 0 -2 Q11 0 11 13" /><path d="M-4 -11 l0 0.1 M4 -11 l0 0.1" /></g>;
        case 'tangan': return <g><path d="M-6 14 L-6 0 Q-6 -3 -3 -3 L-3 -12 Q-3 -14 -1 -14 Q1 -14 1 -12 L1 -4 L1 -10 Q1 -12 3 -12 Q5 -12 5 -10 L5 -3 Q8 -6 9 -2 L6 8 Q4 14 0 14 Z" /></g>;
        case 'hp': return <g><rect x="-8" y="-14" width="16" height="28" rx="2.5" /><path d="M-5 -9 h10 M-5 -5 h7 M-5 -1 h9" /><rect x="-5" y="3" width="10" height="6" rx="1" className="isi-tipis" /><path d="M-2 11.5 h4" /></g>;
        case 'laptop': return <g><path d="M-13 4 L-11 -10 L11 -10 L13 4 Z" /><path d="M-16 4 h32 l-2 4 h-28 z" /><path d="M-7 -5 h10 M-7 -1 h14" /></g>;
        case 'kotak': return <g><path d="M-10 -4 L0 -9 L10 -4 L10 9 L0 14 L-10 9 Z" /><path d="M-10 -4 L0 1 L10 -4 M0 1 L0 14" /></g>;
        case 'grafik': return <g><path d="M-12 12 L-12 -12 M-12 12 L13 12" /><rect x="-8" y="4" width="4" height="8" /><rect x="-2" y="-1" width="4" height="13" /><rect x="4" y="-6" width="4" height="18" /><path d="M-9 -2 L-1 -7 L4 -9 L10 -14 M7 -14 h3 v3" /></g>;
        case 'teks': return <g><path d="M-12 -6 h24 M-12 0 h20 M-12 6 h22" /></g>;
        case 'ikon': return <g><circle r="11" /><path d="M0 -7 L2 -2 L7 -2 L3 1 L4.5 6 L0 3 L-4.5 6 L-3 1 L-7 -2 L-2 -2 Z" /></g>;
        case 'rumah': return <g><path d="M-12 -1 L0 -12 L12 -1" /><path d="M-9 -3 V12 H9 V-3" /><rect x="-3" y="4" width="6" height="8" /></g>;
        case 'mobil': return <g><path d="M-14 5 V0 L-9 -1 L-6 -7 H6 L10 -1 L14 0 V5 Z" /><circle cx="-7" cy="6" r="3" /><circle cx="7" cy="6" r="3" /></g>;
        case 'uang': return <g><rect x="-13" y="-7" width="26" height="14" rx="1.5" /><circle r="4" /><path d="M-10 -4 v1 M10 3 v1" /></g>;
        case 'makanan': return <g><path d="M-12 -1 Q0 14 12 -1 Z" /><path d="M-4 -5 q2 -3 0 -6 M2 -5 q2 -3 0 -6" /></g>;
        case 'pohon': return <g><circle cy="-6" r="8" /><path d="M0 2 V13" /></g>;
        default: return <g><circle r="9" /></g>;
    }
}
function potong(t: string, n: number) { const kata = t.split(/\s+/); const b: string[] = []; let cur = ''; for (const w of kata) { if ((cur + ' ' + w).trim().length > n && cur) { b.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) b.push(cur); return b.slice(0, 2); }

/** Bingkai 9:16 bergaya sketsa pensil: framing, objek, teks di layar, dan arah kamera. */
export function BingkaiSketsa({ a }: { a: Adegan }) {
    const s = tebakSketsa(a);
    const skala = s.shot === 'dekat' ? 1.7 : s.shot === 'jauh' ? 0.7 : 1.15;
    const cy = s.shot === 'jauh' ? 100 : 88;
    const perPos: Record<string, number> = {};
    const teksL = a.teksLayar ? potong(a.teksLayar.toUpperCase(), 15) : [];
    return (
        <svg viewBox="0 0 90 160" className="skt" role="img" aria-label={`Sketsa adegan ${a.no}: ${a.visual}`}>
            <defs><filter id="skt-w" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="1.8" /></filter></defs>
            <rect x="0.5" y="0.5" width="89" height="159" rx="3" className="skt-kertas" />
            <g filter="url(#skt-w)" className="skt-garis">
                {s.shot === 'jauh' && <path d="M4 118 Q30 115 50 118 T86 117" className="tipis" />}
                {s.shot === 'layar' && <g><rect x="16" y="34" width="58" height="104" rx="6" /><path d="M24 46 h30 M24 52 h40 M24 58 h22" className="tipis" /></g>}
                {s.shot === 'teks' ? <g><path d="M14 70 h62 M14 80 h50 M14 90 h56" /><path d="M14 100 h34" className="tipis" /></g>
                    : s.objek.map((o, i) => {
                        const n = (perPos[o.posisi] = (perPos[o.posisi] ?? -1) + 1);
                        const x = s.objek.length === 1 ? 45 : X[o.posisi], y = cy + n * 30 * skala * 0.7, sk = s.shot === 'layar' ? 0.9 : skala * (s.objek.length > 2 ? 0.8 : 1);
                        return <g key={i} transform={`translate(${x} ${s.shot === 'layar' ? 92 + n * 26 : y}) scale(${sk})`}><Objek jenis={o.jenis} /></g>;
                    })}
                {s.kamera === 'zoom-in' && <g className="skt-kam"><path d="M8 26 l9 9 M8 26 h5 M8 26 v5" /><path d="M82 26 l-9 9 M82 26 h-5 M82 26 v5" /><path d="M8 150 l9 -9 M8 150 h5 M8 150 v-5" /><path d="M82 150 l-9 -9 M82 150 h-5 M82 150 v-5" /></g>}
                {s.kamera === 'zoom-out' && <g className="skt-kam"><path d="M17 35 l-9 -9 M17 35 h-5 M17 35 v-5" /><path d="M73 35 l9 -9 M73 35 h5 M73 35 v-5" /><path d="M17 141 l-9 9 M17 141 h-5 M17 141 v5" /><path d="M73 141 l9 9 M73 141 h5 M73 141 v5" /></g>}
                {(s.kamera === 'geser-kiri' || s.kamera === 'geser-kanan') && <g className="skt-kam"><path d="M22 150 h46" />{s.kamera === 'geser-kanan' ? <path d="M62 146 l6 4 l-6 4" /> : <path d="M28 146 l-6 4 l6 4" />}</g>}
                {(s.kamera === 'naik' || s.kamera === 'turun') && <g className="skt-kam"><path d="M84 50 v70" />{s.kamera === 'naik' ? <path d="M80 56 l4 -6 l4 6" /> : <path d="M80 114 l4 6 l4 -6" />}</g>}
            </g>
            {teksL.length > 0 && <g className="skt-teks"><rect x="8" y="9" width="74" height={teksL.length * 9 + 5} rx="2" />{teksL.map((t, i) => <text key={i} x="45" y={17 + i * 9} textAnchor="middle">{t}</text>)}</g>}
            {s.objek.filter((o) => o.label).slice(0, 2).map((o, i) => <text key={i} className="skt-label" x={s.objek.length === 1 ? 45 : X[o.posisi]} y={s.shot === 'jauh' ? 132 : 128 + i * 7} textAnchor="middle">{o.label}</text>)}
            <text x="85" y="156" className="skt-no" textAnchor="end">{a.no}</text>
        </svg>
    );
}

/** Deretan bingkai sketsa (storyboard visual) dari satu daftar adegan. */
export function StoryboardSketsa({ adegan, musik, kecil }: { adegan: Adegan[]; musik?: string; kecil?: boolean }) {
    if (!adegan.length) return null;
    return (
        <div className={`skt-wrap ${kecil ? 'kecil' : ''}`}>
            <div className="skt-strip">
                {adegan.map((a) => (
                    <figure key={a.no} className="skt-f">
                        <BingkaiSketsa a={a} />
                        <figcaption><b>{a.detik ? `${a.detik} dtk` : `#${a.no}`}</b><span>{a.visual}</span>{a.sfx && <em>🔊 {a.sfx}</em>}</figcaption>
                    </figure>
                ))}
            </div>
            {musik && <p className="skt-musik">🎵 Musik latar: {musik}</p>}
        </div>
    );
}
