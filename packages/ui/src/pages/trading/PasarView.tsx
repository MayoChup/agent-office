import { cocokCari } from './aliasSaham';
import { TambahSaham } from './TambahSaham';
import React, { useMemo, useState } from 'react';
import { Baris, FaktorKey, FAKTOR, ScreenerData, kelas, usd, persen, kap, vol, kapOf } from './types';
import { Sparkline } from './Sparkline';

import { Ikon } from '../../components/Ikon';
type Grup = 'Semua' | 'Beli' | 'Tahan' | 'Jual';
const KOLOM: Array<{ k: string; label: string; num?: boolean }> = [
    { k: 's', label: 'Perusahaan' }, { k: 'sektor', label: 'Sektor' }, { k: 'harga', label: 'Harga', num: true }, { k: 'chg1d', label: 'Perubahan', num: true },
    { k: 'spark', label: '60 hari' }, { k: 'vol', label: 'Volume', num: true }, { k: 'mcap', label: 'Kap. pasar', num: true }, { k: 'sinyal', label: 'Sinyal' }
];

export function PasarView({ data, faktor, setFaktor, onOpen }: { data: ScreenerData; faktor: FaktorKey; setFaktor: (f: FaktorKey) => void; onOpen: (s: string) => void }) {
    const [q, setQ] = useState('');
    const [sektor, setSektor] = useState('');
    const [grup, setGrup] = useState<Grup>('Semua');
    const [urut, setUrut] = useState<{ k: string; asc: boolean }>({ k: 'mcap', asc: false });
    const [batas, setBatas] = useState(60);
    const p = data.pasar;
    const total = p.naik + p.turun + p.tetap || 1;
    const sektorTop = p.sektor[0];

    const list = useMemo(() => {
        const qq = q.trim().toUpperCase();
        const lbl = (b: Baris) => b.skor?.[faktor]?.label || '';
        const out = data.baris.filter((b) => (!qq || cocokCari(b, q)) && (!sektor || b.sektor === sektor)
            && (grup === 'Semua' || (grup === 'Beli' ? /Beli/.test(lbl(b)) : grup === 'Jual' ? /Jual/.test(lbl(b)) : lbl(b) === 'Tahan')));
        const val = (b: Baris): number | string => urut.k === 'mcap' ? (kapOf(b) ?? -1) : urut.k === 'vol' ? (b.vol ?? -1) : urut.k === 'sinyal' ? (b.skor?.[faktor]?.skor ?? -9) : urut.k === 's' ? b.s : urut.k === 'sektor' ? b.sektor : (b as any)[urut.k] ?? -1;
        return out.sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'string' ? String(x).localeCompare(String(y)) : (x as number) - (y as number); return urut.asc ? r : -r; });
    }, [data, q, sektor, grup, urut, faktor]);
    const hitung = (g: Grup) => data.baris.filter((b) => { const l = b.skor?.[faktor]?.label || ''; return g === 'Semua' || (g === 'Beli' ? /Beli/.test(l) : g === 'Jual' ? /Jual/.test(l) : l === 'Tahan'); }).length;

    return (
        <>
            <section className="sb-hero">
                <div>
                    <h1>Ikhtisar Pasar</h1>
                    <p>Telusuri, saring, dan urutkan {data.baris.length.toLocaleString('id-ID')} saham AS yang dipantau kantor.</p>
                </div>
            </section>
            <section className="sb-card sb-breadth">
                <div className="sb-breadth-bar">
                    <div className="sb-breadth-lbl"><span className="up">{p.naik} naik</span><span>{p.tetap} tetap</span><span className="down">{p.turun} turun</span></div>
                    <div className="sb-bars"><i className="up" style={{ flex: p.naik / total }} /><i className="flat" style={{ flex: p.tetap / total }} /><i className="down" style={{ flex: p.turun / total }} /></div>
                </div>
                <div className="sb-stat"><span>Total kapitalisasi</span><b>{kap(p.mcap)}</b></div>
                <div className="sb-stat"><span>Sektor teratas</span><b>{sektorTop ? <>{sektorTop.nama} <em className={sektorTop.chg >= 0 ? 'up' : 'down'}>{persen(sektorTop.chg, 1)}</em></> : '–'}</b></div>
                <div className="sb-stat"><span>Penutupan terakhir</span><b>{data.teknikalSesi ? new Date(`${data.teknikalSesi}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–'}</b></div>
            </section>

            <section className="sb-card sb-table-card">
                <div className="sb-tools">
                    <div className="sb-search"><span><Ikon e="⌕" /></span><input placeholder="Cari ticker atau nama" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                    <div className="sb-seg">{(['Semua', 'Beli', 'Tahan', 'Jual'] as Grup[]).map((g) => <button key={g} className={grup === g ? 'on' : ''} onClick={() => setGrup(g)}>{g} <small>{hitung(g)}</small></button>)}</div>
                </div>
                <div className="sb-faktor">
                    <span>Sinyal berdasarkan</span>
                    {FAKTOR.map((f) => <button key={f.k} title={f.info} className={faktor === f.k ? 'on' : ''} onClick={() => setFaktor(f.k)}><Ikon e={f.ico} /> {f.label}</button>)}
                </div>
                <div className="sb-chips">
                    <button className={!sektor ? 'on' : ''} onClick={() => setSektor('')}>Semua <small>{data.baris.length}</small></button>
                    {p.sektor.map((s) => <button key={s.nama} className={sektor === s.nama ? 'on' : ''} onClick={() => setSektor(s.nama)}>{s.nama} <small>{s.n}</small></button>)}
                </div>
                <div className="sb-table-wrap">
                    <table className="sb-table">
                        <thead><tr>{KOLOM.map((c) => (
                            <th key={c.k} className={`${c.num ? 'num' : ''} col-${c.k}`} onClick={() => c.k !== 'spark' && setUrut({ k: c.k, asc: urut.k === c.k ? !urut.asc : c.k === 's' || c.k === 'sektor' })}>
                                {c.label}{urut.k === c.k ? (urut.asc ? ' ↑' : ' ↓') : ''}
                            </th>
                        ))}</tr></thead>
                        <tbody>
                            {list.slice(0, batas).map((b) => {
                                const sk = b.skor?.[faktor];
                                return (
                                    <tr key={b.s} onClick={() => onOpen(b.s)}>
                                        <td className="col-s"><b className="mono">{b.s}</b><small>{b.nama}</small></td>
                                        <td className="col-sektor">{b.sektor || '–'}</td>
                                        <td className="num mono">{usd(b.harga)}</td>
                                        <td className={`num mono ${b.chg1d >= 0 ? 'up' : 'down'}`}>{b.chg1d >= 0 ? '▲' : '▼'} {Math.abs(b.chg1d).toFixed(2)}%</td>
                                        <td className="col-spark">{b.x && <Sparkline data={b.x.spark} w={96} h={28} />}</td>
                                        <td className="num mono">{vol(b.vol)}</td>
                                        <td className="num mono">{kap(kapOf(b))}</td>
                                        <td className="col-sinyal">{sk ? <span className={`lb ${kelas(sk.label)}`}>{sk.label.toUpperCase()}</span> : <span className="lb lb-none">–</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {list.length > batas && <button className="sb-more" onClick={() => setBatas(batas + 60)}>Tampilkan lagi ({list.length - batas} tersisa)</button>}
                {list.length === 0 && (q.trim() ? <TambahSaham q={q} onSelesai={(x) => { setQ(''); onOpen(x); }} /> : <div className="fin-empty">Tidak ada saham yang cocok.</div>)}
            </section>
        </>
    );
}
