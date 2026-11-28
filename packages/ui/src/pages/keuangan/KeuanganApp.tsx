import { useInterval } from '../../kantor/aktif';
import { TanggalInput } from '../../components/Tanggal';
import { useKembali } from '../../kantor/kembali';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSubNav } from '../../kantor/subnav';
import { useApi } from '../../kantor/api';
import { apiGet, apiPost, serverBase, tokenLogin } from '../../kantor/connection';
import { ImporMutasi, UnggahMutasi, AntreMutasiKartu, type ItemAntre } from './ImporMutasi';
import { RichText } from '../../components/common/RichText';
import { Batang } from './Grafik';
import { ArusKas } from './ArusKas';
import { Tx, rp, ikon, warnaDari, periode, dalam, keluar, masuk, sum, kelompok, hariIni, tglPanjang, tglPendek, transfer, transferMasuk, tujuanTransfer, saldoKini, ikonGaris, warnaTx, arusTotal, samaAkun } from './util';
import { PocketBagian } from './Pocket';

import { Ikon } from '../../components/Ikon';
import { Hidup } from '../../components/Hidup';
import { konfirmasi } from '../../components/Konfirmasi';
interface Report { transaksi: Tx[]; sheetUrl: string; pencatat: { lastRun: number; lastError: string } }
interface Anggaran { mulai: number; batas: Record<string, number>; akun: string[]; kategori: string[]; saldo?: Record<string, { nilai: number; tanggal: string; sumber: string }>; namaSendiri?: string[] }
type Tab = 'beranda' | 'arus' | 'pengeluaran' | 'anggaran' | 'transaksi' | 'chat';
const TABS: Array<{ k: Tab; ico: string; label: string }> = [
    { k: 'beranda', ico: '🏠', label: 'Ringkasan' }, { k: 'arus', ico: '📊', label: 'Arus kas' }, { k: 'pengeluaran', ico: '🛒', label: 'Keluar' },
    { k: 'anggaran', ico: '🥧', label: 'Anggaran' }, { k: 'transaksi', ico: '🧾', label: 'Transaksi' }, { k: 'chat', ico: '💬', label: 'Catat' }
];
const simpanLokal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } };
const bacaLokal = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const persen = (a: number, b: number) => (b ? Math.round((a / b - 1) * 100) : null);

