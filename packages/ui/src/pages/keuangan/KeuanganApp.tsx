import { useInterval } from '../../kantor/aktif';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSubNav } from '../../kantor/subnav';
import { useApi } from '../../kantor/api';
import { apiGet, apiPost } from '../../kantor/connection';
import { ImporMutasi } from './ImporMutasi';
import { RichText } from '../../components/common/RichText';
import { Batang, Donat } from './Grafik';
import { Tx, rp, rpk, ikon, warnaDari, periode, dalam, keluar, masuk, sum, kelompok, hariIni, tglPanjang, tglPendek } from './util';

interface Report { transaksi: Tx[]; sheetUrl: string; pencatat: { lastRun: number; lastError: string } }
interface Anggaran { mulai: number; batas: Record<string, number>; akun: string[]; kategori: string[]; saldo?: Record<string, { nilai: number; tanggal: string; sumber: string }> }
type Tab = 'beranda' | 'pengeluaran' | 'anggaran' | 'transaksi' | 'chat';
const TABS: Array<{ k: Tab; ico: string; label: string }> = [
    { k: 'beranda', ico: '🏠', label: 'Beranda' }, { k: 'pengeluaran', ico: '🛒', label: 'Pengeluaran' }, { k: 'anggaran', ico: '🥧', label: 'Anggaran' },
    { k: 'transaksi', ico: '🧾', label: 'Transaksi' }, { k: 'chat', ico: '💬', label: 'Catat & Tanya' }
];

export function KeuanganApp() {
    const rep = useApi<Report>('/api/kantor/keuangan', 120_000);
    const ang = useApi<Anggaran>('/api/kantor/keuangan/anggaran', 0);
    const [tab, setTabS] = useState<Tab>(() => { try { return (localStorage.getItem('kantor:keu-tab') as Tab) || 'beranda'; } catch { return 'beranda'; } });
    const setTab = (t: Tab) => { setTabS(t); try { localStorage.setItem('kantor:keu-tab', t); } catch { /* */ } document.querySelector('.page:not([hidden]) .pg')?.scrollTo({ top: 0 }); };
    useSubNav(TABS.map((t) => ({ k: t.k, ico: t.ico, label: t.k === 'chat' ? 'Catat' : t.k === 'pengeluaran' ? 'Keluar' : t.label })), tab, (k) => { setTab(k as Tab); if (k !== 'transaksi') setFilter({}); });
    const [geser, setGeser] = useState(0);
    const [tambah, setTambah] = useState(false);
    const [ubah, setUbah] = useState<Tx | null>(null);
    const [impor, setImpor] = useState(false);
    const [detail, setDetail] = useState<Tx | null>(null);
    const [filter, setFilter] = useState<{ jenis?: string; kat?: string; akun?: string; pihak?: string }>({});
    const tx = rep.data?.transaksi || [];
    const mulai = ang.data?.mulai || 1;
    const p = periode(mulai, geser);
    const diP = tx.filter((t) => dalam(t, p));
    const kel = sum(diP.filter(keluar)), msk = sum(diP.filter(masuk));
    const muat = () => { rep.reload('?sync=1'); };

    const bukaTransaksi = (f: typeof filter) => { setFilter(f); setTab('transaksi'); };

    return (
        <div className="pg k-app">
            <header className="k-head">
                <div className="k-head-top">
                    <div className="k-per">
                        <button onClick={() => setGeser(geser - 1)} aria-label="Periode sebelumnya">‹</button>
                        <b>{p.label}</b>
                        <button onClick={() => setGeser(Math.min(0, geser + 1))} disabled={geser >= 0} aria-label="Periode berikutnya">›</button>
                    </div>
                    <div className="k-head-act">
                        <button className="k-pill" onClick={() => setImpor(true)} title="Impor PDF mutasi rekening">📥 Mutasi</button>
                        {rep.data && <a className="k-pill" href={rep.data.sheetUrl} target="_blank" rel="noreferrer">📄 Sheets</a>}
                        <button className="k-pill" onClick={muat} disabled={rep.loading}>{rep.loading ? '…' : '↻'}</button>
                    </div>
                </div>
                <div className="k-saldo">
                    <small>SISA PERIODE INI</small>
                    <b className="mono">{rp(msk - kel)}</b>
                </div>
                <div className="k-io">
                    <div><i className="in">↓</i><span>Masuk</span><b className="mono">{rp(msk)}</b></div>
                    <div><i className="out">↑</i><span>Keluar</span><b className="mono">{rp(kel)}</b></div>
                </div>
            </header>

            <nav className="k-tabs">{TABS.map((t) => <button key={t.k} className={tab === t.k ? 'on' : ''} onClick={() => { setTab(t.k); if (t.k !== 'transaksi') setFilter({}); }}><span>{t.ico}</span>{t.label}</button>)}</nav>

            {rep.error && <div className="error">Data keuangan belum bisa dibaca: {rep.error}</div>}
            {!rep.data && !rep.error && <div className="fin-empty">Memuat…</div>}

            {rep.data && tab === 'beranda' && <Beranda tx={tx} p={p} mulai={mulai} ang={ang.data} onTx={setDetail} go={setTab} onTambah={() => setTambah(true)} lihat={bukaTransaksi} onImpor={() => setImpor(true)} />}
            {rep.data && tab === 'pengeluaran' && <Pengeluaran tx={tx} mulai={mulai} geser={geser} lihat={bukaTransaksi} />}
            {rep.data && tab === 'anggaran' && <AnggaranView tx={diP} p={p} ang={ang.data} simpan={async (x) => { await apiPost('/api/kantor/keuangan/anggaran', x); ang.reload(); }} lihat={bukaTransaksi} />}
            {rep.data && tab === 'transaksi' && <Transaksi tx={tx} filter={filter} setFilter={setFilter} onTx={setDetail} />}
            {tab === 'chat' && <ChatUang ang={ang.data} onSaved={muat} />}

            <button className="k-fab" onClick={() => setTambah(true)} aria-label="Tambah transaksi">＋</button>
            {tambah && <Tambah ang={ang.data} onClose={() => setTambah(false)} onSaved={() => { setTambah(false); muat(); }} />}
            {detail && <Detail t={detail} all={tx} mulai={mulai} onClose={() => setDetail(null)} lihat={(f) => { setDetail(null); bukaTransaksi(f); }}
                onUbah={() => { setUbah(detail); setDetail(null); }} onHapus={async () => { await apiPost('/api/kantor/keuangan/hapus', { ids: [detail.id] }); setDetail(null); muat(); }} />}
            {ubah && <Tambah ang={ang.data} id={ubah.id} awal={{ jenis: ubah.jenis, nominal: ubah.n, akun: ubah.bank, kategori: ubah.kat, pihak: ubah.pihak, keterangan: ubah.ket, tanggal: ubah.d }} onClose={() => setUbah(null)} onSaved={() => { setUbah(null); muat(); }} />}
            {impor && <ImporMutasi akun={ang.data?.akun || []} onClose={() => setImpor(false)} onSelesai={() => { muat(); ang.reload(); }} />}
        </div>
    );
}

