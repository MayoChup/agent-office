import { Bintang } from './Bintang';
import { LencanaKronos, PanelKronos } from './Kronos';
import React, { useMemo, useState } from 'react';
import { Baris, FaktorKey, FAKTOR, LABELS, Label, ScreenerData, kelas, usd, persen, skorBar } from './types';
import { Sparkline, Mom } from './Sparkline';

import { Ikon } from '../../components/Ikon';
type Urut = 'skor' | 'chg1d' | 'potensi' | 'peluang' | 'rsi' | 's';
const URUT: Array<{ k: Urut; label: string }> = [{ k: 'skor', label: 'Skor' }, { k: 'potensi', label: 'Potensi naik' }, { k: 'peluang', label: 'Peluang' }, { k: 'chg1d', label: 'Perubahan' }, { k: 'rsi', label: 'RSI' }, { k: 's', label: 'Kode' }];

export function PilihanView({ data, faktor, setFaktor, onOpen, watchlist }: { data: ScreenerData; faktor: FaktorKey; setFaktor: (f: FaktorKey) => void; onOpen: (s: string) => void; watchlist: string[] }) {
    const [label, setLabel] = useState<Label | 'Semua'>('Semua');
    const [sektor, setSektor] = useState<string>('Sorotan');
    const [urut, setUrut] = useState<Urut>('skor');
    const [q, setQ] = useState('');
    const [mode, setMode] = useState<'grid' | 'list'>('grid');
    const [batas, setBatas] = useState(24);
    const [filterHp, setFilterHp] = useState(false);

    const sorotan = useMemo(() => {
        // Sorotan: watchlist + skor paling kuat (beli kuat/jual kuat) + gerak terbesar.
        const kuat = [...data.baris].sort((a, b) => Math.abs(b.skor?.[faktor]?.skor ?? 0) - Math.abs(a.skor?.[faktor]?.skor ?? 0)).slice(0, 18).map((b) => b.s);
        return new Set([...watchlist, ...kuat]);
    }, [data, faktor, watchlist]);

    const list = useMemo(() => {
        const qq = q.trim().toUpperCase();
        const out = data.baris.filter((b) => {
            if (qq && !b.s.includes(qq) && !b.nama.toUpperCase().includes(qq)) return false;
            if (sektor === 'Sorotan' && !qq && !sorotan.has(b.s)) return false;
            if (sektor !== 'Sorotan' && sektor !== 'Semua' && b.sektor !== sektor) return false;
            if (label !== 'Semua' && b.skor?.[faktor]?.label !== label) return false;
            return true;
        });
        const best = (b: Baris) => b.x?.proyeksi?.target.find((t) => t.nama === b.x?.proyeksi?.terbaik);
        const v = (b: Baris): number => urut === 'skor' ? (b.skor?.[faktor]?.skor ?? -9) : urut === 'potensi' ? (best(b)?.pct ?? -99) : urut === 'peluang' ? (b.x?.proyeksi?.peluangNaik ?? -1) : urut === 'rsi' ? (b.rsi ?? 0) : urut === 'chg1d' ? b.chg1d : 0;
        return out.sort((a, b) => (urut === 's' ? a.s.localeCompare(b.s) : v(b) - v(a)));
    }, [data, label, sektor, urut, q, faktor, sorotan]);

    const hitung = (l: Label | 'Semua') => data.baris.filter((b) => (sektor === 'Sorotan' ? sorotan.has(b.s) : sektor === 'Semua' || b.sektor === sektor) && (l === 'Semua' || b.skor?.[faktor]?.label === l)).length;
    const sektorList = ['Sorotan', 'Semua', ...data.pasar.sektor.map((s) => s.nama)];
    const ringkas = LABELS.map((l) => ({ l, n: data.baris.filter((b) => (sektor === 'Sorotan' ? sorotan.has(b.s) : true) && b.skor?.[faktor]?.label === l).length }));

    return (
        <>
            <section className="sb-hero row-hero">
                <div>
                    <h1>Pilihan sinyal</h1>
                    <p>Sinyal beli, tahan, dan jual tiap saham — dari teknikal, fundamental, berita, dan whales — lengkap dengan target harga dan peluang tercapainya. Data penutupan {data.teknikalSesi || '–'}.</p>
                </div>
                <div className="sb-counts">{ringkas.map((r) => <button key={r.l} className={`sb-count ${kelas(r.l)} ${label === r.l ? 'on' : ''}`} onClick={() => setLabel(label === r.l ? 'Semua' : r.l)}><b>{r.n}</b><span>{r.l}</span></button>)}</div>
            </section>

            <div className="sb-layout">
                <aside className={`sb-card sb-filter ${filterHp ? 'open' : ''}`}>
                    <div className="sb-filter-head"><b>Filter</b><button onClick={() => { setLabel('Semua'); setSektor('Sorotan'); setQ(''); }}>Atur ulang</button></div>
                    <div className="sb-filter-sec">
                        <h4>Faktor</h4>
                        <div className="sb-faktor-list">{FAKTOR.map((f) => <button key={f.k} className={faktor === f.k ? 'on' : ''} onClick={() => setFaktor(f.k)} title={f.info}><span><Ikon e={f.ico} /></span>{f.label}</button>)}</div>
                        <p className="sb-note">{FAKTOR.find((f) => f.k === faktor)?.info}</p>
                    </div>
                    <div className="sb-filter-sec">
                        <h4>Sinyal</h4>
                        {(['Semua', ...LABELS] as Array<Label | 'Semua'>).map((l) => (
                            <button key={l} className={`sb-sig-row ${label === l ? 'on' : ''}`} onClick={() => setLabel(l)}>
                                <i className={`dot ${kelas(l === 'Semua' ? null : l)}`} />{l === 'Semua' ? 'Semua sinyal' : l}<span>{hitung(l)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="sb-filter-sec">
                        <h4>Sektor</h4>
                        <div className="sb-chips small">{sektorList.map((s) => <button key={s} className={sektor === s ? 'on' : ''} onClick={() => setSektor(s)}>{s}</button>)}</div>
                    </div>
                </aside>

                <div className="sb-main">
                    <div className="sb-tools">
                        <div className="sb-search"><span><Ikon e="⌕" /></span><input placeholder="Cari kode atau nama saham" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                        <button className="sb-filter-btn" onClick={() => setFilterHp(!filterHp)}><Ikon e="☰" /> Filter</button>
                        <div className="sb-seg scroll"><span className="sb-seg-lbl">Urutkan</span>{URUT.map((u) => <button key={u.k} className={urut === u.k ? 'on' : ''} onClick={() => setUrut(u.k)}>{u.label}</button>)}</div>
                        <div className="sb-seg icons"><button className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')} aria-label="Kartu"><Ikon e="▦" /></button><button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')} aria-label="Daftar"><Ikon e="☰" /></button></div>
                    </div>
                    {faktor === 'semua' && !!data.ditahan?.n && <div className="sb-tahan-ringkas" role="status">{data.ditahan.n} sinyal ditahan karena datanya belum lengkap ({Object.entries(data.ditahan.per).map(([k, n]) => `${k} ${n}`).join(', ')}). Sinyal hanya keluar kalau teknikal, fundamental, berita &amp; whales semuanya siap.</div>}
                    <div className="sb-meta"><b>{list.length} saham</b> · faktor {FAKTOR.find((f) => f.k === faktor)?.label.toLowerCase()} <span>Data per {data.teknikalSesi || '–'}</span></div>
                    <div className={mode === 'grid' ? 'sb-grid' : 'sb-rows'}>
                        {list.slice(0, batas).map((b) => mode === 'grid' ? <Kartu key={b.s} b={b} faktor={faktor} onOpen={onOpen} /> : <BarisKecil key={b.s} b={b} faktor={faktor} onOpen={onOpen} />)}
                    </div>
                    {list.length > batas && <button className="sb-more" onClick={() => setBatas(batas + 24)}>Tampilkan lagi ({list.length - batas} tersisa)</button>}
                    {list.length === 0 && <div className="fin-empty">Tidak ada saham yang cocok.</div>}
                </div>
            </div>
        </>
    );
}

function FaktorBars({ b }: { b: Baris }) {
    return (
        <div className="sb-fbars">
            {FAKTOR.filter((f) => f.k !== 'semua').map((f) => {
                const s = b.skor?.[f.k];
                return (
                    <div key={f.k} className="sb-fbar" title={s ? `${f.label}: ${s.label}` : `${f.label}: belum ada data`}>
                        <span>{f.label}</span>
                        <div className="track"><i className={kelas(s?.label)} style={{ width: `${s ? skorBar(s.skor) : 0}%` }} /></div>
                        <em className={`t-${kelas(s?.label)}`}>{s ? s.label : '–'}</em>
                    </div>
                );
            })}
        </div>
    );
}

export function Kartu({ b, faktor, onOpen, kronos = 'lencana' }: { b: Baris; faktor: FaktorKey; onOpen: (s: string) => void; kronos?: 'panel' | 'lencana' }) {
    const sk = b.skor?.[faktor];
    const pr = b.x?.proyeksi;
    return (
        <article className="sb-cardx" onClick={() => onOpen(b.s)}>
            <header>
                <div><b className="mono">{b.s}</b><small>{b.nama}</small></div>
                <div className="kc-r">{kronos === 'lencana' && <LencanaKronos s={b.s} />}{sk && <span className={`lb ${kelas(sk.label)}`}>{sk.label.toUpperCase()}</span>}<Bintang s={b.s} /></div>
            </header>
            {faktor === 'semua' && sk?.asli && <div className="sb-tahan" title="Sinyal hanya keluar kalau teknikal, fundamental, berita & whales lengkap">Sinyal {sk.asli} ditahan · menunggu data {sk.kurang?.join(', ')}</div>}
            <div className="sb-price">
                <div><small>Penutupan terakhir</small><b className="mono">{usd(b.harga)}</b><em className={`mono ${b.chg1d >= 0 ? 'up' : 'down'}`}>{persen(b.chg1d)}</em></div>
                {b.x && <Sparkline data={b.x.spark} />}
            </div>
            <div className="sb-trend">
                <span>Tren · <b>{b.x?.trenLabel || '–'}</b></span>
                {b.x && <div className="moms"><Mom label="1W" v={b.x.mom.w1} /><Mom label="1M" v={b.x.mom.m1} /><Mom label="3M" v={b.x.mom.m3} /></div>}
            </div>
            {pr && (
                <div className="sb-targets">
                    {pr.target.map((t) => (
                        <div key={t.nama} className={t.nama === pr.terbaik ? 'best' : ''}>
                            <small>{t.nama}{t.nama === pr.terbaik ? ' ★' : ''}</small>
                            <b className="mono">{usd(t.harga)}</b>
                            <em className="mono up">+{t.pct.toFixed(1)}%</em>
                            <span className="mono">peluang {t.peluang}%</span>
                        </div>
                    ))}
                </div>
            )}
            {kronos === 'panel' && <PanelKronos s={b.s} />}
            <div className="sb-ind">
                <div><small>RSI 14</small><b className="mono">{b.rsi ?? '–'}</b></div>
                <div><small>Peluang naik 20h</small><b className="mono">{pr ? `${pr.peluangNaik}%` : '–'}</b></div>
                <div><small>Rasio vol</small><b className="mono">{b.volX}×</b></div>
            </div>
            <FaktorBars b={b} />
        </article>
    );
}

function BarisKecil({ b, faktor, onOpen }: { b: Baris; faktor: FaktorKey; onOpen: (s: string) => void }) {
    const sk = b.skor?.[faktor];
    const pr = b.x?.proyeksi;
    const best = pr?.target.find((t) => t.nama === pr.terbaik);
    return (
        <div className="sb-row" onClick={() => onOpen(b.s)}>
            <div className="c1 c1-b"><Bintang s={b.s} /><div><b className="mono">{b.s} <LencanaKronos s={b.s} /></b><small>{b.nama}</small></div></div>
            <div className="c2 mono">{usd(b.harga)} <em className={b.chg1d >= 0 ? 'up' : 'down'}>{persen(b.chg1d)}</em></div>
            <div className="c3">{b.x && <Sparkline data={b.x.spark} w={90} h={28} />}</div>
            <div className="c4 mono">{best ? <>→ {usd(best.harga)} <small>({best.peluang}%)</small></> : '–'}</div>
            <div className="c5">{sk && <span className={`lb ${kelas(sk.label)}`} title={sk.asli ? `Sinyal ${sk.asli} ditahan: data ${sk.kurang?.join(', ')} belum siap` : undefined}>{sk.label.toUpperCase()}{sk.asli ? ' ·' : ''}</span>}</div>
        </div>
    );
}