export function KeuanganApp() {
    const rep = useApi<Report>('/api/kantor/keuangan', 120_000);
    const ang = useApi<Anggaran>('/api/kantor/keuangan/anggaran', 0);
    const [tab, setTabS] = useState<Tab>(() => (TABS.some((t) => t.k === bacaLokal('kantor:keu-tab')) ? bacaLokal('kantor:keu-tab') as Tab : 'beranda'));
    const setTab = (t: Tab) => { setTabS(t); simpanLokal('kantor:keu-tab', t); document.querySelector('.page:not([hidden]) .pg')?.scrollTo({ top: 0 }); };
    useSubNav(TABS.map((t) => ({ k: t.k, ico: t.ico, label: t.label })), tab, (k) => { setTab(k as Tab); if (k !== 'transaksi') setFilter({}); });
    const [akun, setAkunS] = useState(() => bacaLokal('kantor:keu-akun'));
    const setAkun = (a: string) => { setAkunS(a); simpanLokal('kantor:keu-akun', a); };
    const [geser, setGeser] = useState(0);
    const [tambah, setTambah] = useState(false);
    const [ubah, setUbah] = useState<Tx | null>(null);
    const [impor, setImpor] = useState(false);
    const [tinjau, setTinjau] = useState<ItemAntre | null>(null);
    const [sinyalAntre, setSinyalAntre] = useState(0);
    const [detail, setDetail] = useState<Tx | null>(null);
    useKembali(tambah, () => setTambah(false));
    useKembali(!!detail, () => setDetail(null));
    const [filter, setFilter] = useState<{ jenis?: string; kat?: string; pihak?: string }>({});
    // Notifikasi email tanpa nominal (mis. "aktivasi biometrik") bukan transaksi.
    const semua = useMemo(() => (rep.data?.transaksi || []).filter((t) => t.n > 0), [rep.data]);
    const daftarAkun = useMemo(() => {
        const dari = [...(ang.data?.akun || []), ...semua.map((t) => t.bank)].filter(Boolean);
        const hasil: string[] = [];
        for (const a of dari) if (!hasil.some((h) => samaAkun(h, a))) hasil.push(a);
        return hasil;
    }, [ang.data, semua]);
    const akunAktif = akun && daftarAkun.some((a) => samaAkun(a, akun)) ? akun : '';
    const tx = useMemo(() => (akunAktif ? semua.filter((t) => samaAkun(t.bank, akunAktif)) : semua), [semua, akunAktif]);
    const mulai = ang.data?.mulai || 1;
    const p = periode(mulai, geser), pLalu = periode(mulai, geser - 1);
    const kini = arusTotal(semua.filter((t) => dalam(t, p)), akunAktif);
    const lalu = arusTotal(semua.filter((t) => dalam(t, pLalu)), akunAktif);
    const muat = () => { rep.reload('?sync=1'); };
    const bukaTransaksi = (f: typeof filter) => { setFilter(f); setTab('transaksi'); };
    const ubahMasuk = persen(kini.masuk, lalu.masuk), ubahKeluar = persen(kini.keluar, lalu.keluar);

    return (
        <div className="pg k-app ku">
            <nav className="ku-tabs" role="tablist" aria-label="Bagian keuangan">
                {TABS.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => { setTab(t.k); if (t.k !== 'transaksi') setFilter({}); }}>{t.label}</button>)}
            </nav>
            <header className="ku-head">
                <div className="ku-bar">
                    <div className="ku-per">
                        <button onClick={() => setGeser(geser - 1)} aria-label="Periode sebelumnya"><Ikon n="chevron-left" /></button>
                        <b title={p.label}>{mulai === 1 ? p.label : `${tglPendek(p.start)} – ${tglPendek(p.end)}`}</b>
                        <button onClick={() => setGeser(Math.min(0, geser + 1))} disabled={geser >= 0} aria-label="Periode berikutnya"><Ikon n="chevron-right" /></button>
                    </div>
                    <div className="ku-aksi">
                        <button onClick={() => setImpor(true)} title="Unggah mutasi PDF" aria-label="Unggah mutasi PDF"><Ikon n="upload" /><span>Mutasi</span></button>
                        {rep.data && <a href={rep.data.sheetUrl} target="_blank" rel="noreferrer" title="Buka Google Sheets" aria-label="Buka Google Sheets"><Ikon n="file-text" /></a>}
                        <button onClick={muat} disabled={rep.loading} title="Muat ulang" aria-label="Muat ulang" className={rep.loading ? 'putar' : ''}><Ikon n="refresh-cw" /></button>
                    </div>
                </div>
                <div className="ku-akun" role="tablist" aria-label="Rekening">
                    {['', ...daftarAkun].map((a) => (
                        <button key={a || 'semua'} role="tab" aria-selected={samaAkun(akunAktif, a)} className={samaAkun(akunAktif, a) ? 'on' : ''} onClick={() => setAkun(a)}>
                            {a ? <><i className="ku-tag">{a.slice(0, 1)}</i>{a}</> : 'Semua rekening'}
                        </button>
                    ))}
                </div>
                <div className="ku-ringkas">
                    <div className="ku-bersih">
                        <small>Arus kas bersih{akunAktif ? ` · ${akunAktif}` : ''}</small>
                        <b className={`mono ${kini.bersih < 0 ? 'neg' : ''}`}>{kini.bersih >= 0 ? '+' : ''}{rp(kini.bersih)}</b>
                    </div>
                    <div className="ku-io">
                        <div><small><i className="ku-dot in" />Masuk</small><b className="mono">{rp(kini.masuk)}</b>{ubahMasuk !== null && <em>{ubahMasuk >= 0 ? '+' : ''}{ubahMasuk}% vs periode lalu</em>}</div>
                        <div><small><i className="ku-dot out" />Keluar</small><b className="mono">{rp(kini.keluar)}</b>{ubahKeluar !== null && <em className={ubahKeluar > 0 ? 'buruk' : ''}>{ubahKeluar >= 0 ? '+' : ''}{ubahKeluar}% vs periode lalu</em>}</div>
                    </div>
                    {!akunAktif && <p className="ku-cat">Pindah dana antar rekening sendiri tidak dihitung. Pilih satu rekening untuk melihat arus masuk-keluarnya.</p>}
                </div>
            </header>

            {rep.error && <div className="error">Data keuangan belum bisa dibaca: {rep.error}</div>}
            {!rep.data && !rep.error && <div className="fin-empty">Memuat…</div>}

            {tab === 'beranda' && <div className="k-antre-wrap"><AntreMutasiKartu akun={ang.data?.akun || []} onTinjau={setTinjau} sinyal={sinyalAntre} /></div>}
            {rep.data && tab === 'beranda' && <Beranda tx={tx} semua={semua} akun={akunAktif} p={p} ang={ang.data} onTx={setDetail} go={setTab} lihat={bukaTransaksi} pilihAkun={setAkun} />}
            {rep.data && tab === 'arus' && <ArusKas tx={semua} akun={akunAktif} mulai={mulai} geser={geser} lihat={bukaTransaksi} />}
            {rep.data && tab === 'pengeluaran' && <Pengeluaran tx={tx} mulai={mulai} geser={geser} akun={akunAktif} lihat={bukaTransaksi} />}
            {rep.data && tab === 'anggaran' && <AnggaranView tx={tx.filter((t) => dalam(t, p))} p={p} ang={ang.data} simpan={async (x) => { await apiPost('/api/kantor/keuangan/anggaran', x); ang.reload(); }} lihat={bukaTransaksi} />}
            {rep.data && tab === 'transaksi' && <Transaksi tx={tx} akun={akunAktif} filter={filter} setFilter={setFilter} onTx={setDetail} />}
            <Hidup aktif={tab === 'chat'}><ChatUang ang={ang.data} onSaved={muat} /></Hidup>

            {tab !== 'chat' && <button className="k-fab ku-fab" onClick={() => setTambah(true)} aria-label="Tambah transaksi"><Ikon n="plus" size={22} /></button>}
            {tambah && <Tambah ang={ang.data} onClose={() => setTambah(false)} onSaved={() => { setTambah(false); muat(); }} />}
            {detail && <Detail t={detail} all={semua} mulai={mulai} onClose={() => setDetail(null)} lihat={(f) => { setDetail(null); bukaTransaksi(f); }}
                onUbah={() => { setUbah(detail); setDetail(null); }} onHapus={async () => { await apiPost('/api/kantor/keuangan/hapus', { ids: [detail.id] }); setDetail(null); muat(); }} />}
            {ubah && <Tambah ang={ang.data} id={ubah.id} awal={{ jenis: ubah.jenis, nominal: ubah.n, akun: ubah.bank, kategori: ubah.kat, pihak: ubah.pihak, keterangan: ubah.ket, tanggal: ubah.d }} onClose={() => setUbah(null)} onSaved={() => { setUbah(null); muat(); }} />}
            {impor && <UnggahMutasi akun={ang.data?.akun || []} onClose={() => setImpor(false)} onTerkirim={() => setSinyalAntre((n) => n + 1)} />}
            {tinjau && <ImporMutasi tinjau={tinjau} akunList={ang.data?.akun || []} onClose={() => { setTinjau(null); setSinyalAntre((n) => n + 1); }} onSelesai={() => { muat(); ang.reload(); setSinyalAntre((n) => n + 1); }} />}
        </div>
    );
}

