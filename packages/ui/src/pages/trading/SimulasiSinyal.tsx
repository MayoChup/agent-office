import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { useInterval } from '../../kantor/aktif';
import { usd } from './types';
import { KurvaAksi, type AksiKurva } from './KurvaAksi';
import { SimArsip } from './SimArsip';

interface Trx { s: string; masuk: string; hMasuk: number; keluar: string; hKeluar: number; pct: number; untung: number; label: string; skor: number; sebab: string }
interface Hasil {
    opsi: { H: number; guru: string | null; sinyal: string[]; bulan: number; modal: number; porsi: number; maksPosisi: number; keluarJual: boolean; biaya: number; saham: number };
    dari: string; sampai: string; akhir: number; pct: number; spyPct: number; maxDD: number; trade: number; menang: number; rataTrade: number; terbaik: Trx | null; terburuk: Trx | null;
    kurva: Array<{ t: string; nilai: number; spy: number }>; transaksi: Trx[]; gagal: string[]; catatan: string[]; komentar?: string; oleh?: string; at: number;
}
interface Data { jalan: boolean; progres: string; galat: string; hasil: Hasil | null; riwayat: Array<{ at: number; ringkas: string; pct: number; spyPct: number; trade: number }>; guru: Array<{ id: string; guru: string; nama: string; ringkas: string }>; watchlist: number; semesta: number }

const GAYA: Array<[number, string, string]> = [[1, 'Day trading', 'pegang 1 hari'], [5, 'Swing pendek', '±5 hari bursa'], [20, 'Swing', '±20 hari bursa'], [60, 'Posisi', '±60 hari bursa']];
const SINYAL = ['Beli kuat', 'Beli'];
const pc = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
const tgl = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Dua jenis simulasi: dari sinyal yang benar-benar dikirim kantor (arsip harian) dan backdate (sinyal teknikal dihitung ulang di masa lalu). */
export function SimulasiSinyal({ onBuka }: { onBuka?: (s: string) => void }) {
    const [jenis, setJenis] = useState<'arsip' | 'backdate'>(() => { try { return (localStorage.getItem('kantor:sim-jenis') as 'arsip' | 'backdate') || 'arsip'; } catch { return 'arsip'; } });
    const ganti = (j: 'arsip' | 'backdate') => { setJenis(j); try { localStorage.setItem('kantor:sim-jenis', j); } catch { /* */ } };
    return (
        <section className="sb-card ss">
            <div className="sd-h"><h3>🧪 Simulasi sinyal</h3>
                <div className="ss-tab" role="tablist">
                    <button role="tab" aria-selected={jenis === 'arsip'} className={jenis === 'arsip' ? 'on' : ''} onClick={() => ganti('arsip')}>Dari sinyal tercatat</button>
                    <button role="tab" aria-selected={jenis === 'backdate'} className={jenis === 'backdate' ? 'on' : ''} onClick={() => ganti('backdate')}>Backdate</button>
                </div>
            </div>
            <p className="sb-note">{jenis === 'arsip' ? 'Memutar ulang sinyal yang benar-benar dikirim kantor setiap hari (teknikal + fundamental + berita + whales). Arsipnya disimpan permanen sejak fitur ini aktif, jadi makin lama makin panjang. Alokasi modal diatur Bima.' : 'Sinyal teknikal dihitung ulang di masa lalu (berita & fundamental lama tidak tersedia). Berguna untuk menguji periode panjang sebelum arsip sinyal terkumpul.'}</p>
            {jenis === 'arsip' ? <SimArsip onBuka={onBuka} /> : <SimBackdate onBuka={onBuka} />}
        </section>
    );
}

