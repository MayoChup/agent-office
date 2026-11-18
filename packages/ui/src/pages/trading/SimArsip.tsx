import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { useInterval } from '../../kantor/aktif';
import { usd } from './types';
import { KurvaAksi, type AksiKurva } from './KurvaAksi';

interface Hasil {
    opsi: { H: number; guru: string | null; sinyal: string[]; dari: string | null; modal: number; porsi: number; beliPerHari: number; maksPosisi: number; keluar: { target: boolean; stop: boolean; jual: boolean } };
    dari: string; sampai: string; hari: number; akhir: number; pct: number; spyPct: number | null; maxDD: number; trade: number; menang: number; rataTrade: number; untungTotal: number;
    kurva: Array<{ t: string; nilai: number; kas: number; spy: number | null }>; aksi: AksiKurva[]; terbuka: Array<{ s: string; masuk: string; hMasuk: number; harga: number; pct: number }>; catatan: string[];
    komentar?: string; oleh?: string; atur?: string; at: number;
}
interface Data { jalan: boolean; galat: string; hasil: Hasil | null; arsip: { hari: number; dari: string | null; sampai: string | null } }
const GAYA: Array<[number, string, string]> = [[1, 'Day trading', 'pegang 1 hari'], [5, 'Swing pendek', '±5 hari bursa'], [20, 'Swing', '±20 hari bursa'], [60, 'Posisi', '±60 hari bursa']];
const pc = (n: number | null) => (n == null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`);
const tgl = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Simulasi dari sinyal yang benar-benar dikirim kantor (arsip harian). Alokasi modal diatur Bima; untung diputar lagi (bola salju). */
export function SimArsip({ onBuka }: { onBuka?: (s: string) => void }) {
    const d = useApi<Data>('/api/kantor/simulasi-arsip', 0);
    const guru = useApi<{ guru: Array<{ id: string; guru: string; nama: string }> }>('/api/kantor/simulasi-sinyal', 0);
    useInterval(() => d.reload(), d.data?.jalan ? 2500 : null);
    const [f, setF] = useState({ H: 20, guru: '', sinyal: ['Beli kuat', 'Beli'], modal: 10000, olehBima: true, beliPerHari: 3, porsi: 10, maksPosisi: 8, keluarTarget: true, keluarStop: true, keluarJual: true });
    const [msg, setMsg] = useState('');
    const [semua, setSemua] = useState(false);
    const set = (x: Partial<typeof f>) => setF({ ...f, ...x });
    const jalan = () => apiPost('/api/kantor/simulasi-arsip', { ...f, guru: f.guru || null }).then(() => { setMsg(''); d.reload(); }).catch((e) => setMsg(String(e.message || e)));
    const a = d.data?.arsip, h = d.data?.hasil;
    const jual = (h?.aksi || []).filter((x) => x.jenis === 'jual');
    return (
        <div>
            <div className="ss-arsip">{a?.hari ? <>📚 Arsip sinyal: <b>{a.hari} hari bursa</b> ({tgl(a.dari!)} – {tgl(a.sampai!)}). Bertambah otomatis setiap sesi.</> : <>📚 Arsip sinyal mulai dikumpulkan sejak hari ini — simulasi bisa dijalankan setelah ada minimal 2 hari bursa tercatat.</>}</div>
            <div className="ss-form">
                <fieldset><legend>Gaya posisi</legend><div className="ss-pil">{GAYA.map(([k, n, ket]) => <button key={k} className={f.H === k ? 'on' : ''} onClick={() => set({ H: k })}><b>{n}</b><small>{ket}</small></button>)}</div></fieldset>
                <fieldset><legend>Guru trader</legend>
                    <select value={f.guru} onChange={(e) => set({ guru: e.target.value })}>
                        <option value="">Tanpa guru — semua sinyal kantor</option>
                        {guru.data?.guru.map((g) => <option key={g.id} value={g.id}>{g.guru} · {g.nama}</option>)}
                    </select>
                </fieldset>
                <fieldset><legend>Sinyal yang dieksekusi</legend><div className="ss-pil">{['Beli kuat', 'Beli'].map((s) => <label key={s} className={f.sinyal.includes(s) ? 'on' : ''}><input type="checkbox" checked={f.sinyal.includes(s)} onChange={() => set({ sinyal: f.sinyal.includes(s) ? f.sinyal.filter((x) => x !== s) : [...f.sinyal, s] })} />{s}</label>)}</div></fieldset>
                <fieldset><legend>Kapan dijual</legend><div className="ss-pil">
                    <label className={f.keluarTarget ? 'on' : ''}><input type="checkbox" checked={f.keluarTarget} onChange={(e) => set({ keluarTarget: e.target.checked })} />Kena target</label>
                    <label className={f.keluarStop ? 'on' : ''}><input type="checkbox" checked={f.keluarStop} onChange={(e) => set({ keluarStop: e.target.checked })} />Kena stop</label>
                    <label className={f.keluarJual ? 'on' : ''}><input type="checkbox" checked={f.keluarJual} onChange={(e) => set({ keluarJual: e.target.checked })} />Sinyal berubah Jual</label>
                </div><small>Kalau tidak ada yang terjadi, dijual saat masa pegang gaya posisi habis.</small></fieldset>
                <fieldset><legend>Modal & alokasi</legend>
                    <label className="ss-cek"><input type="checkbox" checked={f.olehBima} onChange={(e) => set({ olehBima: e.target.checked })} />Biar Bima (Pengawas Anggaran) yang mengatur alokasi</label>
                    <div className="ss-angka">
                        <label>Modal ($)<input type="number" min={100} step={100} value={f.modal} onChange={(e) => set({ modal: +e.target.value })} /></label>
                        <label>Beli/hari<input type="number" min={1} max={10} value={f.beliPerHari} disabled={f.olehBima} onChange={(e) => set({ beliPerHari: +e.target.value })} /></label>
                        <label>Per posisi (%)<input type="number" min={2} max={50} value={f.porsi} disabled={f.olehBima} onChange={(e) => set({ porsi: +e.target.value })} /></label>
                    </div>
                </fieldset>
                <div className="ss-jalan">
                    <button className="btn primary" disabled={d.data?.jalan || !f.sinyal.length || (a?.hari || 0) < 2} onClick={jalan}>{d.data?.jalan ? 'Bima sedang mengatur & memutar ulang…' : '▶ Jalankan simulasi'}</button>
                </div>
            </div>
            {msg && <div className="error">{msg}</div>}
            {d.data?.galat && <div className="error">Simulasi terakhir gagal: {d.data.galat}</div>}
            {h && (
                <div className="ss-hasil">
                    <div className="ss-kpi">
                        <div><small>Modal → sekarang</small><b className={`mono ${h.pct >= 0 ? 'up' : 'down'}`}>{usd(h.akhir)}</b><small>dari {usd(h.opsi.modal)} · {pc(h.pct)}</small></div>
                        <div><small>S&P 500 (SPY)</small><b className={`mono ${(h.spyPct ?? 0) >= 0 ? 'up' : 'down'}`}>{pc(h.spyPct)}</b><small>{h.spyPct == null ? '' : h.pct >= h.spyPct ? `menang ${(h.pct - h.spyPct).toFixed(2)} poin` : `kalah ${(h.spyPct - h.pct).toFixed(2)} poin`}</small></div>
                        <div><small>Untung terealisasi</small><b className={`mono ${h.untungTotal >= 0 ? 'up' : 'down'}`}>{h.untungTotal >= 0 ? '+' : '−'}{usd(Math.abs(h.untungTotal))}</b><small>{h.trade} jual · {h.menang}% untung</small></div>
                        <div><small>Turun terdalam</small><b className="mono down">{h.maxDD.toFixed(2)}%</b><small>{h.terbuka.length} posisi masih terbuka</small></div>
                    </div>
                    <KurvaAksi kurva={h.kurva} aksi={h.aksi} modal={h.opsi.modal} />
                    <small className="ss-meta">{tgl(h.dari)} – {tgl(h.sampai)} · {h.hari} hari bursa · {GAYA.find((g) => g[0] === h.opsi.H)?.[1]} · {h.opsi.sinyal.join(' + ')}</small>
                    {h.atur && <div className="ss-atur">💼 {h.atur}</div>}
                    {h.komentar && <div className="ss-komentar"><b>{h.oleh || 'Bima'} — Pengawas Anggaran</b><p>{h.komentar}</p></div>}
                    {!!jual.length && (
                        <div className="ss-trx">
                            <table className="um-t"><thead><tr><th>Tanggal jual</th><th>Saham</th><th>Harga jual</th><th>Hasil</th><th>Uang</th><th>Sebab</th></tr></thead>
                                <tbody>{(semua ? jual : jual.slice(-12)).map((t, i) => (
                                    <tr key={i}><td className="mono">{tgl(t.t)}</td><td><button className="linkish mono" onClick={() => onBuka?.(t.s)}>{t.s}</button></td><td className="mono">{usd(t.harga)}</td><td className={`mono ${(t.pct || 0) >= 0 ? 'up' : 'down'}`}>{pc(t.pct || 0)}</td><td className={`mono ${(t.untung || 0) >= 0 ? 'up' : 'down'}`}>{(t.untung || 0) >= 0 ? '+' : '−'}{usd(Math.abs(t.untung || 0))}</td><td>{t.sebab}</td></tr>
                                ))}</tbody></table>
                            {jual.length > 12 && <button className="btn small" onClick={() => setSemua(!semua)}>{semua ? 'Ringkas' : `Lihat semua ${jual.length} penjualan`}</button>}
                        </div>
                    )}
                    {!!h.terbuka.length && <div className="ss-terbuka">Masih dipegang: {h.terbuka.map((t) => <span key={t.s} className={t.pct >= 0 ? 'up' : 'down'}>{t.s} {pc(t.pct)}</span>)}</div>}
                    <ul className="ss-catatan">{h.catatan.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
            )}
        </div>
    );
}
