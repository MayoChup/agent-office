import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Ikon } from '../../components/Ikon';
/** Coretan disimpan sebagai SVG (vektor, tajam di semua layar). Data goresan ikut disimpan di <desc> supaya bisa diedit lagi. */
interface Gores { c: string; w: number; hl: boolean; p: number[] } // p = [x,y,tekanan, x,y,tekanan, ...]
const WARNA = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#ffffff'];
const W = 1600, H = 1000;

export function bacaSvg(svg: string): Gores[] {
    const m = svg.match(/<desc id="kantor-gores">([\s\S]*?)<\/desc>/);
    if (!m) return [];
    try { return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')); } catch { return []; }
}

function jalur(g: Gores) {
    const p = g.p;
    if (p.length < 6) return `M${p[0]},${p[1]} l0.1,0.1`;
    let d = `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    for (let i = 3; i < p.length - 3; i += 3) {
        const mx = (p[i] + p[i + 3]) / 2, my = (p[i + 1] + p[i + 4]) / 2;
        d += ` Q${p[i].toFixed(1)},${p[i + 1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
    }
    return d;
}
export function keSvg(gores: Gores[], latar: string) {
    const isi = gores.map((g) => `<path d="${jalur(g)}" fill="none" stroke="${g.c}" stroke-width="${g.w}" stroke-linecap="round" stroke-linejoin="round"${g.hl ? ' stroke-opacity="0.35"' : ''}/>`).join('');
    const data = JSON.stringify(gores).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><desc id="kantor-gores">${data}</desc><rect width="100%" height="100%" fill="${latar}"/>${isi}</svg>`;
}

export function Gambar({ awal, onSimpan, onTutup }: { awal?: string; onSimpan: (svg: string) => Promise<void>; onTutup: () => void }) {
    const [gores, setGores] = useState<Gores[]>(() => (awal ? bacaSvg(awal) : []));
    const [redo, setRedo] = useState<Gores[]>([]);
    const [warna, setWarna] = useState(WARNA[0]);
    const [tebal, setTebal] = useState(4);
    const [alat, setAlat] = useState<'pena' | 'stabilo' | 'hapus'>('pena');
    const [latar, setLatar] = useState<'#ffffff' | 'garis' | 'kotak'>('#ffffff');
    const [busy, setBusy] = useState(false);
    const svg = useRef<SVGSVGElement>(null);
    const aktif = useRef<Gores | null>(null);
    const [, paksa] = useState(0);

    useEffect(() => {
        const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } };
        window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
    });
    const titik = (e: React.PointerEvent) => {
        const r = svg.current!.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, e.pressure || 0.5];
    };
    const down = (e: React.PointerEvent) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        const [x, y, pr] = titik(e);
        if (alat === 'hapus') { hapusDi(x, y); aktif.current = { c: 'hapus', w: 0, hl: false, p: [] }; return; }
        aktif.current = { c: warna, w: alat === 'stabilo' ? tebal * 4 : tebal * (0.6 + pr * 0.8), hl: alat === 'stabilo', p: [x, y, pr] };
        paksa((n) => n + 1);
    };
    const move = (e: React.PointerEvent) => {
        const g = aktif.current; if (!g) return;
        const [x, y, pr] = titik(e);
        if (g.c === 'hapus') { hapusDi(x, y); return; }
        const n = g.p.length;
        if (Math.hypot(x - g.p[n - 3], y - g.p[n - 2]) < 1.5) return;
        g.p.push(x, y, pr); paksa((k) => k + 1);
    };
    const up = () => {
        const g = aktif.current; aktif.current = null;
        if (g && g.c !== 'hapus' && g.p.length) { setGores((gs) => [...gs, g]); setRedo([]); }
    };
    const hapusDi = (x: number, y: number) => setGores((gs) => gs.filter((g) => { for (let i = 0; i < g.p.length; i += 3) if (Math.hypot(g.p[i] - x, g.p[i + 1] - y) < 14 + g.w / 2) return false; return true; }));
    const undo = () => setGores((gs) => { if (!gs.length) return gs; setRedo((r) => [...r, gs[gs.length - 1]]); return gs.slice(0, -1); });
    const ulang = () => setRedo((r) => { if (!r.length) return r; setGores((gs) => [...gs, r[r.length - 1]]); return r.slice(0, -1); });
    const semua = aktif.current && aktif.current.c !== 'hapus' ? [...gores, aktif.current] : gores;

    return createPortal(
        <div className="gb">
            <div className="gb-bar">
                <button className="gb-close" onClick={onTutup} aria-label="Tutup">✕</button>
                <div className="gb-group">
                    {(['pena', 'stabilo', 'hapus'] as const).map((a) => <button key={a} className={alat === a ? 'on' : ''} onClick={() => setAlat(a)} title={a}>{a === 'pena' ? <Ikon e="✒" /> : a === 'stabilo' ? <Ikon e="🖍" /> : <Ikon e="🧽" />}</button>)}
                </div>
                <div className="gb-group">{WARNA.map((c) => <button key={c} className={`gb-c ${warna === c ? 'on' : ''}`} style={{ background: c }} onClick={() => { setWarna(c); if (alat === 'hapus') setAlat('pena'); }} aria-label={`warna ${c}`} />)}</div>
                <div className="gb-group">{[2, 4, 8, 14].map((t) => <button key={t} className={tebal === t ? 'on' : ''} onClick={() => setTebal(t)}><i style={{ width: t + 2, height: t + 2 }} /></button>)}</div>
                <div className="gb-group">
                    <button onClick={undo} disabled={!gores.length} title="Batal (Ctrl+Z)"><Ikon e="↶" /></button>
                    <button onClick={ulang} disabled={!redo.length} title="Ulangi"><Ikon e="↷" /></button>
                    <button onClick={() => { if (confirm('Hapus semua coretan?')) { setGores([]); setRedo([]); } }} title="Bersihkan"><Ikon e="🗑" /></button>
                    <select value={latar} onChange={(e) => setLatar(e.target.value as any)}><option value="#ffffff">Polos</option><option value="garis">Bergaris</option><option value="kotak">Kotak</option></select>
                </div>
                <button className="btn primary gb-save" disabled={busy} onClick={async () => { setBusy(true); try { await onSimpan(keSvg(gores, '#ffffff')); } finally { setBusy(false); } }}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
            <div className="gb-area">
                <svg ref={svg} className={`gb-canvas latar-${latar === '#ffffff' ? 'polos' : latar}`} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                    <rect width={W} height={H} fill="#fff" />
                    {latar === 'garis' && Array.from({ length: 24 }, (_, i) => <line key={i} x1={0} x2={W} y1={(i + 1) * 40} y2={(i + 1) * 40} stroke="#dbeafe" strokeWidth="2" />)}
                    {latar === 'kotak' && Array.from({ length: 40 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * 40} x2={(i + 1) * 40} y1={0} y2={H} stroke="#e5e7eb" strokeWidth="1.5" />)}
                    {latar === 'kotak' && Array.from({ length: 24 }, (_, i) => <line key={`h${i}`} x1={0} x2={W} y1={(i + 1) * 40} y2={(i + 1) * 40} stroke="#e5e7eb" strokeWidth="1.5" />)}
                    {semua.map((g, i) => <path key={i} d={jalur(g)} fill="none" stroke={g.c} strokeWidth={g.w} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={g.hl ? 0.35 : 1} />)}
                </svg>
            </div>
            <div className="gb-hint">Pakai jari, stylus (tekanan didukung), atau mouse · <Ikon e="🧽" /> untuk menghapus goresan · disimpan sebagai gambar di catatan ini</div>
        </div>,
        document.body
    );
}