/* ── Ringkasan ───────────────────────────────────────────── */
function Beranda({ tx, semua, akun, p, ang, onTx, go, lihat, pilihAkun }: { tx: Tx[]; semua: Tx[]; akun: string; p: ReturnType<typeof periode>; ang: Anggaran | null; onTx: (t: Tx) => void; go: (t: Tab) => void; lihat: (f: any) => void; pilihAkun: (a: string) => void }) {
    const saldo = Object.entries(ang?.saldo || {}).map(([a, s]) => ({ a, s, kini: saldoKini(a, s, semua) })).filter((x) => !akun || samaAkun(x.a, akun));
    const totalSaldo = saldo.reduce((a, x) => a + x.kini, 0);
    const today = hariIni();
    const hariIniKel = sum(tx.filter((t) => t.d === today && keluar(t)));
    const totalBatas = Object.values(ang?.batas || {}).reduce((a, b) => a + b, 0);
    const kelP = sum(semua.filter((t) => dalam(t, p) && keluar(t)));
    const sisaHari = Math.max(1, Math.round((Date.parse(p.end) - Date.parse(today)) / 86400_000) + 1);
    const jatah = totalBatas ? Math.max(0, (totalBatas - kelP) / sisaHari) : 0;
    const senin = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
    const minggu = tx.filter((t) => t.d >= senin && keluar(t));
    const rata8 = (() => { let s = 0; for (let k = 1; k <= 8; k++) { const a = new Date(Date.parse(senin) - k * 7 * 86400_000).toISOString().slice(0, 10), b = new Date(Date.parse(senin) - (k - 1) * 7 * 86400_000 - 86400_000).toISOString().slice(0, 10); s += sum(tx.filter((t) => keluar(t) && t.d >= a && t.d <= b)); } return s / 8; })();
    const katMinggu = Array.from(kelompok(minggu, (t) => t.kat).entries()).map(([k, v]) => ({ k, v: sum(v) })).sort((a, b) => b.v - a.v);
    const terakhir = [...tx].sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t)).slice(0, 6);
    const ubahMinggu = rata8 ? Math.round((sum(minggu) / rata8 - 1) * 100) : null;
    // Sisa anggaran: hanya kategori yang punya batas, semua rekening.
    const batas = ang?.batas || {};
    const pakaiKat = (k: string) => sum(semua.filter((t) => dalam(t, p) && keluar(t) && t.kat === k));
    const katAng = Object.entries(batas).map(([k, b]) => ({ k, b, u: pakaiKat(k) })).map((x) => ({ ...x, pc: Math.round((x.u / x.b) * 100) }));
    const terpakai = katAng.reduce((a, x) => a + x.u, 0);
    const pctAng = totalBatas ? Math.min(100, Math.round((terpakai / totalBatas) * 100)) : 0;
    const genting = [...katAng].sort((a, b) => b.pc - a.pc).slice(0, 3);
    return (
        <div className="ku-grid">
            <section className="ku-card ku-anggaran">
                <div className="ku-card-h"><h3>Sisa anggaran</h3><button className="ku-link" onClick={() => go('anggaran')}>{totalBatas ? 'Lihat' : 'Atur'}</button></div>
                {totalBatas > 0 ? (
                    <>
                        <b className={`ku-angka mono ${terpakai > totalBatas ? 'neg' : ''}`}>{rp(totalBatas - terpakai)}</b>
                        <span className="ku-meter tebal"><i className={pctAng > 90 ? 'out' : ''} style={{ width: `${pctAng}%` }} /></span>
                        <small className="ku-muted">Terpakai {rp(terpakai)} dari {rp(totalBatas)} · jatah {rp(jatah)}/hari sampai {tglPendek(p.end)}</small>
                        <div className="ku-genting">{genting.map((x) => (
                            <button key={x.k} onClick={() => lihat({ kat: x.k, jenis: 'Keluar' })} style={{ '--c': warnaDari(x.k, 0) } as React.CSSProperties}>
                                <span className="ku-rinci-t"><b>{x.k}</b><span className={`mono ${x.pc > 100 ? 'neg' : ''}`}>{x.pc}%</span></span>
                                <span className="ku-meter"><i className="kat" style={{ width: `${Math.min(100, x.pc)}%` }} /></span>
                            </button>
                        ))}</div>
                    </>
                ) : <p className="ku-muted">Belum ada anggaran. Atur batas per kategori supaya sisa dan jatah harian terlihat di sini.</p>}
            </section>
            <PocketBagian tx={semua} saldo={ang?.saldo || {}} akunList={Array.from(new Set([...(ang?.akun || []), ...Object.keys(ang?.saldo || {})]))} />
            {saldo.length > 0 && (
                <section className="ku-card ku-saldo">
                    <div className="ku-card-h"><h3>Saldo rekening</h3><b className="mono">{rp(totalSaldo)}</b></div>
                    {saldo.map((x) => (
                        <button key={x.a} className="ku-baris" onClick={() => pilihAkun(x.a)}>
                            <i className="ku-tag">{x.a.slice(0, 1)}</i>
                            <span className="ku-baris-main"><b>{x.a}</b><small>Mutasi {tglPendek(x.s.tanggal)}: {rp(x.s.nilai)}</small></span>
                            <b className="mono">{rp(x.kini)}</b>
                        </button>
                    ))}
                </section>
            )}
            <section className="ku-card ku-hari">
                <div className="ku-card-h"><h3>Keluar hari ini</h3><small>{tglPendek(today)}</small></div>
                <b className={`ku-angka mono ${totalBatas > 0 && hariIniKel > jatah ? 'neg' : ''}`}>{rp(hariIniKel)}</b>
                {totalBatas > 0 && <p className="ku-muted">{hariIniKel > jatah ? `Lewat ${rp(hariIniKel - jatah)} dari jatah harian` : `Masih ${rp(jatah - hariIniKel)} dari jatah harian`}</p>}
            </section>
            <section className="ku-card ku-minggu">
                <div className="ku-card-h"><h3>Minggu ini</h3><small>sejak {tglPendek(senin)}</small></div>
                <div className="ku-stat3">
                    <div><small>Keluar</small><b className="mono">{rp(sum(minggu))}</b>{ubahMinggu !== null && <em className={ubahMinggu > 0 ? 'buruk' : ''}>{ubahMinggu >= 0 ? '+' : ''}{ubahMinggu}% vs rata-rata 8 minggu</em>}</div>
                    <div><small>Terbesar</small><b>{katMinggu[0]?.k || '–'}</b>{katMinggu[0] && <em className="mono">{rp(katMinggu[0].v)}</em>}</div>
                    <div><small>Transaksi</small><b className="mono">{minggu.length}</b>{minggu.length > 0 && <em>rata-rata {rp(sum(minggu) / minggu.length)}</em>}</div>
                </div>
                {katMinggu.length > 0 && <div className="ku-stack" aria-hidden>{katMinggu.slice(0, 6).map((k, i) => <i key={k.k} title={`${k.k}: ${rp(k.v)}`} style={{ flex: k.v, background: warnaDari(k.k, i) }} onClick={() => lihat({ kat: k.k, jenis: 'Keluar' })} />)}</div>}
            </section>
            <section className="ku-card ku-lebar">
                <div className="ku-card-h"><h3>Transaksi terakhir</h3><button className="ku-link" onClick={() => go('transaksi')}>Lihat semua</button></div>
                {terakhir.length === 0 && <div className="fin-empty">Belum ada transaksi.</div>}
                {terakhir.map((t, i) => <TxRow key={t.id || i} t={t} onClick={() => onTx(t)} />)}
            </section>
        </div>
    );
}

