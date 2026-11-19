import { useAktif } from '../kantor/aktif';
import { useKembali } from '../kantor/kembali';
import React, { useState, useRef, useEffect } from 'react';
import { useSubNav } from '../kantor/subnav';
import { Horison, HorisonBar, nilaiH, paramH, MODE_LAMA } from './trading/Horison';
import { usePreset, PresetPilih, PresetRekomendasi } from './trading/Preset';
import { UjiMundur } from './trading/UjiMundur';
import { HistorySinyal } from './trading/History';
import { useApi, TradingData } from '../kantor/api';
import { apiPost } from '../kantor/connection';
import { useKantor, statusOf } from '../kantor/store';
import { Avatar } from '../components/Avatar';
import { InvestigasiView } from './InvestigasiView';
import { ScreenerView } from './ScreenerView';
import { CandleChart } from '../components/CandleChart';
import { PasarView } from './trading/PasarView';
import { PilihanView } from './trading/PilihanView';
import { SahamDetail } from './trading/SahamDetail';
import { SaranUji } from './trading/SaranUji';
import { TradingChat } from './trading/TradingChat';
import { Portofolio } from './trading/Portofolio';
import { BeritaTerkaitKartu } from './trading/BeritaTerkait';
import { PetaPanas } from './trading/PetaPanas';
import { PetaBerita } from './trading/PetaBerita';
import { WatchlistView } from './trading/WatchlistView';
import { FaktorKey, ScreenerData } from './trading/types';

import { Ikon } from '../components/Ikon';
const LS_TAB = 'kantor:trading-tab';

const LAPORAN_NAMA: Record<string, string> = { berita: 'Nina · Berita', fundamental: 'Raka · Analis', smartmoney: 'Sari · Smart Money' };

function Range({ stop, entry, target, price }: { stop: number; entry: number; target: number; price: number | null }) {
    const lo = Math.min(stop, price ?? stop), hi = Math.max(target, price ?? target);
    const pct = (v: number) => `${((v - lo) / Math.max(0.0001, hi - lo)) * 100}%`;
    return (
        <div className="tr-range">
            <div className="tr-range-bar">
                <div className="tr-zone bad" style={{ left: 0, width: pct(entry) }} />
                <div className="tr-zone good" style={{ left: pct(entry), right: 0 }} />
                <span className="tr-mark entry" style={{ left: pct(entry) }} />
                {price !== null && <span className="tr-mark now" style={{ left: pct(price) }}><i>${price.toFixed(2)}</i></span>}
            </div>
            <div className="tr-range-labels"><span><Ikon e="🔴" /> ${stop}</span><span>masuk ${entry}</span><span><Ikon e="🟢" /> ${target}</span></div>
        </div>
    );
}

