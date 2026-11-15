import React, { useState } from 'react';
import { useApi, TradingData } from '../kantor/api';
import { useKantor, statusOf } from '../kantor/store';
import { Avatar } from '../components/Avatar';
import { InvestigasiView } from './InvestigasiView';
import { ScreenerView } from './ScreenerView';

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
    const { data, error, loading, reload } = useApi<TradingData>('/api/kantor/trading', 120_000);
    const agents = useKantor((s) => s.agents);
    const team = agents.filter((a) => a.id === 'trading' || a.id.startsWith('trading-'));
    const [lap, setLap] = useState(0);
    type Tab = 'posisi' | 'penyaring' | 'investigasi';
    const [tab, setTabState] = useState<Tab>(() => { try { const v = localStorage.getItem(LS_TAB); return v === 'investigasi' || v === 'penyaring' ? v : 'posisi'; } catch { return 'posisi'; } });
    const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem(LS_TAB, t); } catch { /* */ } };
    const realized = (data?.history || []).reduce((a, h) => a + (h.pnl || 0), 0);
    const open = (data?.positions || []).reduce((a, p) => a + (p.pnl || 0), 0);

    return (
        <div className="pg">
            <div className="pg-head">
                <div><h2>📈 Trading</h2><p>Saham AS · alert target & stop dikirim ke Telegram · bukan nasihat keuangan</p></div>
                <button className="icon-btn" onClick={() => reload()} disabled={loading} title="Muat ulang">{loading ? '…' : '↻'}</button>
            </div>
            <div className="tabs" style={{ margin: 0 }}>
                <button className={`tab ${tab === 'posisi' ? 'active' : ''}`} onClick={() => setTab('posisi')}>Posisi</button>
                <button className={`tab ${tab === 'penyaring' ? 'active' : ''}`} onClick={() => setTab('penyaring')}>🧪 Penyaring</button>
                <button className={`tab ${tab === 'investigasi' ? 'active' : ''}`} onClick={() => setTab('investigasi')}>🔎 Investigasi</button>
            </div>
            {tab === 'investigasi' && <InvestigasiView />}
            {tab === 'penyaring' && <ScreenerView />}
            {tab === 'posisi' && error && <div className="error">Gagal memuat: {error}</div>}
            {tab === 'posisi' && data && (
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
                                <div className="tr-pos-head">
                                    <b>{p.symbol}</b><span>{p.shares || '?'} lembar @ ${p.entry}</span>
                                    {p.pnl !== null && <span className={`tr-pnl ${p.pnl >= 0 ? 'in' : 'out'}`}>{p.pnl >= 0 ? '+' : '−'}${Math.abs(p.pnl).toFixed(2)}</span>}
                                </div>
                                <Range stop={p.stop} entry={p.entry} target={p.target} price={p.price} />
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