/* ── Beranda ─────────────────────────────────────────────── */
function Beranda({ tx, p, mulai, ang, onTx, go, onTambah, lihat, onImpor }: { tx: Tx[]; p: ReturnType<typeof periode>; mulai: number; ang: Anggaran | null; onTx: (t: Tx) => void; go: (t: Tab) => void; onTambah: () => void; lihat: (f: any) => void; onImpor: () => void }) {
    const saldo = Object.entries(ang?.saldo || {}).map(([a, s]) => ({ a, s, kini: s.nilai + tx.filter((t) => t.bank.toLowerCase() === a.toLowerCase() && t.d > s.tanggal).reduce((x, t) => x + (t.jenis === 'Masuk' ? t.n : -t.n), 0) }));
    const today = hariIni();
    const hariIniKel = sum(tx.filter((t) => t.d === today && keluar(t)));
    const totalBatas = Object.values(ang?.batas || {}).reduce((a, b) => a + b, 0);
    const kelP = sum(tx.filter((t) => dalam(t, p) && keluar(t)));
    const sisaHari = Math.max(1, Math.round((Date.parse(p.end) - Date.parse(today)) / 86400_000) + 1);
    const jatah = totalBatas ? Math.max(0, (totalBatas - kelP) / sisaHari) : 0;
    // Insight mingguan
    const senin = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
    const minggu = tx.filter((t) => t.d >= senin && keluar(t));
    const rata8 = (() => { let s = 0; for (let k = 1; k <= 8; k++) { const a = new Date(Date.parse(senin) - k * 7 * 86400_000).toISOString().slice(0, 10), b = new Date(Date.parse(senin) - (k - 1) * 7 * 86400_000 - 86400_000).toISOString().slice(0, 10); s += sum(tx.filter((t) => keluar(t) && t.d >= a && t.d <= b)); } return s / 8; })();
    const katMinggu = Array.from(kelompok(minggu, (t) => t.kat).entries()).map(([k, v]) => ({ k, v: sum(v) })).sort((a, b) => b.v - a.v);
    const terakhir = [...tx].sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t)).slice(0, 6);
    return (
        <div className="k-grid2">
            <section className="k-card">
                <div className="k-quick">
                    <button onClick={() => go('chat')}><span className="q b">💬</span>Catat lewat chat</button>
                    <button onClick={onTambah}><span className="q g">✍️</span>Tambah manual</button>
                    <button onClick={() => go('pengeluaran')}><span className="q o">📊</span>Laporan</button>
                    <button onClick={onImpor}><span className="q p">📥</span>Impor mutasi</button>
                </div>
            </section>
            {saldo.length > 0 && (
                <section className="k-card k-span2">
                    <div className="k-card-h"><h3>Saldo rekening</h3><small>patokan dari mutasi PDF + transaksi sesudahnya</small></div>
                    <div className="k-saldo-akun">{saldo.map((x) => (
                        <button key={x.a} onClick={() => lihat({ akun: x.a })}><span>🏦 {x.a}</span><b className="mono">{rp(x.kini)}</b><small>per mutasi {tglPendek(x.s.tanggal)}: {rp(x.s.nilai)}</small></button>
                    ))}</div>
                </section>
            )}
            <section className="k-card k-today">
                <div><small>Pengeluaran hari ini</small><b className="mono">{rp(hariIniKel)}</b></div>
                {totalBatas > 0 ? <p>{hariIniKel <= jatah ? '🤩 Aman!' : '😬 Melebihi jatah.'} Jatah harian sampai {tglPendek(p.end)}: <b className="mono">{rp(jatah)}</b></p> : <p>Atur anggaran supaya tahu jatah harian. <button className="k-link" onClick={() => go('anggaran')}>Atur →</button></p>}
            </section>
            <section className="k-card k-span2">
                <div className="k-card-h"><h3>Transaksi terakhir</h3><button className="k-link" onClick={() => go('transaksi')}>Lihat semua ›</button></div>
                {terakhir.length === 0 && <div className="fin-empty">Belum ada transaksi.</div>}
                {terakhir.map((t, i) => <TxRow key={i} t={t} onClick={() => onTx(t)} />)}
            </section>
            <section className="k-card k-span2 k-insight">
                <div className="k-card-h"><h3>✨ Ringkasan minggu ini</h3><small>sejak {tglPendek(senin)}</small></div>
                <div className="k-ins-grid">
                    <div><small>Keluar minggu ini</small><b className="mono">{rp(sum(minggu))}</b><em className={sum(minggu) > rata8 ? 'down' : 'up'}>{rata8 ? `${sum(minggu) > rata8 ? '▲' : '▼'} ${Math.abs(Math.round((sum(minggu) / rata8 - 1) * 100))}% vs rata-rata 8 minggu` : ''}</em></div>
                    <div><small>Kategori terbesar</small><b>{katMinggu[0] ? `${ikon(katMinggu[0].k)} ${katMinggu[0].k}` : '–'}</b><em>{katMinggu[0] ? rp(katMinggu[0].v) : ''}</em></div>
                    <div><small>Jumlah transaksi</small><b className="mono">{minggu.length}</b><em>{minggu.length ? `rata-rata ${rp(sum(minggu) / minggu.length)}` : ''}</em></div>
                </div>
                {katMinggu.length > 0 && <div className="k-stack">{katMinggu.map((k, i) => <i key={k.k} title={`${k.k}: ${rp(k.v)}`} style={{ flex: k.v, background: warnaDari(k.k, i) }} onClick={() => lihat({ kat: k.k, jenis: 'Keluar' })} />)}</div>}
            </section>
        </div>
    );
}

