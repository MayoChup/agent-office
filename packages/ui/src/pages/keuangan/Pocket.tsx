import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { useKembali } from '../../kantor/kembali';
import { Ikon } from '../../components/Ikon';
import { konfirmasi } from '../../components/Konfirmasi';
import { TanggalInput } from '../../components/Tanggal';
import { Tx, rp, rpRingkas, saldoKini, hariIni, tglPendek, samaAkun } from './util';

interface Gerak { id: string; at: number; n: number; ket: string }
export interface Pocket { id: string; nama: string; target: number; tenggat: string; warna: string; ikon: string; sumber: 'manual' | 'akun'; akun: string; dibuat: number; riwayat: Gerak[] }
type Saldo = Record<string, { nilai: number; tanggal: string; sumber: string }>;

const WARNA = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ec4899', '#eab308', '#14b8a6', '#6366f1'];
const IKON = ['target', 'house', 'shield', 'plane', 'car', 'graduation-cap', 'heart', 'gift', 'laptop', 'piggy-bank', 'star', 'wallet'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Saldo pocket: manual = jumlah riwayat; tertaut = saldo rekening sekarang (patokan mutasi + transaksi sesudahnya). */
export function saldoPocket(p: Pocket, saldo: Saldo, tx: Tx[]): number | null {
    if (p.sumber === 'manual') return p.riwayat.reduce((a, g) => a + g.n, 0);
    const k = Object.keys(saldo).find((a) => samaAkun(a, p.akun));
    return k ? saldoKini(k, saldo[k], tx) : null;
}
function hitung(p: Pocket, nilai: number | null) {
    const ada = nilai ?? 0;
    const pct = Math.max(0, Math.min(100, Math.round((ada / p.target) * 100)));
    const kurang = Math.max(0, p.target - ada);
    let perBulan = 0, sisaHari = 0;
    if (p.tenggat) {
        sisaHari = Math.round((Date.parse(p.tenggat) - Date.parse(hariIni())) / 86400_000);
        perBulan = kurang / Math.max(1, Math.ceil(Math.max(1, sisaHari) / 30.44));
    }
    return { ada, pct, kurang, perBulan, sisaHari };
}
const tglIso = (d: string) => { const x = new Date(`${d}T00:00:00Z`); return `${x.getUTCDate()} ${BULAN[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };

export function PocketBagian({ tx, saldo, akunList }: { tx: Tx[]; saldo: Saldo; akunList: string[] }) {
    const api = useApi<{ pocket: Pocket[] }>('/api/kantor/keuangan/pocket', 0);
    const [form, setForm] = useState<Partial<Pocket> | null>(null);
    const [buka, setBuka] = useState<string | null>(null);
    const xs = api.data?.pocket || [];
    const aktif = xs.find((p) => p.id === buka) || null;
    const total = xs.reduce((a, p) => a + (saldoPocket(p, saldo, tx) ?? 0), 0);
    const muat = () => api.reload();
    return (
        <section className="ku-card ku-lebar ku-pocket">
            <div className="ku-card-h">
                <h3>Pocket</h3>
                <div className="ku-pocket-h">{xs.length > 0 && <small className="mono">{rp(total)}</small>}<button className="ku-link" onClick={() => setForm({})}><Ikon n="plus" size={14} /> Buat pocket</button></div>
            </div>
            {api.error && <div className="error">{api.error}</div>}
            {xs.length === 0 && !api.error && (
                <button className="ku-pocket-kosong" onClick={() => setForm({})}>
                    <span className="ku-ico" style={{ '--c': '#22c55e' } as React.CSSProperties}><Ikon n="piggy-bank" /></span>
                    <span><b>Sisihkan uang untuk tujuan tertentu</b><small>Mis. dana darurat, DP rumah, liburan. Atur target dan tenggatnya.</small></span>
                </button>
            )}
            <div className="ku-pocket-grid">
                {xs.map((p) => {
                    const nilai = saldoPocket(p, saldo, tx), h = hitung(p, nilai);
                    return (
                        <button key={p.id} className="ku-pocket-kartu" style={{ '--c': p.warna } as React.CSSProperties} onClick={() => setBuka(p.id)}>
                            <span className="ku-pocket-atas">
                                <span className="ku-ico"><Ikon n={p.ikon} /></span>
                                <span className="ku-pocket-nama"><b>{p.nama}</b><small>{p.sumber === 'akun' ? `Saldo ${p.akun}` : 'Dicatat manual'}{p.tenggat ? ` · ${tglIso(p.tenggat)}` : ''}</small></span>
                                <em className="mono">{h.pct}%</em>
                            </span>
                            <span className="ku-pocket-angka"><b className="mono">{nilai === null ? '–' : rp(h.ada)}</b><small className="mono">/ {rpRingkas(p.target)}</small></span>
                            <span className="ku-meter tebal"><i style={{ width: `${h.pct}%` }} /></span>
                            <small className="ku-pocket-ket">{nilai === null ? `Belum ada saldo ${p.akun}. Unggah mutasinya dulu.`
                                : h.kurang === 0 ? 'Target tercapai'
                                : p.tenggat ? (h.sisaHari < 0 ? `Lewat tenggat · kurang ${rp(h.kurang)}` : `Sisihkan ${rp(h.perBulan)}/bulan`)
                                : `Kurang ${rp(h.kurang)}`}</small>
                        </button>
                    );
                })}
            </div>
            {form && <FormPocket awal={form} akunList={akunList} onClose={() => setForm(null)} onSaved={() => { setForm(null); muat(); }} />}
            {aktif && <DetailPocket p={aktif} nilai={saldoPocket(aktif, saldo, tx)} onClose={() => setBuka(null)} onUbah={() => { setForm(aktif); setBuka(null); }} onBerubah={muat} />}
        </section>
    );
}

function FormPocket({ awal, akunList, onClose, onSaved }: { awal: Partial<Pocket>; akunList: string[]; onClose: () => void; onSaved: () => void }) {
    useKembali(true, onClose);
    const [nama, setNama] = useState(awal.nama || '');
    const [target, setTarget] = useState(awal.target ? String(awal.target) : '');
    const [tenggat, setTenggat] = useState(awal.tenggat || '');
    const [sumber, setSumber] = useState<Pocket['sumber']>(awal.sumber || 'manual');
    const [akun, setAkun] = useState(awal.akun || akunList.find((a) => a !== 'Cash') || '');
    const [warna, setWarna] = useState(awal.warna || WARNA[0]);
    const [ikon, setIkon] = useState(awal.ikon || 'target');
    const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
    const n = Number(target.replace(/\D/g, ''));
    const simpan = async () => {
        setBusy(true); setErr('');
        try { await apiPost('/api/kantor/keuangan/pocket', { id: awal.id, nama, target: n, tenggat, sumber, akun, warna, ikon }); onSaved(); }
        catch (e: any) { setErr(String(e.message || e)); setBusy(false); }
    };
    return (
        <div className="k-sheet" onClick={onClose}>
            <div className="k-sheet-in ku-form" onClick={(e) => e.stopPropagation()}>
                <div className="k-sheet-h"><b>{awal.id ? 'Ubah pocket' : 'Buat pocket'}</b><button onClick={onClose} aria-label="Tutup"><Ikon n="circle-x" /></button></div>
                <label className="ku-field"><span>Nama</span><input className="input" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Mis. Dana darurat" maxLength={40} autoFocus /></label>
                <label className="ku-field"><span>Target</span><span className="ku-rp"><i>Rp</i><input className="input mono" inputMode="numeric" value={n ? n.toLocaleString('id-ID') : ''} onChange={(e) => setTarget(e.target.value)} placeholder="0" /></span></label>
                <div className="ku-field"><span>Tenggat (boleh kosong)</span>
                    <div className="ku-baris-aksi">
                        <TanggalInput className="ku-tgl-btn" value={tenggat} min={hariIni()} bisaKosong ariaLabel="Tenggat pocket" onChange={(v) => setTenggat(v || '')} tampil={tenggat ? tglIso(tenggat) : 'Pilih tanggal'} />
                        {tenggat && <button type="button" className="ku-link" onClick={() => setTenggat('')}>Hapus tenggat</button>}
                    </div>
                </div>
                <div className="ku-field"><span>Saldo pocket diambil dari</span>
                    <div className="ku-seg lebar">
                        <button type="button" className={sumber === 'manual' ? 'on' : ''} onClick={() => setSumber('manual')}>Catat manual</button>
                        <button type="button" className={sumber === 'akun' ? 'on' : ''} onClick={() => setSumber('akun')}>Ikuti saldo rekening</button>
                    </div>
                    <small className="ku-muted">{sumber === 'manual' ? 'Bapak menambah atau mengambil dana sendiri. Hanya catatan alokasi, saldo rekening tidak berubah.' : 'Progres otomatis mengikuti saldo rekening ini dari mutasi dan transaksi.'}</small>
                    {sumber === 'akun' && <div className="ku-pilih">{akunList.map((a) => <button type="button" key={a} className={samaAkun(a, akun) ? 'on' : ''} onClick={() => setAkun(a)}><i className="ku-tag">{a.slice(0, 1)}</i>{a}</button>)}</div>}
                </div>
                <div className="ku-field"><span>Ikon & warna</span>
                    <div className="ku-pilih-ikon">{IKON.map((k) => <button type="button" key={k} aria-label={k} className={ikon === k ? 'on' : ''} style={{ '--c': warna } as React.CSSProperties} onClick={() => setIkon(k)}><Ikon n={k} /></button>)}</div>
                    <div className="ku-pilih-warna">{WARNA.map((w) => <button type="button" key={w} aria-label={`Warna ${w}`} className={warna === w ? 'on' : ''} style={{ background: w }} onClick={() => setWarna(w)} />)}</div>
                </div>
                {err && <div className="error">{err}</div>}
                <button className="btn primary k-save" disabled={busy || !nama.trim() || !n || (sumber === 'akun' && !akun)} onClick={simpan}>{busy ? 'Menyimpan…' : awal.id ? 'Simpan perubahan' : 'Buat pocket'}</button>
            </div>
        </div>
    );
}

function DetailPocket({ p, nilai, onClose, onUbah, onBerubah }: { p: Pocket; nilai: number | null; onClose: () => void; onUbah: () => void; onBerubah: () => void }) {
    useKembali(true, onClose);
    const h = hitung(p, nilai);
    const [mode, setMode] = useState<'tambah' | 'ambil' | null>(null);
    const [n, setN] = useState(''); const [ket, setKet] = useState('');
    const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
    const v = Number(n.replace(/\D/g, ''));
    const kirim = async () => {
        if (!mode || !v) return;
        setBusy(true); setErr('');
        try { await apiPost(`/api/kantor/keuangan/pocket/${p.id}/dana`, { n: mode === 'tambah' ? v : -v, ket }); setMode(null); setN(''); setKet(''); onBerubah(); }
        catch (e: any) { setErr(String(e.message || e)); }
        setBusy(false);
    };
    const riwayat = [...p.riwayat].reverse();
    return (
        <div className="k-sheet" onClick={onClose}>
            <div className="k-sheet-in ku-form" onClick={(e) => e.stopPropagation()} style={{ '--c': p.warna } as React.CSSProperties}>
                <div className="k-sheet-h"><b>{p.nama}</b><button onClick={onClose} aria-label="Tutup"><Ikon n="circle-x" /></button></div>
                <div className="ku-pocket-det">
                    <span className="ku-ico besar"><Ikon n={p.ikon} size={22} /></span>
                    <b className="mono">{nilai === null ? '–' : rp(h.ada)}</b>
                    <small>dari target {rp(p.target)} · {h.pct}%</small>
                    <span className="ku-meter tebal"><i style={{ width: `${h.pct}%` }} /></span>
                </div>
                <div className="ku-stat3">
                    <div><small>Kurang</small><b className="mono">{rp(h.kurang)}</b></div>
                    <div><small>Tenggat</small><b>{p.tenggat ? tglIso(p.tenggat) : '–'}</b>{p.tenggat && <em>{h.sisaHari >= 0 ? `${h.sisaHari} hari lagi` : 'sudah lewat'}</em>}</div>
                    <div><small>Perlu per bulan</small><b className="mono">{p.tenggat && h.kurang ? rp(h.perBulan) : '–'}</b></div>
                </div>
                {p.sumber === 'akun'
                    ? <p className="ku-muted">Saldo pocket ini mengikuti saldo {p.akun}{nilai === null ? ', yang belum punya patokan. Unggah mutasi rekeningnya dulu.' : ' (patokan mutasi terakhir + transaksi sesudahnya).'}</p>
                    : (
                        <>
                            <div className="ku-baris-aksi">
                                <button className={`btn ${mode === 'tambah' ? 'primary' : ''}`} onClick={() => setMode(mode === 'tambah' ? null : 'tambah')}><Ikon n="plus" size={14} /> Tambah dana</button>
                                <button className={`btn ${mode === 'ambil' ? 'primary' : ''}`} disabled={!h.ada} onClick={() => setMode(mode === 'ambil' ? null : 'ambil')}><Ikon n="minus" size={14} /> Ambil dana</button>
                            </div>
                            {mode && (
                                <div className="ku-gerak">
                                    <span className="ku-rp"><i>Rp</i><input className="input mono" inputMode="numeric" autoFocus value={v ? v.toLocaleString('id-ID') : ''} onChange={(e) => setN(e.target.value)} placeholder="0" /></span>
                                    <input className="input" value={ket} onChange={(e) => setKet(e.target.value)} placeholder="Catatan (boleh kosong)" maxLength={80} />
                                    <button className="btn primary" disabled={!v || busy} onClick={kirim}>{busy ? 'Menyimpan…' : mode === 'tambah' ? 'Simpan' : 'Ambil'}</button>
                                </div>
                            )}
                            {err && <div className="error">{err}</div>}
                            <h4>Riwayat</h4>
                            {riwayat.length === 0 && <p className="ku-muted">Belum ada dana masuk.</p>}
                            {riwayat.slice(0, 30).map((g) => {
                                const d = new Date(g.at + 7 * 3600_000).toISOString().slice(0, 10);
                                return <div key={g.id} className="ku-riwayat"><span><b>{g.n > 0 ? 'Tambah dana' : 'Ambil dana'}</b><small>{tglPendek(d)}{g.ket ? ` · ${g.ket}` : ''}</small></span><b className={`mono ${g.n > 0 ? 'pos' : ''}`}>{g.n > 0 ? '+' : '−'}{rp(Math.abs(g.n))}</b></div>;
                            })}
                        </>
                    )}
                <div className="k-det-act">
                    <button className="btn" onClick={onUbah}><Ikon n="pen-line" size={14} /> Ubah</button>
                    <button className="btn danger" onClick={async () => {
                        if (!(await konfirmasi(`Hapus pocket "${p.nama}"? Riwayatnya ikut terhapus. Saldo rekening tidak berubah.`, { bahaya: true, ok: 'Hapus' }))) return;
                        try { await apiPost(`/api/kantor/keuangan/pocket/${p.id}/hapus`, {}); onClose(); onBerubah(); } catch (e: any) { setErr(String(e.message || e)); }
                    }}><Ikon n="trash" size={14} /> Hapus</button>
                </div>
            </div>
        </div>
    );
}