export function TradingPage() {
    const { data, error, reload } = useApi<TradingData>('/api/kantor/trading', 120_000);
    const agents = useKantor((s) => s.agents);
    const team = agents.filter((a) => a.id === 'trading' || a.id.startsWith('trading-'));
    const [lap, setLap] = useState(0);
    type Tab = 'pasar' | 'pilihan' | 'panas' | 'berita' | 'watchlist' | 'penyaring' | 'investigasi' | 'posisi' | 'uji' | 'history';
    const TABS: Array<{ k: Tab; label: string }> = [{ k: 'pasar', label: 'Pasar' }, { k: 'pilihan', label: 'Pilihan sinyal' }, { k: 'panas', label: 'Peta panas' }, { k: 'berita', label: 'Peta berita' }, { k: 'watchlist', label: 'Watchlist' }, { k: 'penyaring', label: 'Penyaring' }, { k: 'investigasi', label: 'Investigasi' }, { k: 'posisi', label: 'Portofolio' }, { k: 'history', label: 'History' }, { k: 'uji', label: 'Uji mundur' }];
    const [tab, setTabState] = useState<Tab>(() => { try { const v = localStorage.getItem(LS_TAB) as Tab; return TABS.some((t) => t.k === v) ? v : 'pilihan'; } catch { return 'pilihan'; } });
    // Tab yang pernah dibuka tetap hidup (disembunyikan, bukan dibongkar): pindah tab tidak memuat ulang & filter tidak hilang.
    const [pernah, setPernah] = useState<Set<Tab>>(() => new Set([tab]));
    useEffect(() => { setPernah((p) => (p.has(tab) ? p : new Set([...p, tab]))); }, [tab]);
    const simpanHidup = (k: Tab, isi: React.ReactNode) => (pernah.has(k) ? <div key={`hidup-${k}`} className="tab-hidup" hidden={!!saham || tab !== k}>{isi}</div> : null);
    const [saham, setSaham] = useState<string | null>(null);
    useKembali(!!saham, () => setSaham(null));
    const [faktor, setFaktor] = useState<FaktorKey>(() => { try { return (localStorage.getItem('kantor:faktor') as FaktorKey) || 'semua'; } catch { return 'semua'; } });
    const setF = (f: FaktorKey) => { setFaktor(f); try { localStorage.setItem('kantor:faktor', f); } catch { /* */ } };
    const [horison, setHorisonS] = useState<Horison>(() => { try { const v = JSON.parse(localStorage.getItem('kantor:horison') || ''); if (v?.mode === 'tanggal' && !(v.tanggal > new Date().toISOString().slice(0, 10))) return { mode: 'swingpendek' }; if (v?.mode && MODE_LAMA[v.mode]) return { mode: MODE_LAMA[v.mode] }; return v?.mode ? v : { mode: 'swingpendek' }; } catch { return { mode: 'swingpendek' }; } });
    const setHorison = (h: Horison) => { setHorisonS(h); try { localStorage.setItem('kantor:horison', JSON.stringify(h)); } catch { /* */ } };
    const H = nilaiH(horison);
    const [preset, setPresetS] = useState<{ t: string; f: string }>(() => { try { return JSON.parse(localStorage.getItem('kantor:preset') || '') || { t: '', f: '' }; } catch { return { t: '', f: '' }; } });
    const setPreset = (x: { t: string; f: string }) => { setPresetS(x); try { localStorage.setItem('kantor:preset', JSON.stringify(x)); } catch { /* */ } };
    const pd = usePreset();
    const modeAktif = horison.mode === 'tanggal' ? (H <= 1 ? 'daytrade' : H <= 5 ? 'swingpendek' : H <= 20 ? 'swing' : H <= 60 ? 'posisi' : 'investasi') : horison.mode;
    const qApi = `${paramH(horison)}${preset.t ? `&pt=${preset.t}` : ''}${preset.f ? `&pf=${preset.f}` : ''}`;
    // Saat halaman saham dibuka, daftar 500 saham tidak perlu dihitung ulang tiap ganti preset/horison (data lama tetap dipakai).
    const [qDaftar, setQDaftar] = useState(qApi);
    useEffect(() => { if (!saham) setQDaftar(qApi); }, [qApi, saham]);
    const sc = useApi<ScreenerData>(`/api/kantor/screener?${qDaftar}`, 600_000);
    const [infoDetail, setInfoDetail] = useState<{ bukti: any; bobot: any } | null>(null);
    // Ganti preset/horison: data dimuat ulang, tapi posisi gulir tetap & tampil efek "memuat" (skeleton) di atas isi lama.
    const pgRef = useRef<HTMLDivElement>(null);
    const [kunciTinggi, setKunciTinggi] = useState(0);
    const [segar, setSegar] = useState(false);
    const gulir = useRef(0);
    const qLama = useRef(qApi);
    useEffect(() => {
        if (qLama.current === qApi) return;
        qLama.current = qApi;
        const el = pgRef.current;
        if (el) { gulir.current = el.scrollTop; setKunciTinggi(el.scrollHeight); }
        setSegar(true);
    }, [qApi]);
    const [detailMemuat, setDetailMemuat] = useState(false);
    useEffect(() => {
        if (!segar || sc.loading || detailMemuat) return;
        const t = setTimeout(() => {
            setSegar(false);
            requestAnimationFrame(() => { if (pgRef.current) pgRef.current.scrollTop = gulir.current; setKunciTinggi(0); });
        }, 150);
        return () => clearTimeout(t);
    }, [segar, sc.loading, detailMemuat]);
    // Skeleton hanya tampil kalau memang sedang memuat (kombinasi dari simpanan → langsung tanpa kedip).
    const tampilSegar = segar && (sc.loading || detailMemuat);
    const presetPanel = (
        <section className="sb-card pr-panel">
            <PresetRekomendasi mode={modeAktif} data={pd.data} pakai={(t, f) => setPreset({ t, f })} />
            <div className="pr-l"><Ikon e="📈" /> Preset teknikal</div>
            <PresetPilih jenis="teknikal" aktif={preset.t} setAktif={(t) => setPreset({ ...preset, t })} mode={modeAktif} data={pd.data} />
            <div className="pr-l"><Ikon e="🏛" /> Preset fundamental</div>
            <PresetPilih jenis="fundamental" aktif={preset.f} setAktif={(f) => setPreset({ ...preset, f })} mode={modeAktif} data={pd.data} />
            <p className="sb-note">Preset aktif ikut menentukan skor teknikal/fundamental semua saham: makin banyak kriteria yang lolos, makin tinggi skornya (tidak harus lolos semua).</p>
        </section>
    );
    const terlihat = useAktif();
    React.useEffect(() => { if (!sc.data?.sibuk || !terlihat) return; const t = setInterval(() => sc.reload(), 8000); return () => clearInterval(t); }, [sc.data?.sibuk, terlihat]);
    const setTab = (t: Tab) => { setSaham(null); setTabState(t); try { localStorage.setItem(LS_TAB, t); } catch { /* */ } document.querySelector('.page:not([hidden]) .pg')?.scrollTo({ top: 0 }); };
    // Menu bawah HP: yang paling sering dipakai di depan, sisanya masuk "Lainnya".
    const IKON: Record<Tab, string> = { pilihan: '🎯', watchlist: '⭐', panas: '🟩', berita: '🪐', pasar: '🌐', penyaring: '🔍', investigasi: '🕵️', posisi: '💼', history: '📜', uji: '🧪' };
    const PENDEK: Partial<Record<Tab, string>> = { pilihan: 'Sinyal', panas: 'Heatmap', berita: 'Berita', posisi: 'Portofolio' };
    // 10 tab dikelompokkan jadi 4 supaya tidak membingungkan; isi tiap tab tetap sama.
    const GRUP: Array<{ g: string; label: string; ico: string; tabs: Tab[] }> = [
        { g: 'sinyal', label: 'Sinyal', ico: '🎯', tabs: ['pilihan', 'penyaring', 'watchlist'] },
        { g: 'pasar', label: 'Pasar', ico: '🌐', tabs: ['pasar', 'panas', 'berita'] },
        { g: 'porto', label: 'Portofolio', ico: '💼', tabs: ['posisi', 'history'] },
        { g: 'riset', label: 'Riset', ico: '🧪', tabs: ['investigasi', 'uji'] }
    ];
    const grupDari = (t: Tab) => GRUP.find((x) => x.tabs.includes(t))!;
    const grupAktif = grupDari(tab);
    const terakhirDi = (g: (typeof GRUP)[number]) => { try { const v = localStorage.getItem(`kantor:trading-grup-${g.g}`) as Tab; return g.tabs.includes(v) ? v : g.tabs[0]; } catch { return g.tabs[0]; } };
    useEffect(() => { try { localStorage.setItem(`kantor:trading-grup-${grupAktif.g}`, tab); } catch { /* */ } }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
    useSubNav(GRUP.map((g) => ({ k: g.g, ico: g.ico, label: g.label })), grupAktif.g, (k) => { const g = GRUP.find((x) => x.g === k)!; setTab(g.g === grupAktif.g ? tab : terakhirDi(g)); });
    void IKON; void PENDEK;
    const buka = (s: string) => { setSaham(s); document.querySelector('.page:not([hidden]) .pg')?.scrollTo({ top: 0 }); };
    const perbarui = async () => { try { await apiPost('/api/kantor/screener/perbarui', { jenis: 'teknikal' }); setTimeout(() => sc.reload(), 1500); setTimeout(() => sc.reload(), 6000); } catch (e: any) { alert(`Gagal memulai: ${e?.message || e}`); } };

    return (
        <div className={`pg pg-trading ${tampilSegar ? 'pg-segar' : ''}`} ref={pgRef}>
            <div style={{ minHeight: kunciTinggi || undefined }}>
            {tampilSegar && <div className="pg-segar-pill"><Ikon e="⏳" /> Menghitung ulang sinyal…</div>}
            {sc.data && sc.data.pasar.tape.length > 0 && (() => {
                const isi = [...sc.data.pasar.tape, ...sc.data.baris.filter((b) => (data?.watchlist || []).includes(b.s)).map((b) => ({ s: b.s, nama: b.s, harga: b.harga, chg: b.chg1d }))];
                const item = (t: typeof isi[number], k: string) => (
                    <button key={k} onClick={() => !t.s.startsWith('^') && buka(t.s)}><b>{t.nama}</b> <span className="mono">{t.harga.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span> <em className={`mono ${t.chg >= 0 ? 'up' : 'down'}`}>{t.chg >= 0 ? '▲' : '▼'} {Math.abs(t.chg).toFixed(2)}%</em></button>
                );
                // Running text ala papan bursa: isi digandakan supaya putarannya menyambung tanpa jeda.
                return (
                    <div className="sb-tape"><div className="sb-tape-run" style={{ animationDuration: `${Math.max(20, isi.length * 4)}s` }}>
                        <div className="sb-tape-in">{isi.map((t, i) => item(t, `a${i}`))}</div>
                        <div className="sb-tape-in" aria-hidden="true">{isi.map((t, i) => item(t, `b${i}`))}</div>
                    </div></div>
                );
            })()}
            <nav className="sb-nav tr-grup">
                {GRUP.map((g) => <button key={g.g} className={grupAktif.g === g.g && !saham ? 'on' : ''} onClick={() => setTab(g.g === grupAktif.g ? tab : terakhirDi(g))}>{g.label}</button>)}
                <span className="sb-nav-judul">{grupAktif.label}</span>
                <span className="sb-nav-sp" />
                {sc.data?.sibuk ? <span className="sb-busy"><Ikon e="⏳" /> {sc.data.progres}</span> : <button className="sb-refresh" onClick={() => { perbarui(); reload(); }} title="Ambil data terbaru"><Ikon e="↻" /></button>}
            </nav>
            {!saham && grupAktif.tabs.length > 1 && (
                <div className="tr-sub" role="tablist" aria-label={`Bagian ${grupAktif.label}`}>
                    {grupAktif.tabs.map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{TABS.find((t) => t.k === k)!.label}</button>)}
                </div>
            )}
            {saham && <><HorisonBar h={horison} setH={setHorison} bobot={infoDetail?.bobot} bukti={infoDetail?.bukti ?? (sc.data as any)?.teknikalBukti} /><SahamDetail key={saham} onInfo={setInfoDetail} onMemuat={setDetailMemuat} simbol={saham} H={H} q={qApi} preset={preset} setPreset={setPreset} mode={modeAktif} pd={pd.data} onBack={() => setSaham(null)} /></>}
            {!saham && ['pasar', 'pilihan', 'panas', 'watchlist'].includes(tab) && !sc.data && <div className="fin-empty">{sc.error ? `Gagal memuat: ${sc.error}` : 'Memuat data pasar…'}</div>}
            {!saham && ['pasar', 'pilihan', 'panas'].includes(tab) && sc.data && sc.data.baris.length === 0 && (
                <div className="sb-card sb-kosong">
                    {sc.data.sibuk ? (<>
                        <b><Ikon e="⏳" /> Sedang mengambil data pasar…</b>
                        <p>{sc.data.progres || 'menyiapkan'} — biasanya 5–10 menit untuk ±500 saham. Halaman ini terisi sendiri, tidak perlu dimuat ulang.</p>
                        <div className="sb-prog"><i style={{ width: `${(() => { const m = /(\d+)\/(\d+)/.exec(sc.data.progres || ''); return m ? Math.round((+m[1] / +m[2]) * 100) : 5; })()}%` }} /></div>
                    </>) : (<>
                        <b>Data pasar belum ada</b>
                        <p>Ambil harga ±500 saham S&P 500 + watchlist (5–10 menit). Setelah itu otomatis diperbarui tiap bursa AS tutup.</p>
                        <button className="btn primary" onClick={() => { perbarui(); reload(); }}><Ikon e="↻" /> Ambil data sekarang</button>
                    </>)}
                    {sc.data.galat && !sc.data.sibuk && <div className="error"><Ikon e="⚠" /> {sc.data.galat}</div>}
                </div>
            )}
            {!saham && sc.data && sc.data.baris.length > 0 && sc.data.galat && !sc.data.sibuk && <div className="error" style={{ margin: '0 0 12px' }}><Ikon e="⚠" /> {sc.data.galat}</div>}
            {!saham && (tab === 'pilihan' || tab === 'pasar' || tab === 'watchlist') && sc.data && sc.data.baris.length > 0 && <HorisonBar h={horison} setH={setHorison} bobot={(sc.data as any).bobot} bukti={(sc.data as any).teknikalBukti} />}
            {!saham && tab === 'pasar' && sc.data && sc.data.baris.length > 0 && <PasarView data={sc.data} faktor={faktor} setFaktor={setF} onOpen={buka} />}
            {!saham && (tab === 'pilihan' || tab === 'penyaring') && <SaranUji mode={modeAktif} presetAktif={preset.t} pakaiPreset={(t) => setPreset({ ...preset, t })} />}
            {!saham && tab === 'pilihan' && sc.data && sc.data.baris.length > 0 && (
                <details className="pr-lipat" open={!!(preset.t || preset.f) || undefined}>
                    <summary><Ikon e="🎓" /> Preset guru{preset.t || preset.f ? `: ${[preset.t, preset.f].filter(Boolean).map((id) => pd.data?.preset.find((x) => x.id === id)?.guru || id).join(' + ')}` : ' (opsional)'} <small>— ketuk untuk memilih</small></summary>
                    {presetPanel}
                </details>
            )}
            {!saham && tab === 'pilihan' && sc.data && sc.data.baris.length > 0 && <PilihanView data={sc.data} faktor={faktor} setFaktor={setF} onOpen={buka} watchlist={[...(data?.watchlist || []), ...(data?.positions || []).map((p) => p.symbol)]} />}
            {!saham && tab === 'panas' && sc.data && sc.data.baris.length > 0 && <PetaPanas data={sc.data} onOpen={buka} watch={[...(data?.watchlist || []), ...(data?.positions || []).map((p) => p.symbol)]} />}
            {simpanHidup('berita', <><BeritaTerkaitKartu onUbah={() => sc.reload()} /><PetaBerita onOpen={buka} /></>)}
            {!saham && tab === 'watchlist' && sc.data && <WatchlistView data={sc.data} faktor={faktor} onOpen={buka} />}
            {simpanHidup('investigasi', <InvestigasiView />)}
            {simpanHidup('uji', <UjiMundur />)}
            {simpanHidup('history', <HistorySinyal onOpen={buka} />)}
            {!saham && tab === 'penyaring' && <><HorisonBar h={horison} setH={setHorison} bobot={(sc.data as any)?.bobot} bukti={(sc.data as any)?.teknikalBukti} />{presetPanel}<ScreenerView onOpen={buka} q={qApi} presetAktif={preset} pd={pd.data} sumber={sc} /></>}
            {!saham && tab === 'posisi' && error && <div className="error">Gagal memuat: {error}</div>}
            {!saham && tab === 'posisi' && data && (
                <>
                    <Portofolio onBuka={buka} />

                    <section className="fin-card">
                        <h3>Strategi terbaru <small>dari Dito</small></h3>
                        {data.plans.length === 0 && <div className="fin-empty">Belum ada. Strategi dikirim tiap hari kerja ±20.00 WIB, atau minta Dito kapan saja.</div>}
                        {data.plans.map((p) => (
                            <div key={p.id} className="fin-tx">
                                <div className="tr-id">#{p.id}</div>
                                <div className="fin-tx-main"><b>{p.symbol} · masuk ±${p.entry}</b><span><Ikon e="🟢" /> ${p.target} · <Ikon e="🔴" /> ${p.stop} · {p.shares} lembar (≈${p.dollars}) · {p.trend}</span></div>
                            </div>
                        ))}
                    </section>

                    <section className="fin-card">
                        <h3>Tim Trading</h3>
                        <div className="tr-team">
                            {team.map((a) => {
                                const st = statusOf(a.action);
                                return (
                                    <div key={a.id} className="tr-member">
                                        <Avatar skin={a.skin} size={36} />
                                        <div><b>{a.name}</b><small>{a.title || a.role}</small><span style={{ color: st.color }}>● {st.label}</span></div>
                                    </div>
                                );
                            })}
                            {team.length === 0 && <div className="fin-empty">Tim trading belum terbentuk.</div>}
                        </div>
                        {data.laporan.length > 0 && (
                            <>
                                <div className="tabs" style={{ margin: '12px 0 8px' }}>
                                    {data.laporan.map((l, i) => <button key={l.nama} className={`tab ${lap === i ? 'active' : ''}`} onClick={() => setLap(i)}>{LAPORAN_NAMA[l.nama] || l.nama}</button>)}
                                </div>
                                <div className="tr-report">{data.laporan[Math.min(lap, data.laporan.length - 1)]?.isi}</div>
                                <div className="fin-note">Laporan {data.laporan[0].tanggal}</div>
                            </>
                        )}
                    </section>

                    {data.history.length > 0 && (
                        <section className="fin-card">
                            <h3>Riwayat</h3>
                            {[...data.history].reverse().map((h, i) => (
                                <div key={i} className="fin-tx">
                                    <div className="fin-tx-main"><b>{h.symbol} · ${h.entry} → ${h.exit}</b><span>{String(h.closedAt || '').slice(0, 10)}</span></div>
                                    <div className={`fin-tx-amt ${h.pnl >= 0 ? 'in' : 'out'}`}>{h.pnl >= 0 ? '+' : '−'}${Math.abs(h.pnl).toFixed(2)}</div>
                                </div>
                            ))}
                        </section>
                    )}
                    <section className="fin-card"><h3>Watchlist</h3><div className="tr-watch">{data.watchlist.map((s) => <span key={s} className="chip" style={{ ['--c' as any]: '#22c55e' }}>{s}</span>)}</div></section>
                </>
            )}
            </div>
            <TradingChat q={qApi} saham={saham} mode={modeAktif} />
        </div>
    );
}
