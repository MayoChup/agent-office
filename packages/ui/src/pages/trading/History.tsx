import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../kantor/connection';
import { usd } from './types';
import { Info } from './InfoI';

type Status = 'target' | 'stop' | 'berjalan' | 'durasi';
interface Strategi { id: string; s: string; H: number; tgl: string; label: string; skor: number; masuk: number; target: number | null; stop: number | null; status: Status; tglSelesai: string | null; keluar: number; pct: number; sekarang: number | null; pctSekarang: number | null; hari: number; tertinggi: number; terendah: number; sumberHarga: 'ohlc' | 'tutup'; targetDihitung?: boolean }
interface Ringkas { total: number; selesai: number; target: number; stop: number; durasi: number; berjalan: number; menang: number | null; pctTarget: number | null; rata: number | null; rataSelesai: number | null; rataUntung: number | null; rataRugi: number | null; modalPer: number; gain: number; loss: number; bersih: number; bersihPct: number | null; profitFactor: number | null; floating: number; durasiPct: number | null }
interface Data { at: number; jalan: boolean; arsip: { hari: number; dari: string | null; sampai: string | null }; ringkas: Ringkas; total: number; hal: number; halaman: number; item: Strategi[] }

const GAYA: Array<[number, string]> = [[1, 'Day trading'], [5, 'Swing pendek'], [20, 'Swing'], [60, 'Posisi']];
const namaProfil = (k: string) => `Target ${({ K: 'Konservatif', M: 'Moderat', A: 'Agresif' } as Record<string, string>)[k] || 'Moderat'}`;
const namaGaya = (H: number) => GAYA.find((g) => g[0] === H)?.[1] || `${H} hari`;
const STATUS: Record<Status, { t: string; k: string }> = { target: { t: 'Kena target', k: 'hs-target' }, stop: { t: 'Kena stop', k: 'hs-stop' }, berjalan: { t: 'Berjalan', k: 'hs-jalan' }, durasi: { t: 'Lewat durasi', k: 'hs-durasi' } };
const tgl = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pc = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`);
const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const mundur = (n: number) => new Date(Date.now() + 7 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
const PROFIL: Array<[string, string]> = [['K', 'Konservatif'], ['M', 'Moderat'], ['A', 'Agresif']];
const PROFIL_INFO = 'Tiap sinyal punya 3 pilihan target. Konservatif = target dekat, paling sering tersentuh tapi untungnya kecil. Moderat = tengah-tengah. Agresif = target jauh, untung besar kalau tercapai tapi lebih jarang. Stop loss sama untuk ketiganya. Pilih profil untuk melihat hasil kalau Bapak selalu memakai target itu.';
const ATURAN = 'Strategi lahir saat sinyal sebuah saham jadi Beli kuat/Beli untuk gaya itu. Masuk = harga penutupan hari sinyal. Tiap hari bursa sesudahnya dicek harga tertinggi & terendah: menyentuh target → "Kena target" (dihitung untung walau sesudahnya turun), menyentuh stop → "Kena stop" (kalau keduanya di hari yang sama, dianggap stop). Belum menyentuh apa-apa → "Berjalan" (floating, pakai harga sekarang). Sudah melewati masa pegang gaya itu tanpa menyentuh target/stop → "Lewat durasi": hasil dikunci di harga penutupan hari terakhir masa pegang.';

/** Tab History: semua strategi beli yang pernah dikeluarkan kantor beserta hasilnya. */
export function HistorySinyal({ onOpen }: { onOpen: (s: string) => void }) {
    const [f, setF] = useState({ profil: 'M', H: '', status: '', dari: '', sampai: '', urut: 'terbaru', q: '' });
    const [hal, setHal] = useState(1);
    const [lompat, setLompat] = useState('');
    const [d, setD] = useState<Data | null>(null);
    const [err, setErr] = useState('');
    const [segar, setSegar] = useState(0);
    useEffect(() => {
        const p = new URLSearchParams({ hal: String(hal), n: '20' });
        for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
        apiGet<Data>(`/api/kantor/history-sinyal?${p}`).then((r) => { setD(r); setErr(''); }).catch((e) => setErr(String(e.message || e)));
    }, [f, hal, segar]);
    useEffect(() => { if (!d?.jalan) return; const t = setTimeout(() => setSegar((x) => x + 1), 8000); return () => clearTimeout(t); }, [d]);
    const set = (x: Partial<typeof f>) => { setF({ ...f, ...x }); setHal(1); };
    const preset = (k: string) => { const v = k === 'hari' ? [hariIni(), hariIni()] : k === 'kemarin' ? [mundur(1), mundur(1)] : k === '7' ? [mundur(6), ''] : k === '30' ? [mundur(29), ''] : ['', '']; set({ dari: v[0], sampai: v[1] }); };
    const nomor = (() => { if (!d) return []; const n = d.halaman, c = d.hal; const s = new Set([1, n, c - 1, c, c + 1].filter((x) => x >= 1 && x <= n)); const arr = [...s].sort((a, b) => a - b); const out: Array<number | '…'> = []; arr.forEach((x, i) => { if (i && x - arr[i - 1] > 1) out.push('…'); out.push(x); }); return out; })();
    const adaFilter = !!(f.H || f.status || f.dari || f.sampai || f.q);
    const r = d?.ringkas;
    const periksa = () => apiPost('/api/kantor/history-sinyal/periksa', {}).then(() => setSegar((x) => x + 1)).catch((e) => setErr(String(e.message || e)));
    return (
        <section className="sb-card hs">
            <div className="hs-kepala">
                <div>
                    <h3>History strategi sinyal <Info teks={ATURAN} /></h3>
                    <small>{d ? `Dari arsip ${d.arsip.hari} hari bursa${d.arsip.dari ? ` (${tgl(d.arsip.dari)} – ${tgl(d.arsip.sampai!)})` : ''} · diperiksa Dito${d.at ? ` ${new Date(d.at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Memuat…'}</small>
                </div>
                <button className="btn small" onClick={periksa} disabled={d?.jalan}>{d?.jalan ? 'Dito sedang memeriksa…' : 'Periksa ulang harga'}</button>
            </div>
            <div className="dr-filter">
                <div className="hs-profil" role="group" aria-label="Profil target">
                    <span>Target <Info teks={PROFIL_INFO} /></span>
                    {PROFIL.map(([k, n]) => <button key={k} className={f.profil === k ? 'on' : ''} aria-pressed={f.profil === k} onClick={() => set({ profil: k })}>{n}</button>)}
                </div>
                <div className="dr-cepat">{[['', 'Semua gaya'], ...GAYA.map(([h, n]) => [String(h), n])].map(([k, l]) => <button key={k} className={f.H === k ? 'on' : ''} onClick={() => set({ H: k })}>{l}</button>)}</div>
                <div className="dr-cepat">{[['semua', 'Semua tanggal'], ['hari', 'Hari ini'], ['kemarin', 'Kemarin'], ['7', '7 hari'], ['30', '30 hari']].map(([k, l]) => {
                    const on = k === 'semua' ? !f.dari && !f.sampai : k === 'hari' ? f.dari === hariIni() && f.sampai === hariIni() : k === 'kemarin' ? f.dari === mundur(1) && f.sampai === mundur(1) : k === '7' ? f.dari === mundur(6) && !f.sampai : f.dari === mundur(29) && !f.sampai;
                    return <button key={k} className={on ? 'on' : ''} onClick={() => preset(k)}>{l}</button>;
                })}</div>
                <label>Dari<input type="date" value={f.dari} max={hariIni()} onChange={(e) => set({ dari: e.target.value })} /></label>
                <label>Sampai<input type="date" value={f.sampai} min={f.dari || undefined} max={hariIni()} onChange={(e) => set({ sampai: e.target.value })} /></label>
                <label>Status<select value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">Semua status</option>{(Object.keys(STATUS) as Status[]).map((k) => <option key={k} value={k}>{STATUS[k].t}</option>)}</select></label>
                <label>Urutkan<select value={f.urut} onChange={(e) => set({ urut: e.target.value })}><option value="terbaru">Terbaru</option><option value="cuan">Cuan terbesar</option><option value="rugi">Rugi terbesar</option></select></label>
                <label className="dr-cari">Saham<input type="search" placeholder="mis. NVDA" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
                {adaFilter && <button className="btn small" onClick={() => { setF({ profil: f.profil, H: '', status: '', dari: '', sampai: '', urut: f.urut, q: '' }); setHal(1); }}>Hapus filter</button>}
            </div>
            {r && r.total > 0 && (
                <div className="hs-rekap" aria-live="polite">
                    <div className="hs-rekap-h">
                        <b>Ringkasan {adaFilter ? 'sesuai filter' : 'semua'}</b>
                        <small>{namaProfil(f.profil)}{f.H ? ` · ${namaGaya(+f.H)}` : ''}{f.dari || f.sampai ? ` · ${f.dari ? tgl(f.dari) : 'awal'} – ${f.sampai ? tgl(f.sampai) : 'sekarang'}` : ''}{f.q ? ` · ${f.q.toUpperCase()}` : ''}</small>
                        <Info teks={`Kalau Bapak disiplin: tiap strategi dimodali sama ${usd(r.modalPer, 0)}, jual saat kena target/stop, dan yang lewat durasi ditutup di hari terakhir masa pegang. Strategi yang masih berjalan belum dihitung ke hasil bersih (ditampilkan terpisah sebagai floating).`} />
                    </div>
                    <div className="hs-rekap-utama">
                        <div className="hs-bersih"><small>Hasil bersih ({r.selesai} selesai)</small><b className={r.bersih > 0 ? 'up' : r.bersih < 0 ? 'down' : ''}>{r.bersih >= 0 ? '+' : '−'}{usd(Math.abs(r.bersih))}</b><em className={(r.bersihPct ?? 0) >= 0 ? 'up' : 'down'}>{pc(r.bersihPct)} dari modal {usd(r.selesai * r.modalPer, 0)}</em></div>
                        <div><small>Total gain</small><b className="up">+{usd(r.gain)}</b><em>rata-rata {pc(r.rataUntung)}</em></div>
                        <div><small>Total loss</small><b className="down">−{usd(Math.abs(r.loss))}</b><em>rata-rata {pc(r.rataRugi)}</em></div>
                        <div><small>Kena target</small><b>{r.pctTarget == null ? '–' : `${r.pctTarget}%`}</b><em>{r.target} dari {r.selesai} selesai</em></div>
                        <div><small>Menang</small><b>{r.menang == null ? '–' : `${r.menang}%`}</b><em>profit factor {r.profitFactor ?? '–'}</em></div>
                    </div>
                    <div className="hs-ringkas">
                        <span><b>{r.total}</b> strategi</span>
                        <span className="hs-target"><b>{r.target}</b> kena target</span>
                        <span className="hs-stop"><b>{r.stop}</b> kena stop</span>
                        <span className="hs-durasi"><b>{r.durasi}</b> lewat durasi{r.durasiPct != null ? <> (rata-rata <b className={r.durasiPct >= 0 ? 'up' : 'down'}>{pc(r.durasiPct)}</b>)</> : ''}</span>
                        <span className="hs-jalan"><b>{r.berjalan}</b> berjalan{r.berjalan ? <> · floating <b className={r.floating >= 0 ? 'up' : 'down'}>{r.floating >= 0 ? '+' : '−'}{usd(Math.abs(r.floating))}</b></> : ''}</span>
                    </div>
                </div>
            )}
            {err && <div className="error">{err}</div>}
            {d && !d.item.length && <div className="fin-empty">{adaFilter ? 'Tidak ada strategi yang cocok dengan filter ini.' : d.arsip.hari ? (f.profil !== 'M' ? 'Belum ada strategi untuk target ini. Target Konservatif & Agresif tercatat mulai sesi bursa berikutnya; untuk arsip lama, target dihitung ulang dari sejarah harga setelah Dito memeriksa harga (tombol "Periksa ulang harga").' : 'Belum ada sinyal Beli/Beli kuat di arsip.') : 'Arsip sinyal masih kosong. Dito mengarsipkan sinyal tiap sesi bursa — History terisi otomatis.'}</div>}
            {d && d.item.length > 0 && (
                <div className="hs-list" role="table" aria-label="Daftar strategi sinyal">
                    <div className="hs-row hs-head" role="row"><span>Dibuat</span><span>Saham</span><span>Masuk → {f.status === 'berjalan' ? 'sekarang' : 'hasil'}</span><span>Target / stop</span><span className="hs-kanan">Gain/loss</span><span>Status</span></div>
                    {d.item.map((x) => {
                        const selesai = x.status !== 'berjalan';
                        return (
                            <div key={x.id} className="hs-row" role="row" onClick={() => onOpen(x.s)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(x.s); }}>
                                <span className="hs-tgl">{tgl(x.tgl)}</span>
                                <span className="hs-saham"><b>{x.s}</b><small>{namaGaya(x.H)} · {x.label}</small></span>
                                <span className="hs-harga">{usd(x.masuk)} → {usd(x.keluar)}{selesai && x.tglSelesai && <small>{x.status === 'durasi' ? 'tutup hari ke-' + x.H : 'pada'} {tgl(x.tglSelesai)}</small>}</span>
                                <span className="hs-ts"><em className="up" title={x.targetDihitung ? 'Target profil ini dihitung ulang dari sejarah harga sampai hari sinyal (arsip lama hanya mencatat target Moderat).' : undefined}>{usd(x.target)}{x.targetDihitung ? '*' : ''}</em> / <em className="down">{usd(x.stop)}</em></span>
                                <span className={`hs-pct hs-kanan ${x.pct > 0 ? 'up' : x.pct < 0 ? 'down' : ''}`}>{pc(x.pct)}{selesai && x.pctSekarang != null && <small title="Kalau masih dipegang sampai sekarang">sekarang {pc(x.pctSekarang)}</small>}</span>
                                <span className="hs-st"><i className={STATUS[x.status].k}>{STATUS[x.status].t}</i><small>{x.status === 'berjalan' ? `hari ${x.hari}/${x.H}` : `${x.hari} hari`}</small></span>
                            </div>
                        );
                    })}
                </div>
            )}
            {d && d.halaman > 1 && (
                <nav className="dr-hal" aria-label="Halaman">
                    <button disabled={d.hal <= 1} onClick={() => setHal(d.hal - 1)}>‹ Sebelumnya</button>
                    {nomor.map((x, i) => x === '…' ? <span key={`e${i}`}>…</span> : <button key={x} className={x === d.hal ? 'on' : ''} aria-current={x === d.hal ? 'page' : undefined} onClick={() => setHal(x)}>{x}</button>)}
                    <button disabled={d.hal >= d.halaman} onClick={() => setHal(d.hal + 1)}>Berikutnya ›</button>
                    <form onSubmit={(e) => { e.preventDefault(); const v = Math.round(+lompat); if (v >= 1 && v <= d.halaman) { setHal(v); setLompat(''); } }}>
                        <label>Ke halaman<input type="number" min={1} max={d.halaman} value={lompat} onChange={(e) => setLompat(e.target.value)} placeholder={`1–${d.halaman}`} /></label>
                        <button type="submit">Buka</button>
                    </form>
                </nav>
            )}
            <p className="hs-catatan">{d?.item.some((x) => x.targetDihitung) ? '* target dihitung ulang dari sejarah harga sampai hari sinyal (arsip lama hanya mencatat target Moderat). ' : ''}Hanya mencatat hasil sinyal, bukan transaksi sungguhan. Bukan saran keuangan.</p>
        </section>
    );
}