export function TxRow({ t, onClick }: { t: Tx; onClick: () => void }) {
    const pindah = transfer(t), tuju = tujuanTransfer(t);
    const judul = pindah ? 'Pindah dana' : (t.pihak || t.ket || t.kat);
    const sub = pindah ? (tuju ? (transferMasuk(t) ? `${tuju} → ${t.bank}` : `${t.bank} → ${tuju}`) : `${transferMasuk(t) ? 'masuk ke' : 'keluar dari'} ${t.bank}`)
        : `${t.jenis === 'Masuk' ? 'Pemasukan' : t.kat} · ${t.bank}${t.status === 'Manual' ? ' · manual' : ''}`;
    const auto = t.status === 'Otomatis';
    return (
        <button className="ku-tx" onClick={onClick}>
            <span className="ku-ico" style={warnaTx(t) ? { '--c': warnaTx(t) } as React.CSSProperties : undefined}><Ikon n={ikonGaris(t)} /></span>
            <span className="ku-tx-main"><b>{judul}</b><small>{sub}{auto ? ' · menunggu mutasi' : ''}</small></span>
            <span className={`ku-tx-n mono ${t.jenis === 'Masuk' ? 'in' : pindah ? 'pindah' : ''}`}>{t.jenis === 'Masuk' ? '+' : t.jenis === 'Keluar' ? '−' : ''}{rp(t.n)}</span>
        </button>
    );
}

