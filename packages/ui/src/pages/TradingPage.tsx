import React, { useState } from 'react';
import { useSubNav } from '../kantor/subnav';
import { Horison, HorisonBar, nilaiH } from './trading/Horison';
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
import { PetaPanas } from './trading/PetaPanas';
import { PetaBerita } from './trading/PetaBerita';
import { WatchlistView } from './trading/WatchlistView';
import { FaktorKey, ScreenerData } from './trading/types';

const LS_TAB = 'kantor:trading-tab';

const LAPORAN_NAMA: Record<string, string> = { berita: '📰 Nina · Berita', fundamental: '📊 Raka · Analis', smartmoney: '🐋 Sari · Smart Money' };

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
            <div className="tr-range-labels"><span>🔴 ${stop}</span><span>masuk ${entry}</span><span>🟢 ${target}</span></div>
        </div>
    );
}

export function TradingPage() {
    const { data, error, reload } = useApi<TradingData>('/api/kantor/trading', 120_000);
    const agents = useKantor((s) => s.agents);
    const team = agents.filter((a) => a.id === 'trading' || a.id.startsWith('trading-'));
    const [lap, setLap] = useState(0);
    const [grafik, setGrafik] = useState<string | null>(null);
    type Tab = 'pasar' | 'pilihan' | 'panas' | 'berita' | 'watchlist' | 'penyaring' | 'investigasi' | 'posisi';
    const TABS: Array<{ k: Tab; label: string }> = [{ k: 'pasar', label: 'Pasar' }, { k: 'pilihan', label: 'Pilihan sinyal' }, { k: 'panas', label: 'Peta panas' }, { k: 'berita', label: 'Peta berita' }, { k: 'watchlist', label: 'Watchlist' }, { k: 'penyaring', label: 'Penyaring' }, { k: 'investigasi', label: 'Investigasi' }, { k: 'posisi', label: 'Posisi saya' }];
    const [tab, setTabState] = useState<Tab>(() => { try { const v = localStorage.getItem(LS_TAB) as Tab; return TABS.some((t) => t.k === v) ? v : 'pilihan'; } catch { return 'pilihan'; } });
    const [saham, setSaham] = useState<string | null>(null);
    const [faktor, setFaktor] = useState<FaktorKey>(() => { try { return (localStorage.getItem('kantor:faktor') as FaktorKey) || 'semua'; } catch { return 'semua'; } });
    const setF = (f: FaktorKey) => { setFaktor(f); try { localStorage.setItem('kantor:faktor', f); } catch { /* */ } };
    const [horison, setHorisonS] = useState<Horison>(() => { try { const v = JSON.parse(localStorage.getItem('kantor:horison') || ''); if (v?.mode === 'tanggal' && !(v.tanggal > new Date().toISOString().slice(0, 10))) return { mode: 'harian' }; return v?.mode ? v : { mode: 'harian' }; } catch { return { mode: 'harian' }; } });
    const setHorison = (h: Horison) => { setHorisonS(h); try { localStorage.setItem('kantor:horison', JSON.stringify(h)); } catch { /* */ } };
    const H = nilaiH(horison);
    const sc = useApi<ScreenerData>(`/api/kantor/screener?h=${H}`, 600_000);
    React.useEffect(() => { if (!sc.data?.sibuk) return; const t = setInterval(() => sc.reload(), 8000); return () => clearInterval(t); }, [sc.data?.sibuk]);
    const setTab = (t: Tab) => { setSaham(null); setTabState(t); try { localStorage.setItem(LS_TAB, t); } catch { /* */ } document.querySelector('.pg')?.scrollTo({ top: 0 }); };
    // Menu bawah HP: yang paling sering dipakai di depan, sisanya masuk "Lainnya".
    const IKON: Record<Tab, string> = { pilihan: '🎯', watchlist: '⭐', panas: '🟩', berita: '🪐', pasar: '🌐', penyaring: '🔍', investigasi: '🕵️', posisi: '💼' };
    const PENDEK: Partial<Record<Tab, string>> = { pilihan: 'Sinyal', panas: 'Heatmap', berita: 'Berita', posisi: 'Posisi' };
    useSubNav((['pilihan', 'watchlist', 'panas', 'berita', 'pasar', 'penyaring', 'investigasi', 'posisi'] as Tab[]).map((k) => ({ k, ico: IKON[k], label: PENDEK[k] || TABS.find((t) => t.k === k)!.label })), tab, (k) => setTab(k as Tab));
    const buka = (s: string) => { setSaham(s); document.querySelector('.pg')?.scrollTo({ top: 0 }); };
    const perbarui = async () => { try { await apiPost('/api/kantor/screener/perbarui', { jenis: 'teknikal' }); setTimeout(() => sc.reload(), 1500); setTimeout(() => sc.reload(), 6000); } catch (e: any) { alert(`Gagal memulai: ${e?.message || e}`); } };
    const realized = (data?.history || []).reduce((a, h) => a + (h.pnl || 0), 0);
    const open = (data?.positions || []).reduce((a, p) => a + (p.pnl || 0), 0);

    return (
        <div className="pg pg-trading">
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
            <nav className="sb-nav">
                {TABS.map((t) => <button key={t.k} className={tab === t.k && !saham ? 'on' : ''} onClick={() => setTab(t.k)}>{t.label}</button>)}
                <span className="sb-nav-judul">{TABS.find((t) => t.k === tab)?.label}</span>
                <span className="sb-nav-sp" />
                {sc.data?.sibuk ? <span className="sb-busy">⏳ {sc.data.progres}</span> : <button className="sb-refresh" onClick={() => { perbarui(); reload(); }} title="Ambil data terbaru">↻</button>}
            </nav>
            {saham && <><HorisonBar h={horison} setH={setHorison} /><SahamDetail key={`${saham}-${H}`} simbol={saham} H={H} onBack={() => setSaham(null)} /></>}
            {!saham && ['pasar', 'pilihan', 'panas', 'watchlist'].includes(tab) && !sc.data && <div className="fin-empty">{sc.error ? `Gagal memuat: ${sc.error}` : 'Memuat data pasar…'}</div>}
            {!saham && ['pasar', 'pilihan', 'panas'].includes(tab) && sc.data && sc.data.baris.length === 0 && (
                <div className="sb-card sb-kosong">
                    {sc.data.sibuk ? (<>
                        <b>⏳ Sedang mengambil data pasar…</b>
                        <p>{sc.data.progres || 'menyiapkan'} — biasanya 5–10 menit untuk ±500 saham. Halaman ini terisi sendiri, tidak perlu dimuat ulang.</p>
                        <div className="sb-prog"><i style={{ width: `${(() => { const m = /(\d+)\/(\d+)/.exec(sc.data.progres || ''); return m ? Math.round((+m[1] / +m[2]) * 100) : 5; })()}%` }} /></div>
                    </>) : (<>
                        <b>Data pasar belum ada</b>
                        <p>Ambil harga ±500 saham S&P 500 + watchlist (5–10 menit). Setelah itu otomatis diperbarui tiap bursa AS tutup.</p>
                        <button className="btn primary" onClick={() => { perbarui(); reload(); }}>↻ Ambil data sekarang</button>
                    </>)}
                    {sc.data.galat && !sc.data.sibuk && <div className="error">⚠️ {sc.data.galat}</div>}
                </div>
            )}
            {!saham && sc.data && sc.data.baris.length > 0 && sc.data.galat && !sc.data.sibuk && <div className="error" style={{ margin: '0 0 12px' }}>⚠️ {sc.data.galat}</div>}
            {!saham && (tab === 'pilihan' || tab === 'pasar' || tab === 'watchlist') && sc.data && sc.data.baris.length > 0 && <HorisonBar h={horison} setH={setHorison} bobot={(sc.data as any).bobot} />}
            {!saham && tab === 'pasar' && sc.data && sc.data.baris.length > 0 && <PasarView data={sc.data} faktor={faktor} setFaktor={setF} onOpen={buka} />}
            {!saham && tab === 'pilihan' && sc.data && sc.data.baris.length > 0 && <PilihanView data={sc.data} faktor={faktor} setFaktor={setF} onOpen={buka} watchlist={[...(data?.watchlist || []), ...(data?.positions || []).map((p) => p.symbol)]} />}
            {!saham && tab === 'panas' && sc.data && sc.data.baris.length > 0 && <PetaPanas data={sc.data} onOpen={buka} watch={[...(data?.watchlist || []), ...(data?.positions || []).map((p) => p.symbol)]} />}
            {!saham && tab === 'berita' && <PetaBerita onOpen={buka} />}
            {!saham && tab === 'watchlist' && sc.data && <WatchlistView data={sc.data} faktor={faktor} onOpen={buka} />}
            {!saham && tab === 'investigasi' && <InvestigasiView />}
            {!saham && tab === 'penyaring' && <ScreenerView onOpen={buka} />}
            {!saham && tab === 'posisi' && error && <div className="error">Gagal memuat: {error}</div>}
            {!saham && tab === 'posisi' && data && (
                <>
                    <div className="fin-mini">
                        <div><span>Modal</span><b>${data.capital}</b></div>
                        <div><span>Risiko / transaksi</span><b>{data.riskPct}% (${(data.capital * data.riskPct / 100).toFixed(0)})</b></div>
                        <div><span>Berjalan</span><b style={{ color: open >= 0 ? 'var(--good)' : '#fb7185' }}>{open >= 0 ? '+' : '−'}${Math.abs(open).toFixed(2)}</b></div>
                        <div><span>Sudah ditutup</span><b style={{ color: realized >= 0 ? 'var(--good)' : '#fb7185' }}>{realized >= 0 ? '+' : '−'}${Math.abs(realized).toFixed(2)}</b></div>
                    </div>

                    <section className="fin-card">
                        <h3>Posisi terbuka <small>{data.positions.length} saham</small></h3>
                        {data.positions.length === 0 && <div className="fin-empty">Belum ada. Setelah beli di broker, bilang ke Dito: "eksekusi #1 di 251".</div>}
                        {data.positions.map((p) => (
                            <div key={p.symbol} className="tr-pos">
                                <div className="tr-pos-head" onClick={() => setGrafik(grafik === p.symbol ? null : p.symbol)} style={{ cursor: 'pointer' }}>
                                    <b>{p.symbol}</b><span className="tr-chart-btn">{grafik === p.symbol ? '▾ grafik' : '📊 grafik'}</span><span>{p.shares || '?'} lembar @ ${p.entry}</span>
                                    {p.pnl !== null && <span className={`tr-pnl ${p.pnl >= 0 ? 'in' : 'out'}`}>{p.pnl >= 0 ? '+' : '−'}${Math.abs(p.pnl).toFixed(2)}</span>}
                                </div>
                                <Range stop={p.stop} entry={p.entry} target={p.target} price={p.price} />
                                {grafik === p.symbol && <div className="tr-chart"><CandleChart simbol={p.symbol} /></div>}
                                {(p.notified?.target || p.notified?.stop) && <div className="fin-alert" style={{ marginTop: 6 }}>{p.notified?.target ? '🟢 Target sudah tercapai — sudah jual?' : '🔴 Stop loss tersentuh — sudah jual?'}</div>}
                            </div>
                        ))}
                    </section>

                    <section className="fin-card">
                        <h3>Strategi terbaru <small>dari Dito</small></h3>
                        {data.plans.length === 0 && <div className="fin-empty">Belum ada. Strategi dikirim tiap hari kerja ±20.00 WIB, atau minta Dito kapan saja.</div>}
                        {data.plans.map((p) => (
                            <div key={p.id} className="fin-tx">
                                <div className="tr-id">#{p.id}</div>
                                <div className="fin-tx-main"><b>{p.symbol} · masuk ±${p.entry}</b><span>🟢 ${p.target} · 🔴 ${p.stop} · {p.shares} lembar (≈${p.dollars}) · {p.trend}</span></div>
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
    );
}
