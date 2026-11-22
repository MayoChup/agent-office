import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiGet, apiPost } from '../../kantor/connection';

/* Watchlist Utama + folder bersama untuk semua tombol bintang (satu sumber, langsung sinkron). */
export interface FolderW { id: string; nama: string; ikon: string; simbol: string[] }
let daftar = new Set<string>();
let folders: FolderW[] = [];
let dimuat: Promise<void> | null = null;
const pendengar = new Set<() => void>();
const kabari = () => { pendengar.forEach((f) => f()); try { window.dispatchEvent(new Event('kantor:watchlist')); } catch { /* */ } };
export function muatWatch(paksa = false) {
    if (!dimuat || paksa) dimuat = apiGet<{ utama: string[]; folders: FolderW[] }>('/api/kantor/watchlist-folder').then((r) => { daftar = new Set(r.utama || []); folders = r.folders || []; pendengar.forEach((f) => f()); }).catch(() => { dimuat = null; });
    return dimuat;
}
async function aturUtama(s: string, masuk: boolean) {
    if (daftar.has(s) === masuk) return;
    daftar = new Set(daftar); if (masuk) daftar.add(s); else daftar.delete(s); kabari(); // optimis
    try { await apiPost('/api/kantor/trading/watchlist', { simbol: s, aksi: masuk ? 'tambah' : 'hapus' }); }
    catch (e) { daftar = new Set(daftar); if (masuk) daftar.delete(s); else daftar.add(s); kabari(); throw e; }
}
export async function toggleWatch(s: string) { const ada = daftar.has(s); await aturUtama(s, !ada); return !ada; }
async function aturFolder(id: string, s: string, masuk: boolean) {
    const lama = folders;
    folders = folders.map((f) => (f.id !== id ? f : { ...f, simbol: masuk ? Array.from(new Set([...f.simbol, s])) : f.simbol.filter((x) => x !== s) })); kabari();
    try { const r = await apiPost<{ folders: FolderW[] }>('/api/kantor/watchlist-folder', { aksi: masuk ? 'tambah' : 'buang', id, simbol: s }); if (r?.folders) { folders = r.folders; kabari(); } }
    catch (e) { folders = lama; kabari(); throw e; }
}
async function buatFolder(nama: string, s: string) {
    const r = await apiPost<{ folders: FolderW[] }>('/api/kantor/watchlist-folder', { aksi: 'buat', nama });
    folders = r?.folders || folders; const f = folders[folders.length - 1];
    if (f) await aturFolder(f.id, s, true); else kabari();
}
export function useWatch() {
    const [, setV] = useState(0);
    useEffect(() => { const f = () => setV((x) => x + 1); pendengar.add(f); muatWatch(); return () => { pendengar.delete(f); }; }, []);
    return daftar;
}
/** Folder (selain Utama) yang berisi saham ini. */
export function useFolderSaham(s: string) { useWatch(); return folders.filter((f) => f.simbol.includes(s)); }

/**
 * Tombol bintang ala "simpan" Instagram:
 * - ketuk saat belum tersimpan → masuk Watchlist Utama + lembar pilih folder muncul (menutup sendiri bila didiamkan)
 * - ketuk saat sudah tersimpan / tahan lama / klik kanan → lembar folder (pindah, tambah, atau hapus dari semua)
 * Tidak membuka halaman saham.
 */
export function Bintang({ s, besar = false }: { s: string; besar?: boolean }) {
    const w = useWatch();
    const fs = useFolderSaham(s);
    const on = w.has(s) || fs.length > 0;
    const [pop, setPop] = useState(false);
    const [lembar, setLembar] = useState<null | { baru: boolean }>(null);
    const tahan = React.useRef<number | undefined>(undefined), sudahTahan = React.useRef(false);
    const buka = (baru: boolean) => setLembar({ baru });
    const klik = async (e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault();
        if (sudahTahan.current) { sudahTahan.current = false; return; }
        if (on) { buka(false); return; }
        try { await aturUtama(s, true); setPop(true); setTimeout(() => setPop(false), 450); buka(true); } catch { /* sudah dikembalikan */ }
    };
    const mulaiTahan = () => { sudahTahan.current = false; window.clearTimeout(tahan.current); tahan.current = window.setTimeout(() => { sudahTahan.current = true; buka(false); try { navigator.vibrate?.(12); } catch { /* */ } }, 450); };
    const henti = () => window.clearTimeout(tahan.current);
    return (
        <>
            <button type="button" className={`bintang ${on ? 'on' : ''} ${besar ? 'besar' : ''} ${pop ? 'pop' : ''}`} onClick={klik} aria-pressed={on}
                onPointerDown={mulaiTahan} onPointerUp={henti} onPointerLeave={henti} onPointerCancel={henti}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); henti(); buka(false); }}
                aria-label={on ? `${s} tersimpan — atur folder` : `Simpan ${s} ke Watchlist`} title={on ? 'Tersimpan — ketuk untuk atur folder' : 'Simpan ke Watchlist (tahan untuk pilih folder)'}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3L2.85 9.45l6.32-.92z" /></svg>
            </button>
            {lembar && createPortal(<LembarSimpan s={s} baru={lembar.baru} tutup={() => setLembar(null)} />, document.body)}
        </>
    );
}