function TxRow({ t, onClick }: { t: Tx; onClick: () => void }) {
    return (
        <button className="k-tx" onClick={onClick}>
            <span className="k-ico" style={{ background: `${warnaDari(t.kat, 0)}22` }}>{t.jenis === 'Masuk' ? '💰' : t.jenis === 'Antar Rekening' ? '🔁' : ikon(t.kat)}<i>{(t.bank || '?').slice(0, 1)}</i></span>
            <span className="k-tx-main"><b>{t.jenis === 'Masuk' ? 'Pemasukan' : t.jenis === 'Antar Rekening' ? 'Antar rekening' : t.kat}</b><small>{t.bank}{t.status === 'Manual' ? ' · manual' : ''}</small><small>{t.pihak || t.ket}</small></span>
            <span className={`k-tx-n mono ${t.jenis === 'Masuk' ? 'in' : t.jenis === 'Keluar' ? 'out' : ''}`}>{t.jenis === 'Masuk' ? '+ ' : t.jenis === 'Keluar' ? '− ' : ''}{rp(t.n)}</span>
        </button>
    );
}

/* ── Pengeluaran ─────────────────────────────────────────── */
function Pengeluaran({ tx, mulai, geser, lihat }: { tx: Tx[]; mulai: number; geser: number; lihat: (f: any) => void }) {
    const [by, setBy] = useState<'kat' | 'bank' | 'pihak'>('kat');
    const pers = Array.from({ length: 6 }, (_, i) => periode(mulai, geser - 5 + i));
    const nilai = pers.map((p) => ({ label: p.pendek, v: sum(tx.filter((t) => dalam(t, p) && keluar(t))) }));
    const rata = nilai.slice(0, 5).reduce((a, x) => a + x.v, 0) / 5;
    const p = pers[5];
    const xs = tx.filter((t) => dalam(t, p) && keluar(t));
    const grup = Array.from(kelompok(xs, (t) => (by === 'pihak' ? t.pihak || '(tanpa nama)' : by === 'bank' ? t.bank : t.kat)).entries())
        .map(([k, v], i) => ({ k, v: sum(v), n: v.length, c: '' , i })).sort((a, b) => b.v - a.v).map((g, i) => ({ ...g, c: warnaDari(by === 'kat' ? g.k : `${g.k}${i}`, i) }));
    const total = sum(xs);
    const atas = grup.slice(0, 8), sisa = grup.slice(8);
    const donat = [...atas, ...(sisa.length ? [{ k: 'Lainnya', v: sum(xs) - atas.reduce((a, g) => a + g.v, 0), c: '#94a3b8', n: 0, i: 99 }] : [])];
    return (
        <div className="k-grid2">
            <section className="k-card">
                <div className="k-card-h"><h3>Total pengeluaran</h3><small>{p.label}</small></div>
                <b className="k-big mono">{rp(total)}</b>
                <Batang data={nilai} rata={rata} aktif={5} />
            </section>
            <section className="k-card">
                <div className="k-seg">{([['kat', 'Kategori'], ['bank', 'Akun'], ['pihak', 'Merchant']] as const).map(([k, l]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}</div>
                <Donat data={donat} tengah={rp(total)} sub={`Pengeluaran ${p.pendek}`} />
            </section>
            <section className="k-card k-span2">
                {grup.length === 0 && <div className="fin-empty">Belum ada pengeluaran di periode ini.</div>}
                {grup.map((g) => (
                    <button key={g.k} className="k-rank" onClick={() => lihat(by === 'kat' ? { kat: g.k, jenis: 'Keluar' } : by === 'bank' ? { akun: g.k, jenis: 'Keluar' } : { pihak: g.k, jenis: 'Keluar' })}>
                        <span className="k-ico" style={{ background: `${g.c}22` }}>{by === 'kat' ? ikon(g.k) : by === 'bank' ? '🏦' : '🏪'}</span>
                        <span className="k-rank-main"><b>{g.k}</b><small>{g.n} transaksi</small><span className="k-meter"><i style={{ width: `${(g.v / Math.max(1, grup[0].v)) * 100}%`, background: g.c }} /></span></span>
                        <span className="k-rank-n"><b className="mono">{rp(g.v)}</b><small className="mono">{total ? Math.round((g.v / total) * 100) : 0}%</small></span>
                    </button>
                ))}
            </section>
        </div>
    );
}

/* ── Anggaran ─────────────────────────────────────────────── */
function AnggaranView({ tx, p, ang, simpan, lihat }: { tx: Tx[]; p: ReturnType<typeof periode>; ang: Anggaran | null; simpan: (x: any) => Promise<void>; lihat: (f: any) => void }) {
    const [edit, setEdit] = useState(false);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [mulai, setMulai] = useState(1);
    useEffect(() => { if (ang) { setDraft(Object.fromEntries(Object.entries(ang.batas).map(([k, v]) => [k, String(v)]))); setMulai(ang.mulai); } }, [ang, edit]);
    if (!ang) return <div className="fin-empty">Memuat…</div>;
    const pakai = (k: string) => sum(tx.filter((t) => keluar(t) && t.kat === k));
    const total = Object.values(ang.batas).reduce((a, b) => a + b, 0);
    const terpakai = Object.keys(ang.batas).reduce((a, k) => a + pakai(k), 0);
    const sisaHari = Math.max(1, Math.round((Date.parse(p.end) - Date.parse(hariIni())) / 86400_000) + 1);
    const pct = total ? Math.min(100, Math.round((terpakai / total) * 100)) : 0;
    return (
        <div className="k-grid2">
            <section className="k-card k-span2 k-budget-head">
                <div className="k-card-h"><h3>Sisa anggaran</h3><button className="k-link" onClick={() => setEdit(!edit)}>{edit ? 'Tutup' : 'Ubah'}</button></div>
                <b className="k-big mono">{rp(total - terpakai)}</b>
                <div className="k-meter big"><i style={{ width: `${pct}%`, background: pct > 90 ? 'var(--down)' : pct > 70 ? '#f59e0b' : 'var(--k-blue)' }} /></div>
                <div className="k-row-sb"><small>Terpakai {rp(terpakai)} ({pct}%)</small><small>dari {rp(total)}</small></div>
                {total > 0 && <div className="k-tip">🤩 Sisa {sisaHari} hari. Kamu bisa belanja <b className="mono">{rp(Math.max(0, (total - terpakai) / sisaHari))}</b> per hari sampai {tglPendek(p.end)}.</div>}
            </section>
            {edit && (
                <section className="k-card k-span2">
                    <div className="k-card-h"><h3>Atur anggaran</h3></div>
                    <label className="k-field"><span>Periode mulai tiap tanggal (mis. tanggal gajian)</span><input className="input" type="number" min={1} max={28} value={mulai} onChange={(e) => setMulai(Number(e.target.value))} /></label>
                    <div className="k-edit-list">
                        {ang.kategori.map((k) => (
                            <label key={k} className="k-edit-row"><span>{ikon(k)} {k}</span><input className="input" inputMode="numeric" placeholder="0" value={draft[k] || ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/\D/g, '') })} /></label>
                        ))}
                    </div>
                    <button className="btn primary" onClick={async () => { await simpan({ mulai, batas: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) }); setEdit(false); }}>Simpan anggaran</button>
                </section>
            )}
            <section className="k-card k-span2">
                <div className="k-card-h"><h3>Anggaran per kategori</h3><small>{p.label}</small></div>
                {Object.keys(ang.batas).length === 0 && <div className="fin-empty">Belum ada anggaran. Tekan <b>Ubah</b> untuk mengatur batas per kategori.</div>}
                {Object.entries(ang.batas).map(([k, b]) => {
                    const u = pakai(k), pc = Math.round((u / b) * 100);
                    return (
                        <button key={k} className="k-budget" onClick={() => lihat({ kat: k, jenis: 'Keluar' })}>
                            <div className="k-row-sb"><b>{ikon(k)} {k}</b><span className={`mono ${pc > 100 ? 'down' : ''}`}>{pc}%</span></div>
                            <div className="k-meter"><i style={{ width: `${Math.min(100, pc)}%`, background: pc > 100 ? 'var(--down)' : pc > 80 ? '#f59e0b' : warnaDari(k, 0) }} /></div>
                            <small>Terpakai {rp(u)} dari {rp(b)}{pc > 100 ? ` · lebih ${rp(u - b)}` : ` · sisa ${rp(b - u)}`}</small>
                        </button>
                    );
                })}
            </section>
        </div>
    );
}

