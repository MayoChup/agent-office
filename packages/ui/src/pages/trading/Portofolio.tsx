import React, { useEffect, useRef, useState } from 'react';
import { TanggalInput } from '../../components/Tanggal';
import { createPortal } from 'react-dom';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { usd } from './types';
import { SimulasiSinyal } from './SimulasiSinyal';

import { Ikon } from '../../components/Ikon';
import { konfirmasi } from '../../components/Konfirmasi';
type Res = 'harian' | 'mingguan' | 'bulanan';
interface Pos { masa?: { H: number; hari: number; sisa: number; status: 'jalan' | 'terakhir' | 'lewat' } | null; symbol: string; shares: number; entry: number; target: number; stop: number; openedAt: string; closedAt?: string; exit?: number; pnl: number | null; pnlPct: number | null; modal: number; harga?: number | null; nilai?: number | null; keTarget?: number | null; keStop?: number | null; hari: number | null; profil?: string; ai?: { label?: string; mode?: string; pt?: string }; catatan?: string; notified?: { target?: string; stop?: string } }
interface Dana { id: string; tgl: string; jenis: 'awal' | 'setor' | 'tarik'; jumlah: number; catatan?: string }
interface Data {
    ringkasan: { nilaiTotal: number; untung: number; untungPct: number | null; terealisasi: number; berjalan: number; kas: number; nilaiSaham: number; modalTerpakai: number; totalDana: number; disetor: number; ditarik: number; spyUntung: number | null; spyUntungPct: number | null; mulai: string; danaOtomatis: boolean };
    posisi: Pos[]; riwayat: Pos[]; dana: Dana[]; kurva: Array<{ t: string; nilai: number; dana: number; untung: number; spy: number | null }>;
    statistik: { transaksi: number; terbuka: number; menangPct: number | null; rataMenangPct: number | null; rataKalahPct: number | null; profitFactor: number | null; terbaik: Pos | null; terburuk: Pos | null; rataHari: number | null; turunTerdalam: number };
    perLabel: Array<{ label: string; n: number; pnl: number; rataPct: number | null }>;
}
const LS = 'kantor:porto-pref';
const tanda = (n: number | null | undefined, f = (x: number) => usd(x)) => (n == null ? '–' : `${n >= 0 ? '+' : '−'}${f(Math.abs(n))}`);
const pc = (n: number | null | undefined) => (n == null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`);
const kls = (n: number | null | undefined) => (n == null ? '' : n >= 0 ? 'up' : 'down');
const tglId = (t: string) => new Date(`${t.slice(0, 10)}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Portofolio lengkap: nilai & untung total, grafik harian/mingguan/bulanan, pembanding S&P 500, posisi, riwayat, dana, statistik. */
export function Portofolio({ onBuka }: { onBuka?: (s: string) => void }) {
    const pref = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
    const [res, setRes] = useState<Res>(pref.res || 'harian');
    const [tampil, setTampil] = useState<'nilai' | 'untung'>(pref.tampil || 'nilai');
    const [banding, setBanding] = useState<boolean>(pref.banding ?? true);
    useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ res, tampil, banding })); } catch { /* */ } }, [res, tampil, banding]);
    const d = useApi<Data>(`/api/kantor/portofolio?res=${res}`, 300_000);
    const [lembar, setLembar] = useState<null | { jenis: 'jual' | 'ubah'; p: Pos } | { jenis: 'dana'; awal?: Dana['jenis'] }>(null);
    const [msg, setMsg] = useState('');
    const selesai = (m: string) => { setLembar(null); setMsg(m); d.reload(); setTimeout(() => setMsg(''), 6000); };
    const r = d.data?.ringkasan, st = d.data?.statistik;

    if (!d.data) return <section className="sb-card">{d.error ? <div className="error">{d.error}</div> : <div className="pg-skel" style={{ height: 240 }} />}</section>;
    return (
        <div className="porto">
            {msg && <div className="fin-alert">{msg}</div>}
            {r!.danaOtomatis && (
                <div className="hz-bukti warn"><Ikon e="💡" /> <span>Modal awal belum diatur — sementara memakai modal di pengaturan ({usd(r!.totalDana)}). <button className="btn small" onClick={() => setLembar({ jenis: 'dana', awal: 'awal' })}>Atur modal awal</button></span></div>
            )}
            <section className="sb-card porto-hero">
                <div className="ph-utama">
                    <small>Nilai portofolio</small>
                    <b className="mono">{usd(r!.nilaiTotal)}</b>
                    <span className={`mono ${kls(r!.untung)}`}>{tanda(r!.untung)} ({pc(r!.untungPct)}) <em>sejak {tglId(r!.mulai)}</em></span>
                </div>
                <div className="ph-grid">
                    <div><small>Untung terealisasi</small><b className={`mono ${kls(r!.terealisasi)}`}>{tanda(r!.terealisasi)}</b></div>
                    <div><small>Untung berjalan</small><b className={`mono ${kls(r!.berjalan)}`}>{tanda(r!.berjalan)}</b></div>
                    <div><small>Kas tersedia</small><b className="mono">{usd(r!.kas)}</b></div>
                    <div><small>Nilai saham</small><b className="mono">{usd(r!.nilaiSaham)}</b></div>
                    <div><small>Dana disetor bersih</small><b className="mono">{usd(r!.totalDana)}</b>{r!.ditarik > 0 && <em>ditarik {usd(r!.ditarik)}</em>}</div>
                    <div><small>Kalau ditaruh di S&P 500</small><b className={`mono ${kls(r!.spyUntung)}`}>{tanda(r!.spyUntung)} ({pc(r!.spyUntungPct)})</b>{r!.spyUntung != null && <em className={kls(r!.untung - r!.spyUntung)}>{r!.untung >= r!.spyUntung ? 'Bapak unggul' : 'Bapak tertinggal'} {usd(Math.abs(r!.untung - r!.spyUntung))}</em>}</div>
                </div>
                <div className="ph-aksi">
                    <button className="btn small" onClick={() => setLembar({ jenis: 'dana', awal: 'setor' })}><Ikon e="➕" /> Suntik dana</button>
                    <button className="btn small" onClick={() => setLembar({ jenis: 'dana', awal: 'tarik' })}><Ikon e="➖" /> Tarik dana</button>
                    <button className="btn small" onClick={() => setLembar({ jenis: 'dana', awal: 'awal' })}><Ikon e="⚙" /> Modal awal</button>
                </div>
            </section>

            <section className="sb-card">
                <div className="porto-chart-h">
                    <div className="sb-seg">{(['nilai', 'untung'] as const).map((k) => <button key={k} className={tampil === k ? 'on' : ''} onClick={() => setTampil(k)}>{k === 'nilai' ? 'Nilai portofolio' : 'Untung / rugi'}</button>)}</div>
                    <div className="sb-seg">{(['harian', 'mingguan', 'bulanan'] as Res[]).map((k) => <button key={k} className={res === k ? 'on' : ''} onClick={() => setRes(k)}>{k === 'harian' ? 'Harian' : k === 'mingguan' ? 'Mingguan' : 'Bulanan'}</button>)}</div>
                    <label className="porto-cek"><input type="checkbox" checked={banding} onChange={(e) => setBanding(e.target.checked)} /> Bandingkan S&P 500</label>
                </div>
                <Grafik kurva={d.data.kurva} tampil={tampil} banding={banding} />
                <p className="sb-note">{tampil === 'nilai' ? 'Garis hijau = nilai portofolio (kas + saham). Garis putus-putus abu = dana yang Bapak setor. ' : 'Untung/rugi = nilai portofolio dikurangi dana yang disetor (suntik dana tidak dihitung sebagai untung). '}{banding ? 'Garis biru = kalau dana yang sama (di tanggal yang sama) dibelikan S&P 500.' : ''}</p>
            </section>

            <section className="sb-card">
                <div className="sd-h"><h3>Posisi terbuka <small>{d.data.posisi.length} saham · modal terpakai {usd(r!.modalTerpakai)}</small></h3></div>
                {!d.data.posisi.length && <div className="fin-empty">Belum ada. Buka halaman saham → <b><Ikon e="📌" /> Pegang posisi</b> setelah Bapak membeli di broker.</div>}
                {d.data.posisi.map((p) => (
                    <div key={p.symbol} className="porto-pos">
                        <div className="pp-top">
                            <button className="pp-sym" onClick={() => onBuka?.(p.symbol)}><b className="mono">{p.symbol}</b><small>{p.shares} lembar @ {usd(p.entry)} · {p.hari} hari</small></button>
                            <div className="pp-pnl"><b className={`mono ${kls(p.pnl)}`}>{tanda(p.pnl)}</b><small className={kls(p.pnlPct)}>{pc(p.pnlPct)}</small></div>
                        </div>
                        <Rentang p={p} />
                        <div className="pp-meta">
                            <span>modal {usd(p.modal)} → {usd(p.nilai)}</span>
                            {p.keTarget != null && <span>ke target {pc(p.keTarget)}</span>}
                            {p.keStop != null && <span>ke stop {pc(p.keStop)}</span>}
                            {p.ai?.label && <span className="pp-ai">sinyal saat beli: {p.ai.label}{p.ai.pt ? ` · ${p.ai.pt}` : ''}</span>}
                            {p.profil && p.profil !== 'kustom' && <span>profil {p.profil}</span>}
                            {p.masa && <span className={`pp-masa ${p.masa.status}`}>{p.masa.status === 'lewat' ? `Lewat durasi · hari ${p.masa.hari}/${p.masa.H}` : p.masa.status === 'terakhir' ? `Hari terakhir masa pegang (${p.masa.H} hari)` : `Masa pegang hari ${p.masa.hari}/${p.masa.H}`}</span>}
                        </div>
                        {p.masa?.status === 'lewat' && !p.notified?.target && !p.notified?.stop && <div className="fin-alert"><Ikon e="🟠" /> Sudah lewat masa pegang ({p.masa.H} hari bursa) tanpa kena target/stop. Sesuai rencana: tutup posisi — atau cek sinyal terbaru {p.symbol}; kalau masih Beli, boleh lanjut sebagai rencana baru dengan stop awal tetap dipakai. Bukan saran keuangan.</div>}
                        {(p.notified?.target || p.notified?.stop) && <div className="fin-alert">{p.notified?.target ? <><Ikon e="🟢" /> {'Target tersentuh — sudah jual? Catat di "Jual".'}</> : <><Ikon e="🔴" /> {'Stop loss tersentuh — sudah jual? Catat di "Jual".'}</>}</div>}
                        <div className="pp-aksi">
                            <button className="btn small primary" onClick={() => setLembar({ jenis: 'jual', p })}><Ikon e="💵" /> Jual / tutup</button>
                            <button className="btn small" onClick={() => setLembar({ jenis: 'ubah', p })}><Ikon e="✏" /> Ubah target/stop</button>
                        </div>
                    </div>
                ))}
            </section>

            <section className="sb-card">
                <div className="sd-h"><h3>Statistik <small>{st!.transaksi} transaksi selesai</small></h3></div>
                <div className="ph-grid porto-stat">
                    <div><small>Menang</small><b className="mono">{st!.menangPct == null ? '–' : `${st!.menangPct}%`}</b></div>
                    <div><small>Rata-rata saat untung</small><b className="mono up">{pc(st!.rataMenangPct)}</b></div>
                    <div><small>Rata-rata saat rugi</small><b className="mono down">{pc(st!.rataKalahPct)}</b></div>
                    <div><small>Profit factor</small><b className="mono">{st!.profitFactor ?? '–'}</b><em>untung ÷ rugi; &gt;1 = bagus</em></div>
                    <div><small>Rata-rata lama pegang</small><b className="mono">{st!.rataHari == null ? '–' : `${st!.rataHari} hari`}</b></div>
                    <div><small>Turun terdalam</small><b className="mono down">{st!.turunTerdalam}%</b><em>dari puncak nilai</em></div>
                    {st!.terbaik && <div><small>Terbaik</small><b className="mono up">{st!.terbaik.symbol} {pc(st!.terbaik.exit ? (st!.terbaik.exit / st!.terbaik.entry - 1) * 100 : null)}</b></div>}
                    {st!.terburuk && <div><small>Terburuk</small><b className="mono down">{st!.terburuk.symbol} {pc(st!.terburuk.exit ? (st!.terburuk.exit / st!.terburuk.entry - 1) * 100 : null)}</b></div>}
                </div>
                {d.data.perLabel.length > 0 && (<>
                    <h4 className="porto-sub">Hasil menurut sinyal AI saat beli</h4>
                    <table className="um-t"><thead><tr><th>Sinyal saat beli</th><th>Posisi</th><th>Total untung</th><th>Rata-rata</th></tr></thead>
                        <tbody>{d.data.perLabel.map((x) => <tr key={x.label}><td>{x.label}</td><td className="mono">{x.n}</td><td className={`mono ${kls(x.pnl)}`}>{tanda(x.pnl)}</td><td className={`mono ${kls(x.rataPct)}`}>{pc(x.rataPct)}</td></tr>)}</tbody></table>
                    <p className="sb-note">Termasuk posisi yang masih terbuka. Makin banyak transaksi, makin bisa dipercaya.</p>
                </>)}
            </section>

            <section className="sb-card">
                <div className="sd-h"><h3>Riwayat transaksi <small>{d.data.riwayat.length}</small></h3></div>
                {!d.data.riwayat.length && <div className="fin-empty">Belum ada posisi yang ditutup.</div>}
                {d.data.riwayat.map((p) => (
                    <div key={`${p.symbol}${p.openedAt}${p.closedAt}`} className="porto-rw">
                        <div><b className="mono">{p.symbol}</b><small>{p.shares} lbr · {usd(p.entry)} → {usd(p.exit)} · {tglId(p.openedAt)} – {tglId(p.closedAt!)} ({p.hari} hari){p.ai?.label ? ` · sinyal ${p.ai.label}` : ''}</small></div>
                        <div className="pp-pnl"><b className={`mono ${kls(p.pnl)}`}>{tanda(p.pnl)}</b><small className={kls(p.pnlPct)}>{pc(p.pnlPct)}</small></div>
                        <button className="icon-btn kecil" title="Hapus catatan (salah input)" onClick={async () => { if ((await konfirmasi(`Hapus catatan transaksi ${p.symbol}? Untung/rugi ikut hilang dari hitungan.`))) apiPost('/api/kantor/portofolio/hapus', { jenis: 'riwayat', symbol: p.symbol, openedAt: p.openedAt, closedAt: p.closedAt }).then(() => selesai(`Catatan ${p.symbol} dihapus.`)).catch((e) => setMsg(String(e.message || e))); }}><Ikon e="🗑" /></button>
                    </div>
                ))}
            </section>

            <section className="sb-card">
                <div className="sd-h"><h3>Arus dana <small>modal awal, suntik & tarik dana</small></h3><button className="btn small" onClick={() => setLembar({ jenis: 'dana', awal: 'setor' })}><Ikon e="➕" /> Catat</button></div>
                {d.data.dana.map((x) => (
                    <div key={x.id} className="porto-rw">
                        <div><b>{x.jenis === 'awal' ? <><Ikon e="🏁" /> {'Modal awal'}</> : x.jenis === 'setor' ? <><Ikon e="➕" /> {'Suntik dana'}</> : <><Ikon e="➖" /> {'Tarik dana'}</>}</b><small>{tglId(x.tgl)}{x.catatan ? ` · ${x.catatan}` : ''}</small></div>
                        <b className={`mono ${x.jenis === 'tarik' ? 'down' : 'up'}`}>{x.jenis === 'tarik' ? '−' : '+'}{usd(x.jumlah)}</b>
                        {x.id !== 'otomatis' && <button className="icon-btn kecil" title="Hapus" onClick={async () => { if ((await konfirmasi('Hapus catatan dana ini?'))) apiPost('/api/kantor/portofolio/dana', { aksi: 'hapus', id: x.id }).then(() => selesai('Catatan dana dihapus.')).catch((e) => setMsg(String(e.message || e))); }}><Ikon e="🗑" /></button>}
                    </div>
                ))}
            </section>

            <SimulasiSinyal onBuka={onBuka} />

            {lembar?.jenis === 'jual' && <LembarJual p={lembar.p} onTutup={() => setLembar(null)} onSelesai={selesai} />}
            {lembar?.jenis === 'ubah' && <LembarUbah p={lembar.p} onTutup={() => setLembar(null)} onSelesai={selesai} />}
            {lembar?.jenis === 'dana' && <LembarDana awal={lembar.awal || 'setor'} onTutup={() => setLembar(null)} onSelesai={selesai} />}
        </div>
    );
}

