import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../kantor/connection';
import { Tx, BANKS, KAT_COLORS, compute, monthsAvailable, monthLabel, dateLabel, rp, rpShort, delta, todayWib } from '../kantor/finance';

interface Report { transaksi: Tx[]; sheetUrl: string; pencatat: { lastRun: number; lastError: string | null; interval: number }; updatedAt: number }
interface Trading { capital: number; riskPct: number; positions: any[]; plans: any[]; history: any[]; watchlist: string[] }

const LS_TAB = 'kantor:fin-tab';

function Delta({ v, goodWhenUp }: { v: number | null; goodWhenUp: boolean }) {
    if (v === null) return <span className="fin-delta">vs bln lalu: –</span>;
    const up = v >= 0;
    const good = up === goodWhenUp;
    return <span className={`fin-delta ${good ? 'good' : 'bad'}`}>{up ? '▲' : '▼'} {Math.abs(v * 100).toFixed(0)}% vs periode sama bln lalu</span>;
}

function Bars({ items, color, total }: { items: Array<{ k: string; v: number }>; color?: (k: string) => string; total?: number }) {
    const max = Math.max(1, ...items.map((i) => i.v));
    if (!items.length || max <= 1) return <div className="fin-empty">Belum ada data.</div>;
    return (
        <div className="fin-bars">
            {items.map((i) => (
                <div key={i.k} className="fin-bar-row">
                    <div className="fin-bar-label">{i.k}</div>
                    <div className="fin-bar-track"><div className="fin-bar-fill" style={{ width: `${(i.v / max) * 100}%`, background: color ? color(i.k) : 'var(--accent)' }} /></div>
                    <div className="fin-bar-val">{rpShort(i.v)}{total ? <small> · {Math.round((i.v / total) * 100)}%</small> : null}</div>
                </div>
            ))}
        </div>
    );
}

function WeekChart({ weeks, avg }: { weeks: Array<{ label: string; value: number; current: boolean }>; avg: number }) {
    const max = Math.max(1, avg, ...weeks.map((w) => w.value));
    return (
        <div className="fin-cols">
            {avg > 0 && <div className="fin-avg" style={{ bottom: `${(avg / max) * 100}%` }}><span>rata-rata {rpShort(avg)}</span></div>}
            {weeks.map((w) => {
                const boncos = !w.current && avg > 0 && w.value > avg * 1.25;
                return (
                    <div key={w.label} className="fin-col" title={`${w.label}: ${rp(w.value)}`}>
                        <div className="fin-col-bar-wrap">
                            <div className={`fin-col-bar ${boncos ? 'bad' : ''} ${w.current ? 'current' : ''}`} style={{ height: `${(w.value / max) * 100}%` }} />
                        </div>
                        <div className="fin-col-label">{w.label}</div>
                    </div>
                );
            })}
        </div>
    );
}

function DailyChart({ days }: { days: Array<{ day: number; value: number; future: boolean }> }) {
    const max = Math.max(1, ...days.map((d) => d.value));
    return (
        <div className="fin-days">
            {days.map((d) => (
                <div key={d.day} className="fin-day" title={`Tgl ${d.day}: ${rp(d.value)}`}>
                    <div className={`fin-day-bar ${d.future ? 'future' : ''}`} style={{ height: `${Math.max(d.value ? 4 : 1, (d.value / max) * 100)}%` }} />
                    {(d.day === 1 || d.day % 5 === 0) && <span>{d.day}</span>}
                </div>
            ))}
        </div>
    );
}