/** Simulasi backdate: kalau dulu sinyal AI dijalankan dengan aturan ini, hasilnya berapa? Dikerjakan Dito (Kepala Trading). */
function SimBackdate({ onBuka }: { onBuka?: (s: string) => void }) {
    const d = useApi<Data>('/api/kantor/simulasi-sinyal', 0);
    useInterval(() => d.reload(), d.data?.jalan ? 3000 : null);
    const [f, setF] = useState({ H: 20, guru: '', sinyal: ['Beli kuat'], bulan: 3, semesta: 'watchlist', modal: 10000, porsi: 10, maksPosisi: 8, keluarJual: true });
    const [msg, setMsg] = useState('');
    const [semuaTrx, setSemuaTrx] = useState(false);
    const set = (x: Partial<typeof f>) => setF({ ...f, ...x });
    const jalan = () => apiPost('/api/kantor/simulasi-sinyal', { ...f, guru: f.guru || null, porsi: f.porsi / 100 }).then(() => { setMsg(''); d.reload(); }).catch((e) => setMsg(String(e.message || e)));
    const h = d.data?.hasil;
    return (
        <div>
            <div className="ss-form">
                <fieldset><legend>Gaya posisi</legend><div className="ss-pil">{GAYA.map(([k, n, ket]) => <button key={k} className={f.H === k ? 'on' : ''} onClick={() => set({ H: k })}><b>{n}</b><small>{ket}</small></button>)}</div></fieldset>
                <fieldset><legend>Guru trader</legend>
                    <select value={f.guru} onChange={(e) => set({ guru: e.target.value })}>
                        <option value="">Tanpa guru — sinyal AI saja</option>
                        {d.data?.guru.map((g) => <option key={g.id} value={g.id}>{g.guru} · {g.nama}</option>)}
                    </select>
                    {f.guru && <small>{d.data?.guru.find((g) => g.id === f.guru)?.ringkas} Saham hanya dibeli kalau lolos ≥ 75% kriteria guru.</small>}
                </fieldset>
                <fieldset><legend>Sinyal yang dieksekusi</legend><div className="ss-pil">{SINYAL.map((s) => <label key={s} className={f.sinyal.includes(s) ? 'on' : ''}><input type="checkbox" checked={f.sinyal.includes(s)} onChange={() => set({ sinyal: f.sinyal.includes(s) ? f.sinyal.filter((x) => x !== s) : [...f.sinyal, s] })} />{s}</label>)}
                    <label className={f.keluarJual ? 'on' : ''}><input type="checkbox" checked={f.keluarJual} onChange={(e) => set({ keluarJual: e.target.checked })} />Jual lebih cepat saat sinyal Jual</label></div></fieldset>
                <fieldset><legend>Periode ke belakang</legend><div className="ss-pil">{[1, 2, 3, 6, 12].map((b) => <button key={b} className={f.bulan === b ? 'on' : ''} onClick={() => set({ bulan: b })}>{b} bulan</button>)}</div></fieldset>
                <fieldset><legend>Saham</legend><div className="ss-pil">
                    <button className={f.semesta === 'watchlist' ? 'on' : ''} onClick={() => set({ semesta: 'watchlist' })}>Watchlist & posisi <small>{d.data?.watchlist ?? '–'} saham</small></button>
                    <button className={f.semesta === 'besar' ? 'on' : ''} onClick={() => set({ semesta: 'besar' })}>50 saham terbesar <small>lebih lama</small></button>
                </div></fieldset>
                <fieldset><legend>Modal & ukuran posisi</legend><div className="ss-angka">
                    <label>Modal ($)<input type="number" min={100} step={100} value={f.modal} onChange={(e) => set({ modal: +e.target.value })} /></label>
                    <label>Per posisi (%)<input type="number" min={2} max={100} value={f.porsi} onChange={(e) => set({ porsi: +e.target.value })} /></label>
                    <label>Maks posisi<input type="number" min={1} max={20} value={f.maksPosisi} onChange={(e) => set({ maksPosisi: +e.target.value })} /></label>
                </div></fieldset>
                <div className="ss-jalan">
                    <button className="btn primary" disabled={d.data?.jalan || !f.sinyal.length} onClick={jalan}>{d.data?.jalan ? 'Dito sedang menghitung…' : '▶ Jalankan simulasi'}</button>
                    {d.data?.jalan && <small className="mono">{d.data.progres}</small>}
                </div>
            </div>
            {msg && <div className="error">{msg}</div>}
            {d.data?.galat && <div className="error">Simulasi terakhir gagal: {d.data.galat}</div>}
            {h && (
                <div className="ss-hasil">
                    <div className="ss-kpi">
                        <div><small>Hasil</small><b className={`mono ${h.pct >= 0 ? 'up' : 'down'}`}>{pc(h.pct)}</b><small>{usd(h.opsi.modal)} → {usd(h.akhir)}</small></div>
                        <div><small>S&P 500 (SPY)</small><b className={`mono ${h.spyPct >= 0 ? 'up' : 'down'}`}>{pc(h.spyPct)}</b><small>{h.pct >= h.spyPct ? `menang ${(h.pct - h.spyPct).toFixed(2)} poin` : `kalah ${(h.spyPct - h.pct).toFixed(2)} poin`}</small></div>
                        <div><small>Turun terdalam</small><b className="mono down">{h.maxDD.toFixed(2)}%</b><small>dari puncak</small></div>
                        <div><small>Transaksi</small><b className="mono">{h.trade}</b><small>{h.menang}% untung · rata {pc(h.rataTrade)}</small></div>
                    </div>
                    <KurvaAksi kurva={h.kurva} modal={h.opsi.modal} aksi={h.transaksi.flatMap((t): AksiKurva[] => [{ t: t.masuk, jenis: 'beli', s: t.s, harga: t.hMasuk, nilai: 0 }, { t: t.keluar, jenis: 'jual', s: t.s, harga: t.hKeluar, nilai: 0, pct: t.pct, untung: t.untung, sebab: t.sebab }])} />
                    <small className="ss-meta">{tgl(h.dari)} – {tgl(h.sampai)} · {GAYA.find((g) => g[0] === h.opsi.H)?.[1]} · {h.opsi.guru ? d.data?.guru.find((g) => g.id === h.opsi.guru)?.guru : 'tanpa guru'} · {h.opsi.sinyal.join(' + ')} · {h.opsi.saham} saham{h.gagal.length ? ` · ${h.gagal.length} saham tanpa data` : ''}</small>
                    {h.komentar && <div className="ss-komentar"><b>{h.oleh || 'Dito'} — Kepala Trading</b><p>{h.komentar}</p></div>}
                    {!!h.transaksi.length && (
                        <div className="ss-trx">
                            <table className="um-t"><thead><tr><th>Saham</th><th>Beli</th><th>Jual</th><th>Hasil</th><th>Sinyal</th></tr></thead>
                                <tbody>{(semuaTrx ? h.transaksi : h.transaksi.slice(-12)).map((t, i) => (
                                    <tr key={i}><td><button className="linkish mono" onClick={() => onBuka?.(t.s)}>{t.s}</button></td><td className="mono">{tgl(t.masuk)}<small> {usd(t.hMasuk)}</small></td><td className="mono">{tgl(t.keluar)}<small> {usd(t.hKeluar)} · {t.sebab}</small></td><td className={`mono ${t.pct >= 0 ? 'up' : 'down'}`}>{pc(t.pct)}</td><td>{t.label}</td></tr>
                                ))}</tbody></table>
                            {h.transaksi.length > 12 && <button className="btn small" onClick={() => setSemuaTrx(!semuaTrx)}>{semuaTrx ? 'Ringkas' : `Lihat semua ${h.transaksi.length} transaksi`}</button>}
                        </div>
                    )}
                    <ul className="ss-catatan">{h.catatan.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
            )}
            {!!d.data?.riwayat.length && (
                <details className="ss-riwayat"><summary>Simulasi sebelumnya</summary>
                    {d.data.riwayat.map((r, i) => <div key={i}><span>{r.ringkas}</span><b className={`mono ${r.pct >= 0 ? 'up' : 'down'}`}>{pc(r.pct)}</b><small className="mono">SPY {pc(r.spyPct)} · {r.trade} trx</small></div>)}
                </details>
            )}
        </div>
    );
}
