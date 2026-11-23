import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../kantor/connection';
import { useApi, apiGetSimpan, simpanApi } from '../../kantor/api';
import { GrafikSaham, DataCandle } from '../../components/GrafikSaham';
import { TandaLaba } from './Acara';
import { WeeklyInsight, MarketStats, FundLengkap, Experts, NewsSentiment, Seasonality, CorporateActions, DataEkstra } from './HalamanSaham';
import { Baris, FAKTOR, FaktorKey, Label, kelas, usd, persen, kap, skorBar } from './types';
import { PresetPilih, PresetCek, PresetData, PresetEval } from './Preset';
import { Simulasi } from './Simulasi';
import { Bintang, TombolFolder } from './Bintang';
import { BarisDiskon } from './PilihanView';
import { TambahSaham } from './TambahSaham';
import { PegangPosisi } from './PegangPosisi';
import type { TradingData } from '../../kantor/api';

import { Ikon } from '../../components/Ikon';
import { Info, InfoKamus } from './InfoI';
import * as K from './kamus';
const kalimat = (l: string) => l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
/** Satu kotak indikator: nama + ⓘ, angka, status singkat. */
function KV({ x }: { x: K.Bacaan }) {
    return <div><small>{x.judul} <InfoKamus x={x} /></small><b className="mono">{x.nilai}</b>{x.status && <em className={`t-${x.nada}`}>{x.status}</em>}</div>;
}
interface FaktorFull { skor: number; label: Label; alasan: string[] }
interface Profil { nama: string; ringkas: string; deskripsi: string; situs: string; sektor: string; industri: string; alamat: string }
interface Detail { preset?: PresetEval[]; baris: Baris; skor: Record<FaktorKey, FaktorFull | null>; berita: { n: number; judul: Array<{ t: string; s: number; tgl: string; url: string }> } | null; orang: { net: number; beli: number; jual: number; n: number } | null }