export function FinancePage({ onClose }: { onClose: () => void }) {
    const [data, setData] = useState<Report | null>(null);
    const [trading, setTrading] = useState<Trading | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [ym, setYm] = useState(todayWib().slice(0, 7));
    const [bank, setBank] = useState('Semua');
    const [tab, setTab] = useState<'ringkasan' | 'transaksi' | 'trading'>(() => {
        try { return (localStorage.getItem(LS_TAB) as any) || 'ringkasan'; } catch { return 'ringkasan'; }
    });
    const [q, setQ] = useState('');
    const [jenis, setJenis] = useState('Semua');

    const load = async (sync = false) => {
        setLoading(true); setError('');
        try {
            const [r, t] = await Promise.all([
                apiGet<Report>(`/api/kantor/keuangan${sync ? '?sync=1' : ''}`),
                apiGet<Trading>('/api/kantor/trading').catch(() => null)
            ]);
            setData(r); setTrading(t);
        } catch (e: any) { setError(String(e?.message || e)); }
        setLoading(false);
    };
    useEffect(() => { load(); }, []);
    useEffect(() => { try { localStorage.setItem(LS_TAB, tab); } catch { /* */ } }, [tab]);

    const months = useMemo(() => monthsAvailable(data?.transaksi || []), [data]);
    const r = useMemo(() => (data ? compute(data.transaksi, ym, bank) : null), [data, ym, bank]);
    const list = useMemo(() => {
        if (!r) return [];
        const qq = q.trim().toLowerCase();
        return r.list.filter((t) => (jenis === 'Semua' || t.jenis === jenis) && (!qq || `${t.pihak} ${t.kat} ${t.bank} ${t.ket}`.toLowerCase().includes(qq)));
    }, [r, q, jenis]);
    const grouped = useMemo(() => {
        const m = new Map<string, Tx[]>();
        list.forEach((t) => m.set(t.d, [...(m.get(t.d) || []), t]));
        return Array.from(m.entries());
    }, [list]);

    return (
        <div className="fin interactive">
            <div className="fin-head">
                <div className="fin-title">
                    <div>
                        <h2>💰 Keuangan</h2>
                        <p>{data ? `Diperbarui ${new Date(data.updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · dicatat otomatis dari email bank` : 'Memuat…'}</p>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                        <button className="icon-btn" title="Ambil transaksi terbaru" onClick={() => load(true)} disabled={loading}>{loading ? '…' : '↻'}</button>
                        <button className="icon-btn" onClick={onClose} title="Tutup">✕</button>
                    </div>
                </div>
                <div className="fin-filters">
                    <select className="select" value={ym} onChange={(e) => setYm(e.target.value)} aria-label="Bulan">
                        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}{m === todayWib().slice(0, 7) ? ' ✓' : ''}</option>)}
                    </select>
                    <select className="select" value={bank} onChange={(e) => setBank(e.target.value)} aria-label="Bank">
                        {['Semua', ...BANKS].map((b) => <option key={b} value={b}>{b === 'Semua' ? 'Semua bank' : b}</option>)}
                    </select>
                </div>
                <div className="tabs" style={{ margin: 0 }}>
                    {(['ringkasan', 'transaksi', 'trading'] as const).map((k) => (
                        <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                            {k === 'ringkasan' ? 'Ringkasan' : k === 'transaksi' ? 'Transaksi' : 'Trading'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="fin-body">
                {error && <div className="error" style={{ marginTop: 0 }}>Gagal memuat: {error}</div>}
                {!data && !error && <div className="fin-empty">Memuat data dari Google Sheets…</div>}

                {r && tab === 'ringkasan' && (
                    <>
                        {r.perluCek.length > 0 && <div className="fin-alert">⚠️ {r.perluCek.length} transaksi perlu dicek di Google Sheets.</div>}
                        <div className="fin-kpis">
                            <div className="fin-kpi" style={{ ['--c' as any]: '#f43f5e' }}><span>Pengeluaran</span><b>{rp(r.keluar)}</b><Delta v={delta(r.keluar, r.prevKeluar)} goodWhenUp={false} /></div>
                            <div className="fin-kpi" style={{ ['--c' as any]: '#22c55e' }}><span>Pemasukan</span><b>{rp(r.masuk)}</b><Delta v={delta(r.masuk, r.prevMasuk)} goodWhenUp /></div>
                            <div className="fin-kpi" style={{ ['--c' as any]: '#818cf8' }}><span>Sisa</span><b>{rp(r.sisa)}</b><span className="fin-delta">{r.rasio === null ? 'Rasio tabungan: –' : `Rasio tabungan ${Math.round(r.rasio * 100)}%`}</span></div>
                            <div className="fin-kpi" style={{ ['--c' as any]: '#f59e0b' }}><span>Rata-rata / minggu</span><b>{rp(r.avgWeek)}</b><span className="fin-delta">Minggu ini {rp(r.thisWeek)}{r.avgWeek ? ` (${Math.round((r.thisWeek / r.avgWeek) * 100)}%)` : ''}</span></div>
                        </div>
                        <div className="fin-mini">
                            <div><span>Minggu paling boncos</span><b>{r.worst.value ? `${r.worst.label} · ${rpShort(r.worst.value)}` : '–'}</b></div>
                            <div><span>Kategori terbesar</span><b>{r.kategori[0] ? `${r.kategori[0].k}` : '–'}</b></div>
                            <div><span>Transaksi terbesar</span><b>{r.top[0] ? `${rpShort(r.top[0].n)} · ${r.top[0].pihak}` : '–'}</b></div>
                            <div><span>Hari paling boros</span><b>{r.borosHari.v ? r.borosHari.k : '–'}</b></div>
                            <div><span>Rata-rata / hari</span><b>{rp(r.perHari)}</b></div>
                            <div><span>Jumlah transaksi</span><b>{r.jumlah}</b></div>
                        </div>

                        <section className="fin-card"><h3>Pengeluaran per minggu <small>12 minggu terakhir · merah = boncos</small></h3><WeekChart weeks={r.weeks} avg={r.avgWeek} /></section>
                        <section className="fin-card"><h3>Per kategori</h3><Bars items={r.kategori} total={r.keluar} color={(k) => KAT_COLORS[k] || '#64748b'} /></section>
                        <section className="fin-card"><h3>Harian <small>{monthLabel(ym)}</small></h3><DailyChart days={r.daily} /></section>
                        <div className="fin-two">
                            <section className="fin-card"><h3>Per bank</h3><Bars items={r.perBank} color={() => '#0ea5e9'} /></section>
                            <section className="fin-card"><h3>Pola hari</h3><Bars items={r.hari} color={() => '#a78bfa'} /></section>
                        </div>
                        <section className="fin-card">
                            <h3>5 pengeluaran terbesar</h3>
                            {r.top.length === 0 && <div className="fin-empty">Belum ada pengeluaran bulan ini.</div>}
                            {r.top.map((t, i) => (
                                <div key={i} className="fin-tx">
                                    <div className="fin-tx-dot" style={{ background: KAT_COLORS[t.kat] || '#64748b' }} />
                                    <div className="fin-tx-main"><b>{t.pihak}</b><span>{t.kat} · {t.bank} · {dateLabel(t.d)}</span></div>
                                    <div className="fin-tx-amt out">−{rpShort(t.n)}</div>
                                </div>
                            ))}
                        </section>
                        {data && <a className="btn small" href={data.sheetUrl} target="_blank" rel="noreferrer" style={{ alignSelf: 'center' }}>Buka Google Sheets ↗</a>}
                    </>
                )}

                {r && tab === 'transaksi' && (
                    <>
                        <div className="fin-filters">
                            <input className="input" placeholder="Cari toko, kategori, bank…" value={q} onChange={(e) => setQ(e.target.value)} />
                            <select className="select" value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Jenis">
                                {['Semua', 'Keluar', 'Masuk', 'Antar Rekening'].map((j) => <option key={j}>{j}</option>)}
                            </select>
                        </div>
                        {grouped.length === 0 && <div className="fin-empty">Tidak ada transaksi.</div>}
                        {grouped.map(([d, xs]) => (
                            <section key={d} className="fin-card">
                                <h3>{dateLabel(d)} <small>−{rpShort(xs.filter((t) => t.jenis === 'Keluar').reduce((a, t) => a + t.n, 0))}</small></h3>
                                {xs.map((t, i) => (
                                    <div key={i} className="fin-tx">
                                        <div className="fin-tx-dot" style={{ background: KAT_COLORS[t.kat] || '#64748b' }} />
                                        <div className="fin-tx-main">
                                            <b>{t.pihak}{t.status === 'Perlu dicek' && <em> · perlu dicek</em>}</b>
                                            <span>{t.t} · {t.kat} · {t.bank}{t.ket ? ` · ${t.ket}` : ''}</span>
                                        </div>
                                        <div className={`fin-tx-amt ${t.jenis === 'Masuk' ? 'in' : t.jenis === 'Keluar' ? 'out' : ''}`}>{t.jenis === 'Masuk' ? '+' : t.jenis === 'Keluar' ? '−' : '⇄ '}{rp(t.n)}</div>
                                    </div>
                                ))}
                            </section>
                        ))}
                    </>
                )}

                {tab === 'trading' && (
                    <>
                        {!trading && <div className="fin-empty">Data trading belum tersedia.</div>}
                        {trading && (
                            <>
                                <div className="fin-mini">
                                    <div><span>Modal</span><b>${trading.capital}</b></div>
                                    <div><span>Risiko / transaksi</span><b>{trading.riskPct}%</b></div>
                                    <div><span>Hasil tertutup</span><b>${trading.history.reduce((a, h) => a + (h.pnl || 0), 0).toFixed(2)}</b></div>
                                </div>
                                <section className="fin-card">
                                    <h3>Posisi terbuka <small>alert dikirim ke Telegram</small></h3>
                                    {trading.positions.length === 0 && <div className="fin-empty">Belum ada. Setelah beli, bilang ke Joni: "eksekusi #1 di 251".</div>}
                                    {trading.positions.map((p) => (
                                        <div key={p.symbol} className="fin-tx">
                                            <div className="fin-tx-main"><b>{p.symbol} · {p.shares || '?'} lembar @ ${p.entry}</b><span>🟢 target ${p.target} · 🔴 stop ${p.stop}{p.notified?.target ? ' · target tercapai' : p.notified?.stop ? ' · stop kena' : ''}</span></div>
                                        </div>
                                    ))}
                                </section>
                                <section className="fin-card">
                                    <h3>Strategi terakhir</h3>
                                    {trading.plans.length === 0 && <div className="fin-empty">Minta ke Joni: "strategi trading hari ini".</div>}
                                    {trading.plans.map((p) => (
                                        <div key={p.id} className="fin-tx">
                                            <div className="fin-tx-main"><b>#{p.id} {p.symbol} · masuk ±${p.entry}</b><span>target ${p.target} · stop ${p.stop} · {p.shares} lembar (≈${p.dollars})</span></div>
                                        </div>
                                    ))}
                                </section>
                                {trading.history.length > 0 && (
                                    <section className="fin-card">
                                        <h3>Riwayat</h3>
                                        {[...trading.history].reverse().map((h, i) => (
                                            <div key={i} className="fin-tx">
                                                <div className="fin-tx-main"><b>{h.symbol} · ${h.entry} → ${h.exit}</b><span>{String(h.closedAt || '').slice(0, 10)}</span></div>
                                                <div className={`fin-tx-amt ${h.pnl >= 0 ? 'in' : 'out'}`}>{h.pnl >= 0 ? '+' : '−'}${Math.abs(h.pnl).toFixed(2)}</div>
                                            </div>
                                        ))}
                                    </section>
                                )}
                                <p className="fin-note">Kantor tidak tersambung ke broker. Harga gratis tertunda ±15 menit. Bukan nasihat keuangan.</p>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