function LembarSimpan({ s, baru, tutup }: { s: string; baru: boolean; tutup: () => void }) {
    const w = useWatch();
    const [nama, setNama] = useState(''), [bikin, setBikin] = useState(false), [galat, setGalat] = useState('');
    const [disentuh, setDisentuh] = useState(!baru);
    const [sisa, setSisa] = useState(6);
    // Baru disimpan & didiamkan → menutup sendiri (tetap tersimpan di Utama).
    useEffect(() => {
        if (disentuh) return;
        const t = setInterval(() => setSisa((x) => { if (x <= 1) { clearInterval(t); tutup(); return 0; } return x - 1; }), 1000);
        return () => clearInterval(t);
    }, [disentuh]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && tutup(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [tutup]);
    const coba = async (f: () => Promise<unknown>) => { setDisentuh(true); setGalat(''); try { await f(); } catch (e: any) { setGalat(String(e?.message || e)); } };
    const diUtama = w.has(s);
    const ada = diUtama || folders.some((f) => f.simbol.includes(s));
    return (
        <div className="sv-latar interactive" onClick={(e) => { e.stopPropagation(); tutup(); }}>
            <section className="sv-lembar" role="dialog" aria-label={`Simpan ${s}`} onClick={(e) => { e.stopPropagation(); setDisentuh(true); }}>
                <header>
                    <b>{baru ? <>Disimpan ke Watchlist Utama</> : <>Simpan {s}</>}</b>
                    <small>{baru ? <>{s} · pilih folder lain kalau perlu</> : 'Centang folder tujuan'}</small>
                </header>
                <ul>
                    <li><label><input type="checkbox" checked={diUtama} onChange={(e) => coba(() => aturUtama(s, e.target.checked))} /><span className="sv-nama">Utama<small>dipantau Dito & dibuatkan strategi</small></span><em>{w.size} saham</em></label></li>
                    {folders.map((f) => (
                        <li key={f.id}><label><input type="checkbox" checked={f.simbol.includes(s)} onChange={(e) => coba(() => aturFolder(f.id, s, e.target.checked))} /><span className="sv-nama">{f.nama}</span><em>{f.simbol.length} saham</em></label></li>
                    ))}
                </ul>
                {bikin ? (
                    <form className="sv-baru" onSubmit={(e) => { e.preventDefault(); const n = nama.trim(); if (!n) return; coba(async () => { await buatFolder(n, s); setNama(''); setBikin(false); }); }}>
                        <input autoFocus value={nama} maxLength={40} placeholder="Nama folder, mis. AI & chip" onChange={(e) => setNama(e.target.value)} onFocus={() => setDisentuh(true)} />
                        <button className="btn small primary" type="submit" disabled={!nama.trim()}>Buat</button>
                    </form>
                ) : <button className="sv-tambah" onClick={() => { setDisentuh(true); setBikin(true); }}>+ Folder baru</button>}
                {galat && <div className="error">{galat}</div>}
                <footer>
                    {ada && !baru && <button className="btn small sv-hapus" onClick={() => coba(async () => { await aturUtama(s, false); for (const f of folders.filter((x) => x.simbol.includes(s))) await aturFolder(f.id, s, false); tutup(); })}>Hapus dari semua</button>}
                    <button className="btn small primary" onClick={tutup}>Selesai{!disentuh ? ` (${sisa})` : ''}</button>
                </footer>
            </section>
        </div>
    );
}

/** Keterangan "Di: Utama, AI & chip" di halaman saham; ketuk untuk membuka lembar folder. */
export function TombolFolder({ s }: { s: string }) {
    const w = useWatch(); const fs = useFolderSaham(s);
    const [buka, setBuka] = useState(false);
    const di = [...(w.has(s) ? ['Utama'] : []), ...fs.map((f) => f.nama)];
    return (
        <>
            <button className="sd-folder" onClick={(e) => { e.stopPropagation(); setBuka(true); }} title="Atur folder watchlist">{di.length ? `Di: ${di.join(', ')}` : 'Simpan ke folder'} ▾</button>
            {buka && createPortal(<LembarSimpan s={s} baru={false} tutup={() => setBuka(false)} />, document.body)}
        </>
    );
}