/* ── Pengeluaran ─────────────────────────────────────────── */
function Pengeluaran({ tx, mulai, geser, akun, lihat }: { tx: Tx[]; mulai: number; geser: number; akun: string; lihat: (f: any) => void }) {
    const [byS, setBy] = useState<'kat' | 'bank' | 'pihak'>('kat');
    const by = akun && byS === 'bank' ? 'kat' : byS;
    const pers = Array.from({ length: 6 }, (_, i) => periode(mulai, geser - 5 + i));
    const nilai = pers.map((p) => ({ label: p.pendek, v: sum(tx.filter((t) => dalam(t, p) && keluar(t))) }));
    const rata = nilai.slice(0, 5).reduce((a, x) => a + x.v, 0) / 5;
    const p = pers[5];
    const xs = tx.filter((t) => dalam(t, p) && keluar(t));
    const grup = Array.from(kelompok(xs, (t) => (by === 'pihak' ? t.pihak || '(tanpa nama)' : by === 'bank' ? t.bank : t.kat)).entries())
        .map(([k, v]) => ({ k, v: sum(v), n: v.length })).sort((a, b) => b.v - a.v);
    const total = sum(xs);
    const ubah = rata ? Math.round((total / rata - 1) * 100) : null;
    const pilihan: Array<[typeof byS, string]> = akun ? [['kat', 'Kategori'], ['pihak', 'Merchant']] : [['kat', 'Kategori'], ['bank', 'Rekening'], ['pihak', 'Merchant']];
    return (
        <div className="ku-grid">
            <section className="ku-card ku-lebar">
                <div className="ku-card-h"><h3>Pengeluaran</h3><small>{p.label}</small></div>
                <b className="ku-angka besar mono">{rp(total)}</b>
                {ubah !== null && <em className={`ku-ubah ${ubah > 0 ? 'buruk' : ''}`}>{ubah >= 0 ? '+' : ''}{ubah}% vs rata-rata 5 periode sebelumnya</em>}
                <Batang data={nilai} rata={rata} aktif={5} />
            </section>
            <section className="ku-card ku-lebar">
                <div className="ku-card-h"><h3>Ke mana saja</h3>
                    <div className="ku-seg">{pilihan.map(([k, l]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}</div>
                </div>
                {grup.length > 0 && <div className="ku-stack besar" aria-hidden>{grup.slice(0, 8).map((g, i) => <i key={g.k} style={{ flex: g.v, background: warnaDari(by === 'kat' ? g.k : '', i) }} />)}</div>}
                {grup.length === 0 && <div className="fin-empty">Belum ada pengeluaran di periode ini.</div>}
                {grup.map((g, i) => (
                    <button key={g.k} className="ku-rank" onClick={() => lihat(by === 'kat' ? { kat: g.k, jenis: 'Keluar' } : by === 'bank' ? { jenis: 'Keluar', pihak: undefined, kat: undefined } : { pihak: g.k, jenis: 'Keluar' })}>
                        <i className="ku-titik" style={{ background: i < 8 ? warnaDari(by === 'kat' ? g.k : '', i) : 'var(--faint)' }} />
                        <span className="ku-rank-main"><b>{g.k}</b><small>{g.n} transaksi</small></span>
                        <span className="ku-rank-n"><b className="mono">{rp(g.v)}</b><small className="mono">{total ? Math.round((g.v / total) * 100) : 0}%</small></span>
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
                <div className="k-meter big"><i style={{ width: `${pct}%`, background: pct > 90 ? 'var(--down)' : pct > 70 ? 'var(--warn, #d97706)' : 'var(--accent)' }} /></div>
                <div className="k-row-sb"><small>Terpakai {rp(terpakai)} ({pct}%)</small><small>dari {rp(total)}</small></div>
                {total > 0 && <div className="k-tip">Sisa {sisaHari} hari. Kamu bisa belanja <b className="mono">{rp(Math.max(0, (total - terpakai) / sisaHari))}</b> per hari sampai {tglPendek(p.end)}.</div>}
            </section>
            {edit && (
                <section className="k-card k-span2">
                    <div className="k-card-h"><h3>Atur anggaran</h3></div>
                    <label className="k-field"><span>Periode mulai tiap tanggal (mis. tanggal gajian)</span><input className="input" type="number" min={1} max={28} value={mulai} onChange={(e) => setMulai(Number(e.target.value))} /></label>
                    <div className="k-edit-list">
                        {ang.kategori.map((k) => (
                            <label key={k} className="k-edit-row"><span>{k}</span><input className="input" inputMode="numeric" placeholder="0" value={draft[k] || ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/\D/g, '') })} /></label>
                        ))}
                    </div>
                    <button className="btn primary" onClick={async () => { await simpan({ mulai, batas: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) }); setEdit(false); }}>Simpan anggaran</button>
                </section>
            )}
            <NamaSendiri ang={ang} simpan={simpan} />
            <section className="k-card k-span2">
                <div className="k-card-h"><h3>Anggaran per kategori</h3><small>{p.label}</small></div>
                {Object.keys(ang.batas).length === 0 && <div className="fin-empty">Belum ada anggaran. Tekan <b>Ubah</b> untuk mengatur batas per kategori.</div>}
                {Object.entries(ang.batas).map(([k, b]) => {
                    const u = pakai(k), pc = Math.round((u / b) * 100);
                    return (
                        <button key={k} className="k-budget" onClick={() => lihat({ kat: k, jenis: 'Keluar' })}>
                            <div className="k-row-sb"><b>{k}</b><span className={`mono ${pc > 100 ? 'down' : ''}`}>{pc}%</span></div>
                            <div className="k-meter"><i style={{ width: `${Math.min(100, pc)}%`, background: pc > 100 ? 'var(--down)' : pc > 80 ? 'var(--warn, #d97706)' : warnaDari(k, 0) }} /></div>
                            <small>Terpakai {rp(u)} dari {rp(b)}{pc > 100 ? ` · lebih ${rp(u - b)}` : ` · sisa ${rp(b - u)}`}</small>
                        </button>
                    );
                })}
            </section>
        </div>
    );
}

/** Nama Pak Rico di rekening: transfer ke/dari nama ini = pindah dana, bukan pengeluaran. */
function NamaSendiri({ ang, simpan }: { ang: Anggaran; simpan: (x: any) => Promise<void> }) {
    const [teks, setTeks] = useState((ang.namaSendiri || []).join(', '));
    const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
    const kosong = !(ang.namaSendiri || []).length;
    return (
        <section className={`k-card k-span2 ${kosong ? 'k-perlu' : ''}`}>
            <div className="k-card-h"><h3>Transfer antar rekening sendiri</h3></div>
            <p className="k-muted">Tulis nama Bapak seperti tertulis di rekening (pisahkan koma kalau ada beberapa versi, mis. nama lengkap dan singkatan). Transfer dari/ke nama ini, misalnya BCA → Mandiri, dicatat sebagai <b>pindah dana</b>: saldo pengirim berkurang, saldo penerima bertambah, dan tidak dihitung sebagai pengeluaran atau pemasukan.</p>
            <div className="k-row-sb" style={{ gap: 8 }}>
                <input className="input" value={teks} onChange={(e) => setTeks(e.target.value)} placeholder="mis. RICO SAPUTRA" aria-label="Nama di rekening" style={{ flex: 1 }} />
                <button className="btn primary" disabled={busy} onClick={async () => {
                    setBusy(true); setMsg('');
                    try { await simpan({ namaSendiri: teks.split(',').map((x) => x.trim()).filter(Boolean) }); setMsg('Tersimpan. Transaksi lama sedang dirapikan, cek lagi dalam beberapa menit.'); } catch (e: any) { setMsg(String(e.message || e)); }
                    setBusy(false);
                }}>Simpan</button>
            </div>
            {msg && <small className="k-muted">{msg}</small>}
        </section>
    );
}

/* ── Transaksi ───────────────────────────────────────────── */
function Transaksi({ tx, akun, filter, setFilter, onTx }: { tx: Tx[]; akun: string; filter: any; setFilter: (f: any) => void; onTx: (t: Tx) => void }) {
    const [q, setQ] = useState('');
    const [batas, setBatas] = useState(60);
    const xs = useMemo(() => tx.filter((t) => (!filter.jenis || t.jenis === filter.jenis) && (!filter.kat || t.kat === filter.kat) && (!filter.pihak || (t.pihak || '(tanpa nama)') === filter.pihak)
        && (!q || `${t.pihak} ${t.ket} ${t.kat} ${t.bank}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t)), [tx, filter, q]);
    const hari = Array.from(kelompok(xs.slice(0, batas), (t) => t.d).entries());
    const aktif = Object.entries(filter).filter(([k, v]) => v && k !== 'jenis');
    const total = arusTotal(xs, akun);
    return (
        <section className="ku-card ku-lebar ku-list">
            <div className="ku-alat">
                <label className="ku-cari"><Ikon n="search" /><input placeholder="Cari" aria-label="Cari merchant, catatan, kategori" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                <div className="ku-seg">{[['', 'Semua'], ['Keluar', 'Keluar'], ['Masuk', 'Masuk'], ['Antar Rekening', 'Pindah dana']].map(([j, l]) => <button key={j} className={(filter.jenis || '') === j ? 'on' : ''} onClick={() => setFilter({ ...filter, jenis: j || undefined })}>{l}</button>)}</div>
            </div>
            {aktif.length > 0 && <div className="ku-chips">{aktif.map(([k, v]) => <button key={k} onClick={() => setFilter({ ...filter, [k]: undefined })}>{String(v)}<Ikon n="circle-x" size={14} /></button>)}</div>}
            <div className="ku-total mono"><span>{xs.length} transaksi</span><span>masuk {rp(total.masuk)}</span><span>keluar {rp(total.keluar)}</span></div>
            {hari.map(([d, list]) => {
                const n = arusTotal(list, akun).bersih;
                return (
                    <div key={d} className="ku-hari-grup">
                        <div className="ku-day"><span>{tglPanjang(d)}</span><b className="mono">{n > 0 ? '+' : n < 0 ? '−' : ''}{rp(Math.abs(n))}</b></div>
                        {list.map((t, i) => <TxRow key={t.id || i} t={t} onClick={() => onTx(t)} />)}
                    </div>
                );
            })}
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
                    <span className="ku-ico besar" style={warnaTx(t) ? { '--c': warnaTx(t) } as React.CSSProperties : undefined}><Ikon n={ikonGaris(t)} size={22} /></span>
                    <b className={`mono ${t.jenis === 'Masuk' ? 'in' : 'out'}`}>{t.jenis === 'Masuk' ? '+ ' : t.jenis === 'Keluar' ? '− ' : ''}{rp(t.n)}</b>
                    <small>{tglPanjang(t.d)} · {t.t}</small>
                </div>
                <div className="k-kv">
                    <div><small>Kategori</small><b>{transfer(t) ? 'Pindah dana antar rekening sendiri (bukan pengeluaran)' : t.kat}</b></div>
                    <div><small>Akun</small><b>{t.bank}</b></div>
                    <div><small>Merchant / pihak</small><b>{t.pihak || '–'}</b></div>
                    <div><small>Catatan</small><b>{t.ket || '–'}</b></div>
                    <div><small>Sumber</small><b>{t.status === 'Manual' ? 'Dicatat manual' : t.status === 'Mutasi' ? 'Mutasi rekening (PDF)' : t.status === 'Otomatis' ? 'Dibuat otomatis, menunggu mutasi' : 'Email bank (otomatis)'}</b></div>
                    <div><small>Jenis</small><b>{t.jenis}</b></div>
                </div>
                <h4>{t.pihak ? `Di ${t.pihak}` : `Kategori ${t.kat}`} per periode <small>({kali}× total)</small></h4>
                <Batang data={seri} aktif={5} rata={seri.slice(0, 5).reduce((a, x) => a + x.v, 0) / 5} />
                {keluar(t) && totP > 0 && (
                    <div className="k-tip">{t.kat} = <b className="mono">{Math.round((katP / totP) * 100)}%</b> dari pengeluaran {pNow.label} ({rp(katP)}). Transaksi ini {Math.round((t.n / Math.max(1, katP)) * 100)}% dari kategori itu.</div>
                )}
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {t.pihak && <button className="btn" onClick={() => lihat({ pihak: t.pihak })}>Semua di {t.pihak}</button>}
                    <button className="btn" onClick={() => lihat({ kat: t.kat })}>Semua {t.kat}</button>
                </div>
                {t.id && (
                    <div className="k-det-act">
                        <button className="btn" onClick={onUbah}><Ikon e="✏" /> Ubah</button>
                        <button className="btn danger" disabled={busy} onClick={async () => {
                            if (!(await konfirmasi(`Hapus transaksi ${rp(t.n)} (${t.pihak || t.kat}, ${tglPendek(t.d)})? Salinannya tetap disimpan di VPS.`))) return;
                            setBusy(true); setHapusErr('');
                            try { await onHapus(); } catch (e: any) { setHapusErr(String(e?.message || e)); setBusy(false); }
                        }}>{busy ? 'Menghapus…' : <><Ikon e="🗑" /> {'Hapus'}</>}</button>
                    </div>
                )}
                {hapusErr && <div className="error">{hapusErr}</div>}
            </div>
        </div>
    );
}

/** Perkecil foto (sisi terpanjang 1600 px, JPEG) supaya unggah struk cepat di data seluler. */
async function kecilkanGambar(f: File): Promise<Blob> {
    try {
        const bmp = await createImageBitmap(f);
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
        return b || f;
    } catch { return f; }
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
    const [struk, setStruk] = useState<{ busy: boolean; info: string; berkas?: string }>({ busy: false, info: '' });
    const nominal = Number(n.replace(/\D/g, ''));
    // U22 · validasi langsung: beri tahu sebelum menekan Simpan, bukan sesudah.
    const [disentuh, setDisentuh] = useState(false);
    const nominalSalah = disentuh && !nominal ? "Isi nominalnya dulu." : "";
    const nominalPesan = nominalSalah || (nominal >= 50_000_000 ? `Periksa lagi: Rp${nominal.toLocaleString("id-ID")} (${(nominal / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} juta).` : "");
    const kemarin = new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    const katCepat = Array.from(new Set([kat, ...(ang?.kategori || [])])).filter((k) => k !== 'Pendapatan').slice(0, 6);
    const bacaStruk = async (f?: File | null) => {
        if (!f) return;
        setStruk({ busy: true, info: '' }); setErr('');
        try {
            const blob = await kecilkanGambar(f);
            const res = await fetch(`${serverBase()}/api/kantor/keuangan/struk`, { method: 'POST', headers: { Authorization: `Bearer ${tokenLogin()}`, 'Content-Type': blob.type }, body: blob });
            const j: any = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
            const d = j.draf;
            setJenis('Keluar'); setN(String(d.nominal)); if (d.pihak) setPihak(d.pihak); if (d.keterangan) setKet(d.keterangan);
            if (d.kategori) setKat(d.kategori); if (d.tanggal) setTgl(d.tanggal); if (d.akun) setAkun(d.akun);
            setStruk({ busy: false, info: `${j.oleh || 'Uang'} membaca struk${d.item?.length ? ` (${d.item.length} item)` : ''}. Cek lalu simpan.`, berkas: d.berkas });
        } catch (e: any) { setStruk({ busy: false, info: '' }); setErr(String(e.message || e)); }
    };
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
                {!id && (
                    <label className={`k-struk ${struk.busy ? 'busy' : ''}`}>
                        <input type="file" accept="image/*" capture="environment" hidden disabled={struk.busy} onChange={(e) => { void bacaStruk(e.target.files?.[0]); e.target.value = ''; }} />
                        <Ikon e="🧾" size={18} />
                        <span><b>{struk.busy ? 'Uang sedang membaca struk…' : 'Foto struk'}</b><small>{struk.busy ? 'Biasanya 5–15 detik' : 'Toko, total, tanggal & kategori terisi otomatis'}</small></span>
                    </label>
                )}
                {struk.info && <div className="k-struk-ok"><Ikon e="✅" /> {struk.info}</div>}
                <div className="k-seg full">{[['Keluar', 'Pengeluaran'], ['Masuk', 'Pemasukan'], ['Antar Rekening', 'Transfer']].map(([k, l]) => <button key={k} className={jenis === k ? 'on' : ''} onClick={() => setJenis(k)}>{l}</button>)}</div>
                <label className={`k-amount${nominalSalah ? ' salah-isi' : ''}`}><span>Rp</span><input inputMode="numeric" autoFocus={!struk.busy} placeholder="0" aria-invalid={!!nominalSalah} aria-describedby="k-nominal-pesan" style={nominal >= 10_000_000 ? { fontSize: nominal >= 1e9 ? 28 : 36 } : undefined} value={nominal ? nominal.toLocaleString('id-ID') : ''} onBlur={() => n !== '' && setDisentuh(true)} onChange={(e) => { setN(e.target.value); if (e.target.value) setDisentuh(true); }} /></label>
                {nominalPesan && <div id="k-nominal-pesan" className={nominalSalah ? 'pesan-salah' : 'k-catatan'} role={nominalSalah ? 'alert' : undefined}>{nominalPesan}</div>}
                <div className="k-cepat">{[10_000, 25_000, 50_000, 100_000].map((v) => <button key={v} type="button" onClick={() => setN(String(v))}>{v >= 1e6 ? `${v / 1e6}jt` : `${v / 1e3}rb`}</button>)}</div>
                <div className="k-tgl">
                    <button type="button" className={tgl === hariIni() ? 'on' : ''} onClick={() => setTgl(hariIni())}>Hari ini</button>
                    <button type="button" className={tgl === kemarin ? 'on' : ''} onClick={() => setTgl(kemarin)}>Kemarin</button>
                    <TanggalInput className={tgl !== hariIni() && tgl !== kemarin ? 'on' : ''} value={tgl} max={hariIni()} bisaKosong={false} ariaLabel="Tanggal transaksi" onChange={(v) => v && setTgl(v)} tampil={tgl !== hariIni() && tgl !== kemarin ? new Date(`${tgl}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'Tanggal lain'} />
                </div>
                <div className="k-akun">{Array.from(new Set([...(ang?.akun || ['Cash']), akun])).map((a) => <button key={a} className={akun === a ? 'on' : ''} onClick={() => setAkun(a)}>{a === 'Cash' ? <Ikon e="💵" /> : <Ikon e="🏦" />} {a}</button>)}</div>
                {(jenis === 'Keluar' || id) && <div className="k-kat">{katCepat.map((k) => <button key={k} type="button" className={kat === k ? 'on' : ''} onClick={() => setKat(k)}>{ikon(k)} {k}</button>)}</div>}
                {(jenis === 'Keluar' || id) && <select className="select" aria-label="Semua kategori" value={kat} onChange={(e) => setKat(e.target.value)}>{Array.from(new Set([...(ang?.kategori || ['Lainnya']), 'Pendapatan', kat])).map((k) => <option key={k} value={k}>{ikon(k)} {k}</option>)}</select>}
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
                    <div className="k-hello"><span><Ikon e="🤖" /></span><b>Hai, saya Uang</b><small>Tulis transaksi dengan bahasa biasa — saya catat ke Google Sheets. Atau tanya apa saja soal keuanganmu.</small></div>
                )}
                {pesan.map((m) => <div key={m.id} className={`wa-bubble ${m.dari === 'owner' ? 'me' : 'them'}`}><div className="wa-text">{m.dari === 'owner' ? m.teks : <RichText text={m.teks} />}</div></div>)}
                {menulis.length > 0 && <div className="wa-bubble them typing"><span className="dots"><i /><i /><i /></span></div>}
                {draf && (
                    <div className="k-draf">
                        <small>“{draf.asal}”</small>
                        <div className="k-draf-row"><span className="k-ico" style={{ background: `${warnaDari(draf.kategori, 0)}22` }}>{draf.jenis === 'Masuk' ? <Ikon e="💰" /> : ikon(draf.kategori)}</span>
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
