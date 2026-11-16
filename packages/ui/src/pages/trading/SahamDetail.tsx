import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../kantor/connection';
import { useApi } from '../../kantor/api';
import type { FolderData } from './WatchlistView';
import { CandleChart } from '../../components/CandleChart';
import { Baris, FAKTOR, FaktorKey, Label, kelas, usd, persen, kap, skorBar } from './types';
import { PresetPilih, PresetCek, PresetData, PresetEval } from './Preset';
import { Simulasi } from './Simulasi';
import { Bintang, useWatch } from './Bintang';

interface FaktorFull { skor: number; label: Label; alasan: string[] }
interface Profil { nama: string; ringkas: string; deskripsi: string; situs: string; sektor: string; industri: string; alamat: string }
interface Detail { preset?: PresetEval[]; baris: Baris; skor: Record<FaktorKey, FaktorFull | null>; berita: { n: number; judul: Array<{ t: string; s: number; tgl: string; url: string }> } | null; orang: { net: number; beli: number; jual: number; n: number } | null }

export function SahamDetail({ simbol, onBack, H = 20, q = 'h=20', preset, setPreset, mode = 'swing', pd, onMemuat }: { simbol: string; onBack: () => void; H?: number; q?: string; preset?: { t: string; f: string }; setPreset?: (x: { t: string; f: string }) => void; mode?: string; pd?: PresetData | null; onMemuat?: (x: boolean) => void }) {
    const [prof, setProf] = useState<Profil | null>(null);
    const [profErr, setProfErr] = useState('');
    const [sim, setSim] = useState(false);
    useEffect(() => { let a = true; setProf(null); apiGet<Profil>(`/api/kantor/profil/${encodeURIComponent(simbol)}`).then((r) => a && setProf(r)).catch((e) => a && setProfErr(String(e.message || e))); return () => { a = false; }; }, [simbol]);
    const [d, setD] = useState<Detail | null>(null);
    const [err, setErr] = useState('');
    const [msg, setMsg] = useState('');
    const [tab, setTab] = useState<FaktorKey>('teknikal');
    const [menuWl, setMenuWl] = useState(false);
    const fd = useApi<FolderData>('/api/kantor/watchlist-folder', 0);
    const diWatch = useWatch().has(simbol) || !!fd.data?.folders?.some((f) => f.simbol.includes(simbol));
    useEffect(() => {
        let alive = true;
        setErr(''); onMemuat?.(true);
        apiGet<Detail>(`/api/kantor/saham-detail/${encodeURIComponent(simbol)}?${q}`)
            .catch(() => apiGet<Detail>(`/api/kantor/saham/${encodeURIComponent(simbol)}`).then((r) => ({ ...r, berita: null, orang: null })))
            .then((r) => alive && setD(r)).catch((e) => alive && setErr(String(e.message || e)))
            .finally(() => alive && onMemuat?.(false));
        return () => { alive = false; onMemuat?.(false); };
    }, [simbol, q]);
    const aksi = async (fn: () => Promise<any>, ok: string) => { setMsg('…'); try { await fn(); setMsg(ok); } catch (e: any) { setMsg(String(e.message || e)); } };

    if (err) return <><button className="back" onClick={onBack}>‹ Kembali</button><div className="error">{err}</div></>;
    if (!d) return <><button className="back" onClick={onBack}>‹ Kembali</button><div className="fin-empty">Memuat {simbol}…</div></>;
    const b = d.baris, all = d.skor.semua, pr = b.x?.proyeksi, f = b.f;
    const best = pr?.target.find((t) => t.nama === pr.terbaik);
    const atr = b.x?.atr || 0;

    return (
        <>
            <button className="back" onClick={onBack}>‹ Kembali</button>
            <section className="sb-card sd-hero">
                <div className="sd-id">
                    <div className="sd-kick">{b.sektor || 'Saham AS'} · {b.nama}</div>
                    <div className="sd-tick-row">
                        <div className="sd-tick mono">{b.s}</div>
                        <Bintang s={b.s} besar />
                        <div className="wl-menu-wrap">
                            <button className="sd-folder" onClick={() => setMenuWl(!menuWl)} aria-expanded={menuWl} title="Simpan ke folder watchlist">{diWatch ? 'Di Watchlist' : 'Watchlist'} ▾</button>
                            {menuWl && (
                                <div className="wl-menu">
                                    {(fd.data?.folders || []).map((f) => <button key={f.id} onClick={() => { setMenuWl(false); aksi(() => apiPost('/api/kantor/watchlist-folder', { aksi: f.simbol.includes(b.s) ? 'buang' : 'tambah', id: f.id, simbol: b.s }).then(() => fd.reload()), f.simbol.includes(b.s) ? `✓ ${b.s} dikeluarkan dari folder ${f.nama}.` : `✓ ${b.s} masuk folder ${f.nama}.`); }}>{f.ikon} {f.nama} {f.simbol.includes(b.s) ? '✓' : ''}</button>)}
                                    {!(fd.data?.folders || []).length && <small>Belum ada folder. Buat folder di tab Watchlist.</small>}
                                    <small>⭐ Bintang = Watchlist Utama (dipantau Dito).</small>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="sd-price mono">{usd(b.harga)} <span className={b.chg1d >= 0 ? 'up' : 'down'}>{b.chg1d >= 0 ? '▲' : '▼'} {Math.abs(b.chg1d).toFixed(2)}%</span></div>
                    <div className="sd-sub mono">1B {persen(b.chg1m, 1)} · 3B {persen(b.chg3m, 1)} · 1T {persen(b.chg1y, 1)} · RSI {b.rsi ?? '–'} · vol {b.volX}×</div>
                </div>
                {all && (
                    <div className="sd-score">
                        <div className={`sd-gauge ${kelas(all.label)}`} style={{ ['--p' as any]: skorBar(all.skor) }}><b className="mono">{skorBar(all.skor)}</b><small>/100</small></div>
                        <span className={`lb big ${kelas(all.label)}`}>{all.label.toUpperCase()}</span>
                        <div className="sd-mini">{FAKTOR.filter((x) => x.k !== 'semua').map((x) => { const s = d.skor[x.k]; return <span key={x.k} className={`lb sm ${kelas(s?.label)}`} title={x.info}>{x.ico} {s ? s.label : '–'}</span>; })}</div>
                    </div>
                )}
            </section>

            <section className="sb-card sd-prof">
                <div className="sd-h"><h3>Tentang {prof?.nama || b.nama}</h3></div>
                {prof ? (<>
                    <p>{prof.ringkas || prof.deskripsi.slice(0, 400)}</p>
                    <div className="sd-prof-meta">{[prof.sektor, prof.industri, prof.alamat].filter(Boolean).join(' · ')}</div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {prof.situs && <a className="btn" href={prof.situs} target="_blank" rel="noreferrer">🌐 Situs resmi perusahaan</a>}
                        <a className="btn" href={`https://www.nasdaq.com/market-activity/stocks/${b.s.toLowerCase().replace('-', '.')}`} target="_blank" rel="noreferrer">📄 Profil di Nasdaq</a>
                        <a className="btn" href={`https://www.google.com/finance/quote/${b.s.replace('-', '.')}`} target="_blank" rel="noreferrer">🔎 Google Finance</a>
                    </div>
                </>) : <p className="sb-note">{profErr ? `Profil belum bisa diambil (${profErr}).` : 'Memuat profil perusahaan…'}</p>}
            </section>

            <section className="sb-card cc-card"><CandleChart simbol={b.s} /></section>

            {sim ? <Simulasi simbol={b.s} q={q} onTutup={() => setSim(false)} /> : (
                <section className="sb-card sim-cta">
                    <div><b>🎲 Simulasi 10.000 jalur</b><small>Berapa kali harga menyentuh harga masuk, target, atau stop — untuk profil Konservatif, Moderat & Agresif.</small></div>
                    <button className="btn primary" onClick={() => setSim(true)}>Jalankan simulasi</button>
                </section>
            )}

            {pr && (
                <section className="sb-card sd-proj">
                    <div className="sd-h"><h3>Eksekusi & proyeksi <small>posisi ≤{pr.horizon} hari bursa · peluang dari pola harga 1 tahun terakhir</small></h3></div>
                    {best && (
                        <div className={`sd-plan ${/Jual/.test(all?.label || '') ? 'warn' : ''}`}>
                            <div><small>Masuk sekitar</small><b className="mono">{usd(b.harga - atr * 0.5)} – {usd(b.harga)}</b></div>
                            <div><small>Stop loss</small><b className="mono down">{usd(pr.stop.harga)} <em>{pr.stop.pct}%</em></b><span>tersentuh {pr.stop.peluang}% kasus</span></div>
                            <div className="hl"><small>Target utama ★ {best.nama}</small><b className="mono up">{usd(best.harga)} <em>+{best.pct}%</em></b><span>peluang {best.peluang}%</span></div>
                            <div><small>Risiko : hasil</small><b className="mono">1 : {pr.rr}</b><span>peluang naik {pr.peluangNaik}%</span></div>
                        </div>
                    )}
                    {/Jual/.test(all?.label || '') && <p className="sd-warn">⚠️ Sinyal gabungan sedang <b>{all?.label}</b>. Proyeksi di bawah murni statistik pola harga, bukan alasan untuk masuk.</p>}
                    <div className="sd-targets">
                        {pr.target.map((t) => (
                            <div key={t.nama} className={t.nama === pr.terbaik ? 'best' : ''}>
                                <div className="top"><b>{t.nama}{t.nama === pr.terbaik ? ' ★' : ''}</b><span className="mono">{usd(t.harga)}</span></div>
                                <div className="mono up">+{t.pct.toFixed(1)}%</div>
                                <div className="bar"><i style={{ width: `${t.peluang}%` }} /></div>
                                <small>peluang tercapai <b>{t.peluang}%</b> · nilai harapan +{t.nilai.toFixed(2)}%</small>
                            </div>
                        ))}
                    </div>
                    <p className="sb-note">★ = target dengan <b>peluang × potensi</b> tertinggi. Peluang dihitung dari: pada hari-hari serupa setahun terakhir, seberapa sering harga sempat menyentuh level itu dalam {pr.horizon} sesi. Bukan jaminan.</p>
                </section>
            )}

            <section className="sb-card sd-faktor">
                <div className="sb-seg">{FAKTOR.filter((x) => x.k !== 'semua').map((x) => <button key={x.k} className={tab === x.k ? 'on' : ''} onClick={() => setTab(x.k)}>{x.ico} {x.label}</button>)}</div>
                {(() => {
                    const s = d.skor[tab];
                    const info = FAKTOR.find((x) => x.k === tab)!;
                    return (
                        <div className="sd-fbody">
                            <div className="sd-fhead">
                                <span className={`lb ${kelas(s?.label)}`}>{s ? s.label.toUpperCase() : 'BELUM ADA DATA'}</span>
                                <div className="track"><i className={kelas(s?.label)} style={{ width: `${s ? skorBar(s.skor) : 0}%` }} /></div>
                                <b className="mono">{s ? skorBar(s.skor) : '–'}</b>
                            </div>
                            <p className="sb-note">{info.info}</p>
                            {(tab === 'teknikal' || tab === 'fundamental') && pd && setPreset && preset && (() => {
                                const k = tab as 'teknikal' | 'fundamental';
                                const aktif = k === 'teknikal' ? preset.t : preset.f;
                                const evs = (d.preset || []).filter((e) => e.jenis === k);
                                const evA = evs.find((e) => e.id === aktif);
                                return (
                                    <div className="sd-preset">
                                        <div className="pr-l">Preset guru {k} <small>(⭐ = direkomendasikan untuk rencana posisi ini)</small></div>
                                        <PresetPilih jenis={k} aktif={aktif} setAktif={(id) => setPreset(k === 'teknikal' ? { ...preset, t: id } : { ...preset, f: id })} mode={mode} data={pd} />
                                        {evA ? <PresetCek ev={evA} p={pd.preset.find((x) => x.id === evA.id)!} /> : (
                                            <div className="pr-semua">{evs.map((e) => { const p = pd.preset.find((x) => x.id === e.id)!; return (
                                                <button key={e.id} onClick={() => setPreset(k === 'teknikal' ? { ...preset, t: e.id } : { ...preset, f: e.id })}><span>{p.guru} <small>{p.nama}</small></span><b className={`pr-pct ${e.persen == null ? '' : e.persen >= 75 ? 'ok' : e.persen >= 50 ? 'mid' : 'no'}`}>{e.persen == null ? 'data kurang' : `${e.lolos}/${e.dinilai}`}</b></button>
                                            ); })}</div>
                                        )}
                                    </div>
                                );
                            })()}
                            <ul className="sd-alasan">{(s?.alasan || ['Data untuk faktor ini belum tersedia.']).map((a, i) => <li key={i} className={a.startsWith('+') ? 'pos' : a.startsWith('−') ? 'neg' : ''}>{a.replace(/^[+−]\s*/, '')}</li>)}</ul>
                            {tab === 'berita' && d.berita && d.berita.judul.length > 0 && (
                                <div className="sd-news">{d.berita.judul.map((j, i) => (
                                    <a key={i} href={j.url} target="_blank" rel="noreferrer"><span className={`sent ${j.s > 0 ? 'pos' : j.s < 0 ? 'neg' : ''}`}>{j.s > 0 ? 'Positif' : j.s < 0 ? 'Negatif' : 'Netral'}</span><b>{j.t}</b><small>{j.tgl}</small></a>
                                ))}</div>
                            )}
                            {tab === 'whales' && (
                                <div className="sd-kv mono">
                                    <div><small>CMF 20</small><b>{b.x?.cmf ?? '–'}</b></div>
                                    <div><small>OBV 20 hari</small><b>{b.x?.obv ?? '–'}</b></div>
                                    <div><small>Orang dalam beli</small><b>{d.orang ? usd(d.orang.beli, 0) : '–'}</b></div>
                                    <div><small>Orang dalam jual</small><b>{d.orang ? usd(d.orang.jual, 0) : '–'}</b></div>
                                </div>
                            )}
                            {tab === 'fundamental' && f && (
                                <div className="sd-kv mono">
                                    <div><small>ROE</small><b>{f.roe ?? '–'}%</b></div><div><small>ROA</small><b>{f.roa ?? '–'}%</b></div>
                                    <div><small>PER</small><b>{f.per ?? '–'}×</b></div><div><small>PBV</small><b>{f.pbv ?? '–'}×</b></div>
                                    <div><small>DER</small><b>{f.der ?? '–'}×</b></div><div><small>Margin laba</small><b>{f.npm ?? '–'}%</b></div>
                                    <div><small>Tumbuh pendapatan</small><b>{f.revGrowth ?? '–'}%</b></div><div><small>Kapitalisasi</small><b>{kap(b.mcap ?? f.mcap)}</b></div>
                                    <div><small>P/S</small><b>{(f as any).ps ?? '–'}×</b></div><div><small>Current ratio</small><b>{(f as any).cr ?? '–'}×</b></div>
                                    <div><small>Laba tumbuh/th (3 th)</small><b>{(f as any).epsCagr3 ?? '–'}%</b></div><div><small>Arus kas bebas</small><b>{(f as any).fcf != null ? `$${((f as any).fcf / 1000).toFixed(1)} M` : '–'}</b></div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </section>

            <section className="sb-card">
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => aksi(() => apiPost('/api/kantor/investigasi/selidiki', { simbol: b.s }), `✓ Kasus ${b.s} siap — buka tab Investigasi.`)}>🔎 Selidiki pergerakannya</button>
                    <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent('kantor:tanya-trading', { detail: `Bagaimana ${b.s} menurut data untuk rencana posisi ini? Layak dipantau atau tidak, dan apa risikonya?` }))}>💬 Tanya tim trading</button>
                </div>
                {msg && <div className="sb-note" style={{ marginTop: 8 }}>{msg}</div>}
                <p className="sb-note">Kantor tidak tersambung ke broker. Untuk riset, bukan saran beli/jual.</p>
            </section>
        </>
    );
}
