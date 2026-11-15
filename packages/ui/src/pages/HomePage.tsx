import React, { useMemo } from 'react';
import { useKantor, statusOf } from '../kantor/store';
import { useApi, TradingData, Acara } from '../kantor/api';
import { Tx, compute, rp, rpShort, delta, todayWib } from '../kantor/finance';
import { Avatar } from '../components/Avatar';
import { eventBus } from '../events';
import type { PageKey } from '../components/Nav';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function sapaan() {
    const h = new Date(Date.now() + 7 * 3600_000).getUTCHours();
    return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}
export const jamAcara = (e: Acara) => (e.seharian ? 'Seharian' : e.mulai.slice(11, 16));

function Card({ title, ico, onOpen, children, accent }: { title: string; ico: string; onOpen: () => void; children: React.ReactNode; accent: string }) {
    return (
        <section className="home-card" style={{ ['--c' as any]: accent }}>
            <button className="home-card-head" onClick={onOpen}>
                <span>{ico} {title}</span><span className="home-more">Buka ›</span>
            </button>
            {children}
        </section>
    );
}

export function HomePage({ go }: { go: (p: PageKey) => void }) {
    const owner = useKantor((s) => s.owner);
    const agents = useKantor((s) => s.agents);
    const divisions = useKantor((s) => s.divisions);
    const tasks = useKantor((s) => s.tasks);
    const highlights = useKantor((s) => s.highlights);
    const fin = useApi<{ transaksi: Tx[] }>('/api/kantor/keuangan', 120_000);
    const trd = useApi<TradingData>('/api/kantor/trading', 120_000);
    const cal = useApi<{ acara: Acara[] }>('/api/kantor/jadwal?hari=3', 300_000);

    const today = todayWib();
    const r = useMemo(() => (fin.data ? compute(fin.data.transaksi, today.slice(0, 7), 'Semua') : null), [fin.data, today]);
    const agenda = (cal.data?.acara || []).filter((e) => e.mulai.slice(0, 10) >= today).slice(0, 4);
    const active = tasks.filter((t) => t.status !== 'completed');
    const pos = trd.data?.positions || [];
    const upl = pos.reduce((a, p) => a + (p.pnl || 0), 0);
    const working = agents.filter((a) => a.action === 'work' || a.action === 'blocked');
    const d = new Date(Date.now() + 7 * 3600_000);

    return (
        <div className="home">
            <div className="home-hello">
                <h1>{sapaan()}, {owner} 👋</h1>
                <p>{HARI[d.getUTCDay()]}, {d.getUTCDate()} {BULAN[d.getUTCMonth()]} {d.getUTCFullYear()} · {working.length ? `${working.length} orang sedang bekerja` : 'tim sedang santai'} · {active.length} tugas aktif</p>
            </div>

            <div className="home-grid">
                <Card title="Jadwal" ico="📅" accent="#0ea5e9" onOpen={() => go('jadwal')}>
                    {cal.error && <div className="home-empty">Kalender belum tersambung.</div>}
                    {!cal.error && agenda.length === 0 && <div className="home-empty">{cal.data ? 'Tidak ada agenda 3 hari ke depan.' : 'Memuat…'}</div>}
                    {agenda.map((e) => (
                        <div key={e.id} className="home-row">
                            <b className="home-time">{e.mulai.slice(0, 10) === today ? jamAcara(e) : `${HARI[new Date(e.mulai.slice(0, 10) + 'T00:00:00Z').getUTCDay()].slice(0, 3)} ${jamAcara(e)}`}</b>
                            <span className="home-text">{e.judul}{e.dariWa && <em className="tag-wa">WA</em>}</span>
                        </div>
                    ))}
                </Card>

                <Card title="Keuangan bulan ini" ico="💰" accent="#f43f5e" onOpen={() => go('keuangan')}>
                    {!r && <div className="home-empty">{fin.error ? 'Data keuangan belum tersedia.' : 'Memuat…'}</div>}
                    {r && (
                        <>
                            <div className="home-big">
                                <div><span>Keluar</span><b style={{ color: '#fb7185' }}>{rp(r.keluar)}</b>
                                    {delta(r.keluar, r.prevKeluar) !== null && <small className={delta(r.keluar, r.prevKeluar)! > 0 ? 'bad' : 'good'}>{delta(r.keluar, r.prevKeluar)! > 0 ? '▲' : '▼'} {Math.abs(delta(r.keluar, r.prevKeluar)! * 100).toFixed(0)}%</small>}
                                </div>
                                <div><span>Masuk</span><b style={{ color: '#4ade80' }}>{rp(r.masuk)}</b></div>
                            </div>
                            <div className="home-spark">
                                {r.weeks.slice(-8).map((w) => (
                                    <div key={w.start} title={`${w.label}: ${rp(w.value)}`} className={!w.current && r.avgWeek && w.value > r.avgWeek * 1.25 ? 'bad' : ''}
                                        style={{ height: `${Math.max(4, (w.value / Math.max(1, ...r.weeks.map((x) => x.value))) * 100)}%` }} />
                                ))}
                            </div>
                            <div className="home-sub">Rata-rata/minggu {rpShort(r.avgWeek)} · terbesar: {r.kategori[0]?.k || '-'}</div>
                        </>
                    )}
                </Card>

                <Card title="Trading" ico="📈" accent="#22c55e" onOpen={() => go('trading')}>
                    {!trd.data && <div className="home-empty">{trd.error ? 'Data trading belum tersedia.' : 'Memuat…'}</div>}
                    {trd.data && (
                        <>
                            <div className="home-big">
                                <div><span>Posisi terbuka</span><b>{pos.length}</b></div>
                                <div><span>Untung/rugi berjalan</span><b style={{ color: upl >= 0 ? '#4ade80' : '#fb7185' }}>{upl >= 0 ? '+' : '−'}${Math.abs(upl).toFixed(2)}</b></div>
                            </div>
                            {pos.slice(0, 3).map((p) => (
                                <div key={p.symbol} className="home-row"><b className="home-time">{p.symbol}</b>
                                    <span className="home-text">{p.price ? `$${p.price.toFixed(2)}` : '–'} · target ${p.target} · stop ${p.stop}</span></div>
                            ))}
                            {pos.length === 0 && <div className="home-sub">{trd.data.plans.length ? `${trd.data.plans.length} strategi siap dieksekusi` : 'Belum ada strategi hari ini.'}</div>}
                        </>
                    )}
                </Card>

                <Card title="Tugas aktif" ico="📋" accent="#a78bfa" onOpen={() => go('tugas')}>
                    {active.length === 0 && <div className="home-empty">Tidak ada tugas aktif.</div>}
                    {active.slice(0, 4).map((t) => (
                        <div key={t.id} className="home-row"><b className="home-time">{t.status === 'blocked' ? '⚠️' : t.status === 'in_progress' ? '🔄' : '⏳'}</b>
                            <span className="home-text">{t.title}<small> → {t.assigned_to}</small></span></div>
                    ))}
                </Card>
            </div>

            <section className="home-card wide" style={{ ['--c' as any]: '#818cf8' }}>
                <button className="home-card-head" onClick={() => go('kantor')}><span>👥 Tim</span><span className="home-more">Lihat kantor ›</span></button>
                <div className="home-team">
                    {[{ id: 'default', name: 'Kepala', icon: '👑', color: '#818cf8', memberIds: ['default'] }, ...divisions].map((dv) => (
                        <div key={dv.id} className="home-div">
                            <div className="home-div-name" style={{ color: dv.color }}>{dv.icon} {dv.name}</div>
                            <div className="home-div-members">
                                {dv.memberIds.map((id) => agents.find((a) => a.id === id)).filter(Boolean).map((a) => {
                                    const st = statusOf(a!.action);
                                    return (
                                        <button key={a!.id} className="home-agent" title={`${a!.name} · ${a!.title || a!.role} · ${st.label}`}
                                            onClick={() => { go('kantor'); setTimeout(() => { eventBus.dispatchEvent(new CustomEvent('focus-agent', { detail: { id: a!.id } })); eventBus.dispatchEvent(new CustomEvent('agent-select', { detail: { id: a!.id } })); }, 50); }}>
                                            <Avatar skin={a!.skin} size={30} />
                                            <span className="home-agent-dot" style={{ background: st.color }} />
                                            <span className="home-agent-name">{a!.name}<small>{a!.title || ''}</small></span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="home-card wide" style={{ ['--c' as any]: '#fbbf24' }}>
                <div className="home-card-head static"><span>⚡ Kejadian terbaru</span></div>
                {highlights.length === 0 && <div className="home-empty">Belum ada kejadian.</div>}
                {highlights.slice(0, 5).map((h) => (
                    <div key={h.id} className="home-row"><span className="home-text"><b>{h.title}</b> <small>{h.body}</small></span></div>
                ))}
            </section>
        </div>
    );
}
