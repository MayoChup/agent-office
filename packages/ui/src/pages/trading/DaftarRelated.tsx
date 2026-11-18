import React, { useEffect, useState } from 'react';
import { apiGet } from '../../kantor/connection';

interface Item { id: string; judul: string; ringkas: string; tgl: string; topik: string; artikel: Array<{ t: string; sumber: string; tgl: string; url: string }>; dampak: Array<{ jenis: string; nama: string; arah: number; alasan: string }>; oleh: string }
interface Data { items: Item[]; total: number; hal: number; halaman: number; n: number; pilihan: { topik: Array<{ nama: string; jumlah: number }>; industri: Array<{ nama: string; jumlah: number }>; tanggal: { min: string | null; max: string | null } } }
const ARAH: Record<string, string> = { '2': '▲▲', '1': '▲', '-1': '▼', '-2': '▼▼' };
const tgl = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const mundur = (n: number) => new Date(Date.now() + 7 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);

/** Semua info News related yang pernah dipetakan — terbaru di atas, berhalaman, dengan filter tanggal, tema, dan industri. */
export function DaftarRelated() {
    const [f, setF] = useState({ dari: '', sampai: '', topik: '', industri: '', q: '' });
    const [hal, setHal] = useState(1);
    const [lompat, setLompat] = useState('');
    const [d, setD] = useState<Data | null>(null);
    const [err, setErr] = useState('');
    const [buka, setBuka] = useState<string | null>(null);
    useEffect(() => {
        const p = new URLSearchParams({ hal: String(hal), n: '10' });
        for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
        apiGet<Data>(`/api/kantor/berita-terkait/daftar?${p}`).then((r) => { setD(r); setErr(''); }).catch((e) => setErr(String(e.message || e)));
    }, [f, hal]);
    const set = (x: Partial<typeof f>) => { setF({ ...f, ...x }); setHal(1); };
    const preset = (k: string) => { const v = k === 'hari' ? [hariIni(), hariIni()] : k === 'kemarin' ? [mundur(1), mundur(1)] : k === '7' ? [mundur(6), ''] : k === '30' ? [mundur(29), ''] : ['', '']; set({ dari: v[0], sampai: v[1] }); };
    const nomor = (() => { if (!d) return []; const n = d.halaman, c = d.hal; const s = new Set([1, n, c - 1, c, c + 1, c - 2, c + 2].filter((x) => x >= 1 && x <= n)); const arr = [...s].sort((a, b) => a - b); const out: Array<number | '…'> = []; arr.forEach((x, i) => { if (i && x - arr[i - 1] > 1) out.push('…'); out.push(x); }); return out; })();
    const adaFilter = Object.values(f).some(Boolean);
    return (
        <div className="dr">
            <div className="dr-h"><b>Semua News related</b><small>{d ? `${d.total} info${adaFilter ? ' sesuai filter' : ''} · terbaru di atas` : ''}</small></div>
            <div className="dr-filter">
                <div className="dr-cepat">{[['semua', 'Semua tanggal'], ['hari', 'Hari ini'], ['kemarin', 'Kemarin'], ['7', '7 hari'], ['30', '30 hari']].map(([k, l]) => {
                    const on = k === 'semua' ? !f.dari && !f.sampai : k === 'hari' ? f.dari === hariIni() && f.sampai === hariIni() : k === 'kemarin' ? f.dari === mundur(1) && f.sampai === mundur(1) : k === '7' ? f.dari === mundur(6) && !f.sampai : f.dari === mundur(29) && !f.sampai;
                    return <button key={k} className={on ? 'on' : ''} onClick={() => preset(k)}>{l}</button>;
                })}</div>
                <label>Dari<input type="date" value={f.dari} min={d?.pilihan.tanggal.min || undefined} max={hariIni()} onChange={(e) => set({ dari: e.target.value })} /></label>
                <label>Sampai<input type="date" value={f.sampai} min={f.dari || undefined} max={hariIni()} onChange={(e) => set({ sampai: e.target.value })} /></label>
                <label>Tema<select value={f.topik} onChange={(e) => set({ topik: e.target.value })}><option value="">Semua tema</option>{d?.pilihan.topik.map((t) => <option key={t.nama} value={t.nama}>{t.nama} ({t.jumlah})</option>)}</select></label>
                <label>Industri / sektor<select value={f.industri} onChange={(e) => set({ industri: e.target.value })}><option value="">Semua industri</option>{d?.pilihan.industri.map((t) => <option key={t.nama} value={t.nama}>{t.nama} ({t.jumlah})</option>)}</select></label>
                <label className="dr-cari">Cari<input type="search" placeholder="kata kunci…" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
                {adaFilter && <button className="btn small" onClick={() => { setF({ dari: '', sampai: '', topik: '', industri: '', q: '' }); setHal(1); }}>Hapus filter</button>}
            </div>
            {err && <div className="error">{err}</div>}
            {d && !d.items.length && <div className="fin-empty">{adaFilter ? 'Tidak ada info yang cocok dengan filter ini.' : 'Belum ada News related. Tekan "Petakan ulang" di atas.'}</div>}
            <div className="dr-list">
                {d?.items.map((x) => (
                    <article key={x.id} className="dr-item">
                        <button className="dr-judul" onClick={() => setBuka(buka === x.id ? null : x.id)} aria-expanded={buka === x.id}>
                            <span className="dr-meta"><span className="dr-tema">{x.topik}</span>{tgl(x.tgl)} · {x.artikel.length} berita</span>
                            <b>{x.judul}</b>
                            <span className="dr-dampak">{x.dampak.slice(0, 5).map((dm, i) => <em key={i} className={dm.arah > 0 ? 'up' : 'down'}>{ARAH[String(dm.arah)]} {dm.nama}</em>)}{x.dampak.length > 5 && <em>+{x.dampak.length - 5}</em>}</span>
                        </button>
                        {buka === x.id && (
                            <div className="dr-isi">
                                {x.ringkas && <p>{x.ringkas}</p>}
                                <ul className="fb-daftar">{x.dampak.map((dm, i) => <li key={i} className={dm.arah > 0 ? 'up' : 'down'}><b>{ARAH[String(dm.arah)]} {dm.nama}</b> <small>{dm.jenis}</small> — {dm.alasan}</li>)}</ul>
                                <ul className="fb-daftar">{x.artikel.map((a, i) => <li key={i}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.t}</a> <em>{a.sumber} · {a.tgl}</em></li>)}</ul>
                                <small className="dr-oleh">Dipetakan {x.oleh}</small>
                            </div>
                        )}
                    </article>
                ))}
            </div>
            {d && d.halaman > 1 && (
                <nav className="dr-hal" aria-label="Halaman">
                    <button disabled={d.hal <= 1} onClick={() => setHal(d.hal - 1)}>‹ Sebelumnya</button>
                    {nomor.map((x, i) => x === '…' ? <span key={`e${i}`}>…</span> : <button key={x} className={x === d.hal ? 'on' : ''} aria-current={x === d.hal ? 'page' : undefined} onClick={() => setHal(x)}>{x}</button>)}
                    <button disabled={d.hal >= d.halaman} onClick={() => setHal(d.hal + 1)}>Berikutnya ›</button>
                    <form onSubmit={(e) => { e.preventDefault(); const v = Math.round(+lompat); if (v >= 1 && v <= d.halaman) { setHal(v); setLompat(''); } }}>
                        <label>Ke halaman<input type="number" min={1} max={d.halaman} value={lompat} onChange={(e) => setLompat(e.target.value)} placeholder={`1–${d.halaman}`} /></label>
                        <button type="submit">Buka</button>
                    </form>
                </nav>
            )}
        </div>
    );
}