/* ── Transaksi ───────────────────────────────────────────── */
function Transaksi({ tx, filter, setFilter, onTx }: { tx: Tx[]; filter: any; setFilter: (f: any) => void; onTx: (t: Tx) => void }) {
    const [q, setQ] = useState('');
    const [batas, setBatas] = useState(60);
    const xs = useMemo(() => tx.filter((t) => (!filter.jenis || t.jenis === filter.jenis) && (!filter.kat || t.kat === filter.kat) && (!filter.akun || t.bank === filter.akun) && (!filter.pihak || (t.pihak || '(tanpa nama)') === filter.pihak)
        && (!q || `${t.pihak} ${t.ket} ${t.kat} ${t.bank}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t)), [tx, filter, q]);
    const hari = Array.from(kelompok(xs.slice(0, batas), (t) => t.d).entries());
    const aktif = Object.entries(filter).filter(([, v]) => v);
    return (
        <section className="k-card k-span2 k-list">
            <div className="k-list-tools">
                <div className="sb-search"><span>⌕</span><input placeholder="Cari merchant, catatan, kategori…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <div className="k-seg">{['', 'Keluar', 'Masuk', 'Antar Rekening'].map((j) => <button key={j} className={(filter.jenis || '') === j ? 'on' : ''} onClick={() => setFilter({ ...filter, jenis: j || undefined })}>{j || 'Semua'}</button>)}</div>
            </div>
            {aktif.filter(([k]) => k !== 'jenis').length > 0 && <div className="k-chips">{aktif.filter(([k]) => k !== 'jenis').map(([k, v]) => <button key={k} onClick={() => setFilter({ ...filter, [k]: undefined })}>{String(v)} ✕</button>)}</div>}
            <div className="k-sum mono">{xs.length} transaksi · keluar {rp(sum(xs.filter(keluar)))} · masuk {rp(sum(xs.filter(masuk)))}</div>
            {hari.map(([d, list]) => (
                <div key={d}>
                    <div className="k-day"><span>{tglPanjang(d)}</span><b className="mono">{(() => { const n = sum(list.filter(masuk)) - sum(list.filter(keluar)); return `${n >= 0 ? '+ ' : '− '}${rp(Math.abs(n))}`; })()}</b></div>
                    {list.map((t, i) => <TxRow key={i} t={t} onClick={() => onTx(t)} />)}
                </div>
            ))}
            {xs.length > batas && <button className="sb-more" onClick={() => setBatas(batas + 60)}>Tampilkan lagi</button>}
            {xs.length === 0 && <div className="fin-empty">Tidak ada transaksi.</div>}
        </section>
    );
}

/* ── Detail transaksi (dengan grafik) ────────────────────── */
function Detail({ t, all, mulai, onClose, lihat, onUbah, onHapus }: { t: Tx; all: Tx[]; mulai: number; onClose: () => void; lihat: (f: any) => void; onUbah: () => void; onHapus: () => Promise<void> }) {
    const [hapusErr, setHapusErr] = useState('');
    const [busy, setBusy] = useState(false);
    const pers = Array.from({ length: 6 }, (_, i) => periode(mulai, i - 5, t.d));
    const sama = (x: Tx) => (t.pihak ? x.pihak === t.pihak : x.kat === t.kat) && x.jenis === t.jenis;
    const seri = pers.map((p) => ({ label: p.pendek, v: sum(all.filter((x) => dalam(x, p) && sama(x))) }));
    const pNow = pers[5];
    const katP = sum(all.filter((x) => dalam(x, pNow) && keluar(x) && x.kat === t.kat));
    const totP = sum(all.filter((x) => dalam(x, pNow) && keluar(x)));
    const kali = all.filter(sama).length;
    return (
        <div className="k-sheet" onClick={onClose}>
            <div className="k-sheet-in" onClick={(e) => e.stopPropagation()}>
                <div className="k-sheet-h"><b>Detail transaksi</b><button onClick={onClose}>✕</button></div>
                <div className="k-det-top">
                    <span className="k-ico big" style={{ background: `${warnaDari(t.kat, 0)}22` }}>{t.jenis === 'Masuk' ? '💰' : ikon(t.kat)}</span>
                    <b className={`mono ${t.jenis === 'Masuk' ? 'in' : 'out'}`}>{t.jenis === 'Masuk' ? '+ ' : t.jenis === 'Keluar' ? '− ' : ''}{rp(t.n)}</b>
                    <small>{tglPanjang(t.d)} · {t.t}</small>
                </div>
                <div className="k-kv">
                    <div><small>Kategori</small><b>{ikon(t.kat)} {t.kat}</b></div>
                    <div><small>Akun</small><b>{t.bank}</b></div>
                    <div><small>Merchant / pihak</small><b>{t.pihak || '–'}</b></div>
                    <div><small>Catatan</small><b>{t.ket || '–'}</b></div>
                    <div><small>Sumber</small><b>{t.status === 'Manual' ? 'Dicatat manual' : t.status === 'Mutasi' ? 'Mutasi rekening (PDF)' : 'Email bank (otomatis)'}</b></div>
                    <div><small>Jenis</small><b>{t.jenis}</b></div>
                </div>
                <h4>{t.pihak ? `Di ${t.pihak}` : `Kategori ${t.kat}`} per periode <small>({kali}× total)</small></h4>
                <Batang data={seri} aktif={5} rata={seri.slice(0, 5).reduce((a, x) => a + x.v, 0) / 5} />
                {keluar(t) && totP > 0 && (
                    <div className="k-tip">{ikon(t.kat)} {t.kat} = <b className="mono">{Math.round((katP / totP) * 100)}%</b> dari pengeluaran {pNow.label} ({rp(katP)}). Transaksi ini {Math.round((t.n / Math.max(1, katP)) * 100)}% dari kategori itu.</div>
                )}
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {t.pihak && <button className="btn" onClick={() => lihat({ pihak: t.pihak })}>Semua di {t.pihak}</button>}
                    <button className="btn" onClick={() => lihat({ kat: t.kat })}>Semua {t.kat}</button>
                </div>
                {t.id && (
                    <div className="k-det-act">
                        <button className="btn" onClick={onUbah}>✏️ Ubah</button>
                        <button className="btn danger" disabled={busy} onClick={async () => {
                            if (!confirm(`Hapus transaksi ${rp(t.n)} (${t.pihak || t.kat}, ${tglPendek(t.d)})? Salinannya tetap disimpan di VPS.`)) return;
                            setBusy(true); setHapusErr('');
                            try { await onHapus(); } catch (e: any) { setHapusErr(String(e?.message || e)); setBusy(false); }
                        }}>{busy ? 'Menghapus…' : '🗑 Hapus'}</button>
                    </div>
                )}
                {hapusErr && <div className="error">{hapusErr}</div>}
            </div>
        </div>
    );
}

/* ── Tambah manual ───────────────────────────────────────── */
function Tambah({ ang, onClose, onSaved, awal, id }: { ang: Anggaran | null; onClose: () => void; onSaved: () => void; awal?: any; id?: string }) {
    const [jenis, setJenis] = useState<string>(awal?.jenis || 'Keluar');
    const [n, setN] = useState<string>(awal?.nominal ? String(awal.nominal) : '');
    const [akun, setAkun] = useState<string>(awal?.akun || ang?.akun[0] || 'Cash');
    const [kat, setKat] = useState<string>(awal?.kategori || 'Makan & Minum');
    const [pihak, setPihak] = useState<string>(awal?.pihak || '');
    const [ket, setKet] = useState<string>(awal?.keterangan || '');
    const [tgl, setTgl] = useState<string>(awal?.tanggal || hariIni());
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const nominal = Number(n.replace(/\D/g, ''));
    const simpan = async () => {
        setBusy(true); setErr('');
        const isi = { jenis, nominal, akun, kategori: jenis === 'Masuk' ? (id ? kat : 'Pendapatan') : kat, pihak, keterangan: ket, tanggal: tgl };
        try { await apiPost(id ? '/api/kantor/keuangan/ubah' : '/api/kantor/keuangan/tambah', id ? { id, ...isi } : isi); onSaved(); }
        catch (e: any) { setErr(String(e.message || e)); }
        setBusy(false);
    };
    return (
        <div className="k-sheet" onClick={onClose}>
            <div className="k-sheet-in" onClick={(e) => e.stopPropagation()}>
                <div className="k-sheet-h"><b>{id ? 'Ubah transaksi' : 'Tambah transaksi'}</b><button onClick={onClose}>✕</button></div>
                <div className="k-seg full">{[['Keluar', 'Pengeluaran'], ['Masuk', 'Pemasukan'], ['Antar Rekening', 'Transfer']].map(([k, l]) => <button key={k} className={jenis === k ? 'on' : ''} onClick={() => setJenis(k)}>{l}</button>)}</div>
                <label className="k-amount"><span>Rp</span><input inputMode="numeric" autoFocus placeholder="0" value={nominal ? nominal.toLocaleString('id-ID') : ''} onChange={(e) => setN(e.target.value)} /></label>
                <input className="input" type="date" value={tgl} max={hariIni()} onChange={(e) => setTgl(e.target.value)} />
                <div className="k-akun">{Array.from(new Set([...(ang?.akun || ['Cash']), akun])).map((a) => <button key={a} className={akun === a ? 'on' : ''} onClick={() => setAkun(a)}>{a === 'Cash' ? '💵' : '🏦'} {a}</button>)}</div>
                {(jenis === 'Keluar' || id) && <select className="select" value={kat} onChange={(e) => setKat(e.target.value)}>{Array.from(new Set([...(ang?.kategori || ['Lainnya']), 'Pendapatan', kat])).map((k) => <option key={k} value={k}>{ikon(k)} {k}</option>)}</select>}
                <input className="input" placeholder={jenis === 'Masuk' ? 'Dari siapa? (mis. gaji kantor)' : 'Di mana? (mis. warung, Fore Coffee)'} value={pihak} onChange={(e) => setPihak(e.target.value)} />
                <input className="input" placeholder="Beli apa / catatan (mis. nasi kuning)" value={ket} onChange={(e) => setKet(e.target.value)} />
                {err && <div className="error">{err}</div>}
                <button className="btn primary k-save" disabled={!nominal || busy} onClick={simpan}>{busy ? 'Menyimpan…' : id ? 'Simpan perubahan' : 'Simpan ke Google Sheets'}</button>
            </div>
        </div>
    );
}

/* ── Chat dengan Uang (catat & tanya) ────────────────────── */
interface Pesan { id: string; dari: string; nama: string; teks: string; at: number }
function ChatUang({ ang, onSaved }: { ang: Anggaran | null; onSaved: () => void }) {
    const [pesan, setPesan] = useState<Pesan[]>([]);
    const [menulis, setMenulis] = useState<string[]>([]);
    const [text, setText] = useState('');
    const [draf, setDraf] = useState<any | null>(null);
    const [ubah, setUbah] = useState(false);
    const [info, setInfo] = useState('');
    const [busy, setBusy] = useState(false);
    const end = useRef<HTMLDivElement>(null);
    const load = () => apiGet<{ pesan: Pesan[]; menulis: string[] }>('/api/kantor/chat/keuangan').then((d) => { setPesan(d.pesan); setMenulis(d.menulis); }).catch(() => undefined);
    useEffect(() => { load(); }, []);
    useInterval(load, 3000);
    useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [pesan.length, menulis.length, draf, info]);
    const SARAN = ['Beli nasi goreng 20rb pakai BCA', 'Gajian 8,5jt masuk Mandiri', 'Pengeluaran terbesar bulan ini apa?', 'Berapa sisa anggaran makan?'];
    const kirim = async (t: string) => {
        const s = t.trim(); if (!s || busy) return;
        setBusy(true); setText(''); setInfo(''); setDraf(null);
        try {
            const r = await apiPost<{ draf: any }>('/api/kantor/keuangan/baca', { teks: s });
            if (r.draf?.transaksi) { setDraf({ ...r.draf, asal: s }); setBusy(false); return; }
        } catch { /* lanjut ke Uang */ }
        try { await apiPost('/api/kantor/chat/keuangan', { teks: s }); load(); } catch (e: any) { setInfo(String(e.message || e)); }
        setBusy(false);
    };
    return (
        <section className="k-card k-span2 k-chat">
            <div className="k-chat-body">
                {pesan.length === 0 && !draf && (
                    <div className="k-hello"><span>🤖</span><b>Hai, saya Uang</b><small>Tulis transaksi dengan bahasa biasa — saya catat ke Google Sheets. Atau tanya apa saja soal keuanganmu.</small></div>
                )}
                {pesan.map((m) => <div key={m.id} className={`wa-bubble ${m.dari === 'owner' ? 'me' : 'them'}`}><div className="wa-text">{m.dari === 'owner' ? m.teks : <RichText text={m.teks} />}</div></div>)}
                {menulis.length > 0 && <div className="wa-bubble them typing"><span className="dots"><i /><i /><i /></span></div>}
                {draf && (
                    <div className="k-draf">
                        <small>“{draf.asal}”</small>
                        <div className="k-draf-row"><span className="k-ico" style={{ background: `${warnaDari(draf.kategori, 0)}22` }}>{draf.jenis === 'Masuk' ? '💰' : ikon(draf.kategori)}</span>
                            <div><b className={`mono ${draf.jenis === 'Masuk' ? 'in' : 'out'}`}>{draf.jenis === 'Masuk' ? '+ ' : '− '}{rp(draf.nominal)}</b><small>{draf.jenis === 'Masuk' ? 'Pemasukan' : draf.kategori} · {draf.akun} · {tglPendek(draf.tanggal)}</small><small>{[draf.pihak, draf.keterangan].filter(Boolean).join(' · ')}</small></div></div>
                        <div className="row" style={{ gap: 8 }}>
                            <button className="btn primary" onClick={async () => { try { await apiPost('/api/kantor/keuangan/tambah', { jenis: draf.jenis, nominal: draf.nominal, akun: draf.akun, kategori: draf.kategori, pihak: draf.pihak, keterangan: draf.keterangan, tanggal: draf.tanggal }); setInfo(`✅ Tercatat: ${rp(draf.nominal)} · ${draf.kategori} · ${draf.akun}`); setDraf(null); onSaved(); } catch (e: any) { setInfo(String(e.message || e)); } }}>✓ Simpan</button>
                            <button className="btn" onClick={() => setUbah(true)}>Ubah</button>
                            <button className="btn" onClick={() => setDraf(null)}>Batal</button>
                        </div>
                    </div>
                )}
                {info && <div className="k-info">{info}</div>}
                <div ref={end} />
            </div>
            <div className="k-saran">{SARAN.map((s) => <button key={s} onClick={() => kirim(s)} disabled={busy}>{s}</button>)}</div>
            <form className="wa-input" onSubmit={(e) => { e.preventDefault(); kirim(text); }}>
                <textarea rows={1} placeholder="Mis. beli nasi goreng 20rb pakai BCA" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirim(text); } }} />
                <button className="wa-send k-send" disabled={!text.trim() || busy}>{busy ? '…' : '➤'}</button>
            </form>
            {ubah && draf && <Tambah ang={ang} awal={draf} onClose={() => setUbah(false)} onSaved={() => { setUbah(false); setDraf(null); setInfo('✅ Tercatat.'); onSaved(); }} />}
        </section>
    );
}