function Rentang({ p }: { p: Pos }) {
    const h = p.harga ?? p.entry;
    const lo = Math.min(p.stop, h), hi = Math.max(p.target, h);
    const x = (v: number) => `${((v - lo) / Math.max(0.0001, hi - lo)) * 100}%`;
    return (
        <div className="tr-range">
            <div className="tr-range-bar">
                <div className="tr-zone bad" style={{ left: 0, width: x(p.entry) }} />
                <div className="tr-zone good" style={{ left: x(p.entry), right: 0 }} />
                <span className="tr-mark entry" style={{ left: x(p.entry) }} />
                {p.harga != null && <span className="tr-mark now" style={{ left: x(p.harga) }}><i>{usd(p.harga)}</i></span>}
            </div>
            <div className="tr-range-labels"><span><Ikon e="🔴" /> {usd(p.stop)}</span><span>beli {usd(p.entry)}</span><span><Ikon e="🟢" /> {usd(p.target)}</span></div>
        </div>
    );
}

function Grafik({ kurva, tampil, banding }: { kurva: Data['kurva']; tampil: 'nilai' | 'untung'; banding: boolean }) {
    const box = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState<Data['kurva'][0] | null>(null);
    useEffect(() => {
        if (!box.current || kurva.length < 1) return;
        const chart = createChart(box.current, {
            autoSize: true,
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8', fontSize: 11 },
            grid: { vertLines: { color: 'rgba(148,163,184,0.07)' }, horzLines: { color: 'rgba(148,163,184,0.07)' } },
            rightPriceScale: { borderColor: 'rgba(148,163,184,0.2)' }, timeScale: { borderColor: 'rgba(148,163,184,0.2)', rightOffset: 2 },
            crosshair: { mode: CrosshairMode.Normal }, handleScale: { mouseWheel: false, pinch: true }, handleScroll: { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: false }
        });
        const t = (s: string) => s as any;
        const naik = (kurva.at(-1)?.untung ?? 0) >= 0;
        const utama = chart.addAreaSeries({ lineColor: naik ? '#16a34a' : '#dc2626', topColor: naik ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)', bottomColor: 'rgba(0,0,0,0)', lineWidth: 2, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
        utama.setData(kurva.map((k) => ({ time: t(k.t), value: tampil === 'nilai' ? k.nilai : k.untung })));
        if (tampil === 'nilai') {
            const dana = chart.addLineSeries({ color: 'rgba(148,163,184,0.8)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
            dana.setData(kurva.map((k) => ({ time: t(k.t), value: k.dana })));
        } else utama.createPriceLine({ price: 0, color: 'rgba(148,163,184,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        if (banding) {
            const spy = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            spy.setData(kurva.filter((k) => k.spy != null).map((k) => ({ time: t(k.t), value: tampil === 'nilai' ? k.spy! : k.spy! - k.dana })));
        }
        chart.timeScale().fitContent();
        chart.subscribeCrosshairMove((p) => setHover(p.time ? kurva.find((k) => k.t === p.time) || null : null));
        return () => chart.remove();
    }, [kurva, tampil, banding]);
    const k = hover || kurva.at(-1);
    return (
        <div className="porto-grafik">
            {k && <div className="pg-info mono"><span>{tglId(k.t)}</span><span>nilai {usd(k.nilai)}</span><span className={kls(k.untung)}>untung {tanda(k.untung)}</span>{banding && k.spy != null && <span className="biru">S&P 500 {usd(k.spy)}</span>}</div>}
            {kurva.length < 2 && <p className="sb-note">Grafik muncul setelah ada data minimal 2 hari bursa.</p>}
            <div ref={box} className="porto-box" />
        </div>
    );
}

function Lembar({ judul, onTutup, children }: { judul: string; onTutup: () => void; children: React.ReactNode }) {
    return createPortal(
        <div className="k-sheet interactive" onClick={onTutup}>
            <div className="k-sheet-in pp" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={judul}>
                <div className="k-sheet-h"><b>{judul}</b><button onClick={onTutup} aria-label="Tutup">✕</button></div>
                {children}
            </div>
        </div>, document.body);
}
function LembarJual({ p, onTutup, onSelesai }: { p: Pos; onTutup: () => void; onSelesai: (m: string) => void }) {
    const [harga, setHarga] = useState(String(p.harga ?? p.entry));
    const [lembar, setLembar] = useState(String(p.shares));
    const [tgl, setTgl] = useState(hariIni());
    const [err, setErr] = useState('');
    const h = +harga, n = +lembar, pnl = (h - p.entry) * n;
    return (
        <Lembar judul={`💵 Jual ${p.symbol}`} onTutup={onTutup}>
            <p className="sb-note">Catat penjualan yang sudah Bapak lakukan di broker. Bisa jual sebagian.</p>
            <div className="pp-grid">
                <label>Harga jual (USD)<input inputMode="decimal" value={harga} onChange={(e) => setHarga(e.target.value)} /></label>
                <label>Lembar dijual <small>dari {p.shares}</small><input inputMode="decimal" value={lembar} onChange={(e) => setLembar(e.target.value)} /></label>
                <label>Tanggal jual<TanggalInput bisaKosong={false} value={tgl} max={hariIni()} onChange={(v) => setTgl(v)} /></label>
                <div className="pp-hasil"><small>Hasil</small><b className={`mono ${kls(pnl)}`}>{Number.isFinite(pnl) ? tanda(pnl) : '–'}</b><small className={kls(h - p.entry)}>{pc((h / p.entry - 1) * 100)}</small></div>
            </div>
            {err && <div className="error">{err}</div>}
            <button className="btn primary pp-simpan" disabled={!(h > 0 && n > 0 && n <= p.shares)} onClick={() => apiPost('/api/kantor/portofolio/tutup', { symbol: p.symbol, harga: h, shares: n, tgl }).then(() => onSelesai(`✓ Penjualan ${p.symbol} tercatat: ${tanda(pnl)}.`)).catch((e) => setErr(String(e.message || e)))}>Simpan penjualan</button>
            <button className="btn pp-hapus" onClick={async () => { if ((await konfirmasi(`Hapus posisi ${p.symbol} tanpa mencatat penjualan? (untuk salah input)`))) apiPost('/api/kantor/portofolio/hapus', { jenis: 'posisi', symbol: p.symbol, openedAt: p.openedAt }).then(() => onSelesai(`Posisi ${p.symbol} dihapus.`)).catch((e) => setErr(String(e.message || e))); }}><Ikon e="🗑" /> Hapus posisi (salah input)</button>
        </Lembar>
    );
}
function LembarUbah({ p, onTutup, onSelesai }: { p: Pos; onTutup: () => void; onSelesai: (m: string) => void }) {
    const [f, setF] = useState({ entry: String(p.entry), shares: String(p.shares), target: String(p.target), stop: String(p.stop), tgl: p.openedAt.slice(0, 10), catatan: p.catatan || '' });
    const [err, setErr] = useState('');
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
    return (
        <Lembar judul={`✏️ Ubah ${p.symbol}`} onTutup={onTutup}>
            <div className="pp-grid">
                <label>Target jual<input inputMode="decimal" value={f.target} onChange={set('target')} /></label>
                <label>Stop loss<input inputMode="decimal" value={f.stop} onChange={set('stop')} /></label>
                <label>Harga beli<input inputMode="decimal" value={f.entry} onChange={set('entry')} /></label>
                <label>Lembar<input inputMode="decimal" value={f.shares} onChange={set('shares')} /></label>
                <label>Tanggal beli<TanggalInput bisaKosong={false} value={f.tgl} max={hariIni()} onChange={(v) => (set('tgl'))({ target: { value: v } } as any)} /></label>
                <label>Catatan<input value={f.catatan} maxLength={300} onChange={set('catatan')} /></label>
            </div>
            {err && <div className="error">{err}</div>}
            <button className="btn primary pp-simpan" onClick={() => apiPost('/api/kantor/portofolio/ubah', { symbol: p.symbol, entry: +f.entry, shares: +f.shares, target: +f.target, stop: +f.stop, tgl: f.tgl, catatan: f.catatan }).then(() => onSelesai(`✓ ${p.symbol} diperbarui.`)).catch((e) => setErr(String(e.message || e)))}>Simpan</button>
        </Lembar>
    );
}
function LembarDana({ awal, onTutup, onSelesai }: { awal: Dana['jenis']; onTutup: () => void; onSelesai: (m: string) => void }) {
    const [jenis, setJenis] = useState<Dana['jenis']>(awal);
    const [jumlah, setJumlah] = useState('');
    const [tgl, setTgl] = useState(hariIni());
    const [catatan, setCatatan] = useState('');
    const [err, setErr] = useState('');
    return (
        <Lembar judul="💰 Catat dana" onTutup={onTutup}>
            <div className="sb-seg pp-seg">{(['awal', 'setor', 'tarik'] as const).map((k) => <button key={k} className={jenis === k ? 'on' : ''} onClick={() => setJenis(k)}>{k === 'awal' ? 'Modal awal' : k === 'setor' ? 'Suntik dana' : 'Tarik dana'}</button>)}</div>
            <p className="sb-note">{jenis === 'awal' ? 'Dana pertama yang Bapak siapkan untuk trading (mengganti modal awal sebelumnya).' : jenis === 'setor' ? 'Tambahan dana ke rekening broker — tidak dihitung sebagai untung.' : 'Dana yang Bapak tarik dari rekening broker — tidak dihitung sebagai rugi.'}</p>
            <div className="pp-grid">
                <label>Jumlah (USD)<input inputMode="decimal" placeholder="mis. 500" value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></label>
                <label>Tanggal<TanggalInput bisaKosong={false} value={tgl} max={hariIni()} onChange={(v) => setTgl(v)} /></label>
                <label className="pp-full">Catatan (opsional)<input value={catatan} maxLength={120} onChange={(e) => setCatatan(e.target.value)} /></label>
            </div>
            {err && <div className="error">{err}</div>}
            <button className="btn primary pp-simpan" disabled={!(+jumlah > 0)} onClick={() => apiPost('/api/kantor/portofolio/dana', { aksi: 'tambah', jenis, jumlah: +jumlah, tgl, catatan }).then(() => onSelesai('✓ Dana tercatat.')).catch((e) => setErr(String(e.message || e)))}>Simpan</button>
        </Lembar>
    );
}