export function SahamDetail({ simbol, onBack, H = 20, q = 'h=20', preset, setPreset, mode = 'swing', pd, onMemuat, onInfo }: { simbol: string; onBack: () => void; H?: number; q?: string; preset?: { t: string; f: string }; setPreset?: (x: { t: string; f: string }) => void; mode?: string; pd?: PresetData | null; onMemuat?: (x: boolean) => void; onInfo?: (x: { bukti: any; bobot: any }) => void }) {
    const [prof, setProf] = useState<Profil | null>(null);
    const [profErr, setProfErr] = useState('');
    const [sim, setSim] = useState(false);
    useEffect(() => { let a = true; setProf(null); apiGet<Profil>(`/api/kantor/profil/${encodeURIComponent(simbol)}`).then((r) => a && setProf(r)).catch((e) => a && setProfErr(String(e.message || e))); return () => { a = false; }; }, [simbol]);
    const [d, setD] = useState<Detail | null>(null);
    const [err, setErr] = useState('');
    const [msg, setMsg] = useState('');
    const [qKunci, setQKunci] = useState(0);
    type Tab = 'overview' | 'fundamental' | 'teknikal' | 'berita' | 'whales' | 'aksi' | 'musiman';
    const [tab, setTabS] = useState<Tab>(() => { try { return (localStorage.getItem('kantor:saham:tab') as Tab) || 'overview'; } catch { return 'overview'; } });
    const setTab = (t: Tab) => { setTabS(t); try { localStorage.setItem('kantor:saham:tab', t); } catch { /* */ } };
    const ek = useApi<DataEkstra>(`/api/kantor/saham-ekstra/${encodeURIComponent(simbol)}`, 0);
    const [ext, setExt] = useState<DataCandle['ext']>(null);
    useEffect(() => { let a = true; setExt(null); apiGet<DataCandle>(`/api/kantor/candle/${encodeURIComponent(simbol)}?r=1D`).then((r) => a && setExt(r.ext)).catch(() => { /* tidak wajib */ }); return () => { a = false; }; }, [simbol]);
    const [pegang, setPegang] = useState(false);
    const td = useApi<TradingData>('/api/kantor/trading', 0);
    const dipegang = td.data?.positions.find((p) => p.symbol === simbol);
    useEffect(() => {
        let alive = true;
        const url = `/api/kantor/saham-detail/${encodeURIComponent(simbol)}?${q}`;
        const c = simpanApi<Detail>(url);
        setErr('');
        if (c) { setD(c); onInfo?.({ bukti: (c as any).teknikalBukti, bobot: (c as any).bobot }); } // kombinasi yang pernah dibuka → tampil seketika
        else onMemuat?.(true);
        apiGetSimpan<Detail>(url, 60_000)
            .catch(() => apiGet<Detail>(`/api/kantor/saham/${encodeURIComponent(simbol)}`).then((r) => ({ ...r, berita: null, orang: null })))
            .then((r) => { if (alive) { setD(r); onInfo?.({ bukti: (r as any).teknikalBukti, bobot: (r as any).bobot }); } }).catch((e) => alive && setErr(String(e.message || e)))
            .finally(() => alive && onMemuat?.(false));
        return () => { alive = false; onMemuat?.(false); };
    }, [simbol, q, qKunci]);
    const aksi = async (fn: () => Promise<any>, ok: string) => { setMsg('…'); try { await fn(); setMsg(ok); } catch (e: any) { setMsg(String(e.message || e)); } };

    const [ulang, setUlang] = useState(0);
    // Saham belum ada di penyaring (mis. TSM) → tawarkan tambah & analisis, lalu muat ulang halaman ini.
    if (err && !/penyaring|tidak ditemukan|tidak ada|404/i.test(err)) return <><button className="back" onClick={onBack}>‹ Kembali</button><div className="error">{err}</div></>;
    if (err) return <><button className="back" onClick={onBack}>‹ Kembali</button><TambahSaham key={ulang} q={simbol} onSelesai={() => { setErr(''); setD(null); setUlang((x) => x + 1); setQKunci((x) => x + 1); }} /><small className="sb-note">{err}</small></>;
    if (!d) return <><button className="back" onClick={onBack}>‹ Kembali</button><div className="fin-empty">Memuat {simbol}…</div></>;
    const b = d.baris, all = d.skor.semua, pr = b.x?.proyeksi, f = b.f;
    const best = pr?.target.find((t) => t.nama === pr.terbaik);
    const atr = b.x?.atr || 0;

    const TABS: Array<[Tab, string]> = [['overview', 'Overview'], ['fundamental', 'Fundamentals'], ['teknikal', 'Technical'], ['berita', 'News'], ['whales', 'Whales'], ['aksi', 'Corporate actions'], ['musiman', 'Seasonality']];
    return (
        <>
            <button className="back" onClick={onBack}>‹ Kembali</button>
            <section className="sb-card sd-hero">
                <div className="sd-id">
                    <div className="sd-kick">{b.sektor || 'Saham AS'}</div>
                    <div className="sd-tick-row">
                        <div className="hs-nama"><h2>{prof?.nama || b.nama}</h2><span className="mono">{b.s}</span></div>
                        <Bintang s={b.s} besar />
                        <TombolFolder s={b.s} />
                        <TandaLaba s={b.s} />
                    </div>
                    <div className="hs-harga mono">${Math.floor(b.harga).toLocaleString('en-US')}<sup>.{b.harga.toFixed(2).split('.')[1]}</sup></div>
                    <div className="hs-ubah">
                        {ext && <div className={ext.chg >= 0 ? 'up' : 'down'}>{ext.chg >= 0 ? '↗' : '↘'} ${Math.abs(ext.chg).toFixed(2)} ({Math.abs(ext.pct).toFixed(2)}%) <span>· {ext.sesi === 'pre' ? 'Pre-market' : 'After-hours'}</span></div>}
                        {(() => { const c = b.harga - b.harga / (1 + b.chg1d / 100); return <div className={b.chg1d >= 0 ? 'up' : 'down'}>{b.chg1d >= 0 ? '↗' : '↘'} ${Math.abs(c).toFixed(2)} ({Math.abs(b.chg1d).toFixed(2)}%) <span>· At close</span></div>; })()}
                    </div>
                    <div className="sd-pegang">
                        {dipegang
                            ? <span className="sd-dipegang"><Ikon e="📌" /> Dipegang {dipegang.shares} lembar @ {usd(dipegang.entry)}{dipegang.pnl != null && <b className={dipegang.pnl >= 0 ? 'up' : 'down'}> {dipegang.pnl >= 0 ? '+' : '−'}{usd(Math.abs(dipegang.pnl))}</b>} · target {usd(dipegang.target)} · stop {usd(dipegang.stop)}</span>
                            : <button className="btn primary" onClick={() => setPegang(true)}><Ikon e="📌" /> Pegang posisi</button>}
                    </div>
                    <div className="sd-sub mono">1B {persen(b.chg1m, 1)} · 3B {persen(b.chg3m, 1)} · 1T {persen(b.chg1y, 1)} · RSI {b.rsi ?? '–'} · vol {b.volX}×</div>
                    {(d as any).diskon && <BarisDiskon b={{ ...b, diskon: (d as any).diskon }} />}
                </div>
                {all && (
                    <div className="sd-score">
                        <div className={`sd-gauge ${kelas(all.label)}`} style={{ ['--p' as any]: skorBar(all.skor) }}><b className="mono">{skorBar(all.skor)}</b><small>/100</small></div>
                        <span className={`lb big ${kelas(all.label)}`}>{kalimat(all.label)}</span>
                        <div className="sd-mini">{FAKTOR.filter((x) => x.k !== 'semua').map((x) => { const s = d.skor[x.k]; return <span key={x.k} className={`lb sm ${kelas(s?.label)}`} title={x.info}><Ikon e={x.ico} /> {s ? s.label : '–'}</span>; })}</div>
                    </div>
                )}
            </section>

            {pegang && <PegangPosisi simbol={b.s} harga={b.harga} proyeksi={pr as any} kas={null}
                ai={{ label: all?.label, skor: all?.skor, mode, H, pt: preset?.t || '', pf: preset?.f || '' }}
                onTutup={() => setPegang(false)} onSelesai={(m) => { setPegang(false); setMsg(m); td.reload(); }} />}
            <section className="sb-card gs-card"><GrafikSaham key={b.s} simbol={b.s} /></section>

            <nav className="hs-tabs" role="tablist" aria-label="Bagian halaman saham">
                {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
            </nav>

            {tab === 'overview' && (<>
                <WeeklyInsight key={b.s} s={b.s} />
            {sim ? <Simulasi simbol={b.s} q={q.replace(/&p[tf]=[^&]*/g, '')} onTutup={() => setSim(false)} /> : (
                <section className="sb-card sim-cta">
                    <div><b><Ikon e="🔮" /> Prediksi Kronos</b><small>Model AI candlestick memperkirakan jalur harga ke depan: peluang naik, perkiraan tengah, serta peluang kena target/stop untuk profil Konservatif, Moderat & Agresif.</small></div>
                    <button className="btn primary" onClick={() => setSim(true)}>Lihat prediksi</button>
                </section>
            )}

                <MarketStats b={b} e={ek.data?.ekstra} />
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
                    {/Jual/.test(all?.label || '') && <p className="sd-warn"><Ikon e="⚠" /> Sinyal gabungan sedang <b>{all?.label}</b>. Proyeksi di bawah murni statistik pola harga, bukan alasan untuk masuk.</p>}
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

                <Experts a={ek.data?.analis} galat={ek.data?.analisGalat || ek.error} harga={b.harga} />
            <section className="sb-card sd-prof">
                <div className="sd-h"><h3>Tentang {prof?.nama || b.nama}</h3></div>
                {prof ? (<>
                    <p>{prof.ringkas || prof.deskripsi.slice(0, 400)}</p>
                    <div className="sd-prof-meta">{[prof.sektor, prof.industri, prof.alamat].filter(Boolean).join(' · ')}</div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {prof.situs && <a className="btn" href={prof.situs} target="_blank" rel="noreferrer"><Ikon e="🌐" /> Situs resmi perusahaan</a>}
                        <a className="btn" href={`https://www.nasdaq.com/market-activity/stocks/${b.s.toLowerCase().replace('-', '.')}`} target="_blank" rel="noreferrer"><Ikon e="📄" /> Profil di Nasdaq</a>
                        <a className="btn" href={`https://www.google.com/finance/quote/${b.s.replace('-', '.')}`} target="_blank" rel="noreferrer"><Ikon e="🔎" /> Google Finance</a>
                    </div>
                </>) : <p className="sb-note">{profErr ? `Profil belum bisa diambil (${profErr}).` : 'Memuat profil perusahaan…'}</p>}
            </section>

            </>)}

            {tab === 'berita' && <section className="sb-card"><NewsSentiment key={b.s} s={b.s} /></section>}
            {tab === 'aksi' && <section className="sb-card"><CorporateActions key={b.s} s={b.s} harga={b.harga} /></section>}
            {tab === 'musiman' && <section className="sb-card"><Seasonality key={b.s} s={b.s} /></section>}
            {tab !== 'overview' && tab !== 'musiman' && tab !== 'aksi' && (
            <section className="sb-card sd-faktor">
                {(() => {
                    const s = d.skor[tab as FaktorKey];
                    const info = FAKTOR.find((x) => x.k === tab)!;
                    return (
                        <div className="sd-fbody">
                            <div className="sd-fhead">
                                <span className={`lb ${kelas(s?.label)}`}>{s ? kalimat(s.label) : 'Belum ada data'}</span>
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
                                        <div className="pr-l">Preset guru {k} <small>(<Ikon e="⭐" /> = direkomendasikan untuk rencana posisi ini)</small></div>
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
                            {tab === 'teknikal' && (
                                <div className="sd-kv">
                                    {[K.rsi(b), K.macd(b), K.ma(b, 50), K.ma(b, 200), K.volume(b), K.atr(b), K.posisi52(b), K.momentum(b, 'chg1m'), K.momentum(b, 'chg3m'), K.momentum(b, 'chg1y')].map((x) => <KV key={x.judul} x={x} />)}
                                </div>
                            )}
                            {tab === 'whales' && (
                                <div className="sd-kv">
                                    <KV x={K.cmf(b)} /><KV x={K.obv(b)} />
                                    <div><small>Orang dalam beli <Info judul="Pembelian orang dalam" teks={`${K.ORANG_DALAM.apa}\n\n${K.ORANG_DALAM.baca}`} kini={d.orang ? `${b.s}: ${d.orang.n} transaksi, beli ${usd(d.orang.beli, 0)} · jual ${usd(d.orang.jual, 0)}.` : undefined} /></small><b className="mono">{d.orang ? usd(d.orang.beli, 0) : '–'}</b></div>
                                    <div><small>Orang dalam jual <Info judul="Penjualan orang dalam" teks={`${K.ORANG_DALAM.apa}\n\n${K.ORANG_DALAM.baca}`} /></small><b className="mono">{d.orang ? usd(d.orang.jual, 0) : '–'}</b></div>
                                </div>
                            )}
                            {tab === 'fundamental' && <FundLengkap b={b} e={ek.data?.ekstra} />}
                        </div>
                    );
                })()}
            </section>
            )}

            <section className="sb-card">
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => aksi(() => apiPost('/api/kantor/investigasi/selidiki', { simbol: b.s }), `✓ Kasus ${b.s} siap — buka tab Investigasi.`)}><Ikon e="🔎" /> Selidiki pergerakannya</button>
                    <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent('kantor:tanya-trading', { detail: `Bagaimana ${b.s} menurut data untuk rencana posisi ini? Layak dipantau atau tidak, dan apa risikonya?` }))}><Ikon e="💬" /> Tanya tim trading</button>
                </div>
                {msg && <div className="sb-note" style={{ marginTop: 8 }}>{msg}</div>}
                <p className="sb-note">Kantor tidak tersambung ke broker. Untuk riset, bukan saran beli/jual.</p>
            </section>
        </>
    );
}
