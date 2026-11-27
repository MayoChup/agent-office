import React, { useMemo, useRef, useState } from 'react';
import { apiPost, serverBase, tokenLogin } from '../../kantor/connection';
import { rp, tglPendek, ikon } from './util';

import { Ikon } from '../../components/Ikon';
interface MTx { idx: number; id: string; tanggal: string; jenis: 'Masuk' | 'Keluar' | 'Antar Rekening'; nominal: number; saldo: number | null; ket: string; pihak: string; kategori: string; yakin: boolean; status: 'baru' | 'cocok'; cocok: { id: string; d: string; pihak: string } | null }
interface Lebih { id: string; d: string; jenis: string; n: number; pihak: string; ket: string }
interface Hasil { periode: { dari: string; sampai: string }; saldoAwal: number | null; saldoAkhir: number | null; transaksi: MTx[]; lebih: Lebih[]; halaman: number; peringatan: string[] }

/** Impor PDF mutasi rekening → tinjau → simpan. PDF dibaca di VPS, tidak dikirim ke AI. */
export function ImporMutasi({ akun: daftarAkun, onClose, onSelesai }: { akun: string[]; onClose: () => void; onSelesai: () => void }) {
    const [akun, setAkun] = useState(daftarAkun.find((a) => a !== 'Cash') || daftarAkun[0] || '');
    const [file, setFile] = useState<File | null>(null);
    const [sandi, setSandi] = useState('');
    const [perluSandi, setPerluSandi] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [h, setH] = useState<Hasil | null>(null);
    const [pilih, setPilih] = useState<Record<string, boolean>>({});
    const [hapus, setHapus] = useState<Record<string, boolean>>({});
    const [kat, setKat] = useState<Record<string, string>>({});
    const [pakaiSaldo, setPakaiSaldo] = useState(true);
    const [hasilSimpan, setHasilSimpan] = useState('');
    const inp = useRef<HTMLInputElement>(null);

    const baca = async () => {
        if (!file || !akun) return;
        setBusy(true); setErr('');
        try {
            const res = await fetch(`${serverBase()}/api/kantor/keuangan/mutasi?akun=${encodeURIComponent(akun)}`, {
                method: 'POST', headers: { Authorization: `Bearer ${tokenLogin()}`, 'Content-Type': 'application/pdf', ...(sandi ? { 'X-Pdf-Sandi': sandi } : {}) }, body: file
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || d.ok === false) { if (d.butuhSandi) setPerluSandi(true); throw new Error(d.error || `HTTP ${res.status}`); }
            setH(d);
            setPilih(Object.fromEntries(d.transaksi.map((t: MTx) => [t.id, t.status === 'baru'])));
            setKat(Object.fromEntries(d.transaksi.map((t: MTx) => [t.id, t.kategori])));
            setHapus({});
        } catch (e: any) { setErr(String(e?.message || e)); }
        setBusy(false);
    };
    const tx = h?.transaksi || [];
    const dipilih = tx.filter((t) => pilih[t.id]);
    const ringkas = useMemo(() => ({ baru: tx.filter((t) => t.status === 'baru').length, cocok: tx.filter((t) => t.status === 'cocok').length, ragu: tx.filter((t) => !t.yakin).length }), [tx]);
    const terapkan = async () => {
        if (!h) return;
        setBusy(true); setErr('');
        try {
            const r: any = await apiPost('/api/kantor/keuangan/mutasi/terapkan', {
                akun,
                tambah: dipilih.map((t) => ({ id: t.id, tanggal: t.tanggal, jenis: t.jenis, nominal: t.nominal, pihak: t.pihak, kategori: t.jenis === 'Masuk' ? 'Pendapatan' : kat[t.id] || t.kategori, keterangan: t.ket })),
                hapus: Object.keys(hapus).filter((k) => hapus[k]),
                saldo: pakaiSaldo && h.saldoAkhir != null && h.periode.sampai ? { nilai: h.saldoAkhir, tanggal: h.periode.sampai } : null
            });
            setHasilSimpan(`✅ ${r.ditambah || 0} transaksi ditambahkan${r.dihapus ? `, ${r.dihapus} dihapus` : ''}${r.saldo ? `, saldo ${akun} diperbarui` : ''}.`);
            onSelesai();
        } catch (e: any) { setErr(String(e?.message || e)); }
        setBusy(false);
    };

    return (
        <div className="k-sheet" onClick={onClose}>
            <div className="k-sheet-in mt" onClick={(e) => e.stopPropagation()}>
                <div className="k-sheet-h"><b><Ikon e="📥" /> Impor mutasi rekening (PDF)</b><button onClick={onClose}>✕</button></div>
                {!h && (
                    <>
                        <p className="hint">Unduh e-statement / mutasi dari m-banking atau internet banking (PDF asli, bukan foto). PDF dibaca di server kantor sendiri — <b>tidak dikirim ke AI</b> dan tidak disimpan.</p>
                        <small className="mt-l">Rekening</small>
                        <div className="k-akun">{daftarAkun.filter((a) => a !== 'Cash').map((a) => <button key={a} className={akun === a ? 'on' : ''} onClick={() => setAkun(a)}><Ikon e="🏦" /> {a}</button>)}</div>
                        <small className="mt-l">Berkas PDF</small>
                        <button className="mt-file" onClick={() => inp.current?.click()}>{file ? <><Ikon e="📄" /> {`${file.name} (${Math.round(file.size / 1024)} KB)`}</> : 'Pilih PDF mutasi…'}</button>
                        <input ref={inp} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); setErr(''); setPerluSandi(false); }} />
                        {(perluSandi || sandi) && (<>
                            <small className="mt-l">Kata sandi PDF</small>
                            <input className="input" type="password" autoComplete="off" placeholder="mis. tanggal lahir DDMMYY" value={sandi} onChange={(e) => setSandi(e.target.value)} />
                            <small className="hint">Hanya dipakai untuk membuka PDF ini, tidak disimpan.</small>
                        </>)}
                        {!perluSandi && !sandi && <button className="k-link" onClick={() => setPerluSandi(true)}>PDF-nya pakai kata sandi?</button>}
                        {err && <div className="error">{err}</div>}
                        <button className="btn primary k-save" disabled={!file || !akun || busy} onClick={baca}>{busy ? 'Membaca…' : 'Baca mutasi'}</button>
                    </>
                )}
                {h && !hasilSimpan && (
                    <>
                        <div className="mt-sum">
                            <div><small>Periode</small><b>{h.periode.dari ? `${tglPendek(h.periode.dari)} – ${tglPendek(h.periode.sampai)}` : '–'}</b></div>
                            <div><small>Transaksi</small><b>{tx.length}</b></div>
                            <div><small>Sudah tercatat</small><b>{ringkas.cocok}</b></div>
                            <div><small>Baru</small><b className="in">{ringkas.baru}</b></div>
                            {h.saldoAkhir != null && <div><small>Saldo akhir</small><b className="mono">{rp(h.saldoAkhir)}</b></div>}
                        </div>
                        {h.peringatan.map((p, i) => <div key={i} className="error"><Ikon e="⚠" /> {p}</div>)}
                        {ringkas.ragu > 0 && <div className="hint"><Ikon e="❓" /> {ringkas.ragu} transaksi arahnya (masuk/keluar) ditebak — cek tanda <Ikon e="❓" />.</div>}
                        <div className="mt-bar">
                            <b>Transaksi di mutasi</b>
                            <button className="k-link" onClick={() => setPilih(Object.fromEntries(tx.map((t) => [t.id, t.status === 'baru'])))}>Pilih yang baru</button>
                            <button className="k-link" onClick={() => setPilih({})}>Kosongkan</button>
                        </div>
                        <div className="mt-list">
                            {tx.map((t) => (
                                <label key={t.id} className={`mt-row ${t.status}`}>
                                    <input type="checkbox" checked={!!pilih[t.id]} onChange={(e) => setPilih({ ...pilih, [t.id]: e.target.checked })} />
                                    <div className="mt-main">
                                        <div className="mt-top"><b>{t.pihak || '(tanpa nama)'}</b><b className={`mono ${t.jenis === 'Masuk' ? 'in' : t.jenis === 'Keluar' ? 'out' : ''}`}>{t.jenis === 'Masuk' ? '+' : t.jenis === 'Keluar' ? '−' : '⇄ '}{rp(t.nominal)}{!t.yakin && <Ikon e="❓" />}</b></div>
                                        <small>{tglPendek(t.tanggal)} · {t.ket}</small>
                                        <div className="mt-bot">
                                            {t.jenis === 'Antar Rekening' && <span className="mt-tag">🔁 pindah dana ({/masuk/i.test(t.kategori) ? 'masuk' : 'keluar'})</span>}
                                            {t.status === 'cocok' ? <span className="mt-tag ok">✓ sudah tercatat{t.cocok ? ` (${tglPendek(t.cocok.d)}${t.cocok.pihak ? `, ${t.cocok.pihak}` : ''})` : ''}</span> : <span className="mt-tag new">baru</span>}
                                            {t.jenis === 'Keluar' && pilih[t.id] && (
                                                <select value={kat[t.id] || t.kategori} onClick={(e) => e.preventDefault()} onChange={(e) => setKat({ ...kat, [t.id]: e.target.value })}>
                                                    {Array.from(new Set(['Makan & Minum', 'Transport', 'Belanja', 'Tagihan & Langganan', 'Pulsa & Internet', 'Kesehatan', 'Hiburan', 'Investasi', 'Transfer Keluarga', 'Lainnya', kat[t.id] || t.kategori])).map((k) => <option key={k} value={k}>{ikon(k)} {k}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                        {h.lebih.length > 0 && (
                            <>
                                <div className="mt-bar"><b>Tercatat di kantor tapi TIDAK ada di mutasi</b></div>
                                <p className="hint">Untuk {akun} pada periode ini. Biasanya dobel atau salah pilih rekening. Centang untuk menghapus.</p>
                                <div className="mt-list">
                                    {h.lebih.map((t) => (
                                        <label key={t.id} className="mt-row lebih">
                                            <input type="checkbox" checked={!!hapus[t.id]} onChange={(e) => setHapus({ ...hapus, [t.id]: e.target.checked })} />
                                            <div className="mt-main">
                                                <div className="mt-top"><b>{t.pihak || '(tanpa nama)'}</b><b className={`mono ${t.jenis === 'Masuk' ? 'in' : 'out'}`}>{t.jenis === 'Masuk' ? '+' : '−'}{rp(t.n)}</b></div>
                                                <small>{tglPendek(t.d)} · {t.ket || t.jenis}</small>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </>
                        )}
                        {h.saldoAkhir != null && (
                            <label className="mt-saldo"><input type="checkbox" checked={pakaiSaldo} onChange={(e) => setPakaiSaldo(e.target.checked)} /> Samakan saldo {akun} dengan mutasi: <b className="mono">{rp(h.saldoAkhir)}</b> per {tglPendek(h.periode.sampai)}</label>
                        )}
                        {err && <div className="error">{err}</div>}
                        <div className="row" style={{ gap: 8 }}>
                            <button className="btn" onClick={() => setH(null)}>‹ Ganti PDF</button>
                            <button className="btn primary k-save" style={{ flex: 1 }} disabled={busy || (!dipilih.length && !Object.values(hapus).some(Boolean) && !pakaiSaldo)} onClick={terapkan}>
                                {busy ? 'Menyimpan…' : `Simpan ${dipilih.length} transaksi${Object.values(hapus).filter(Boolean).length ? ` · hapus ${Object.values(hapus).filter(Boolean).length}` : ''}`}
                            </button>
                        </div>
                    </>
                )}
                {hasilSimpan && (
                    <div className="mt-done"><p>{hasilSimpan}</p><button className="btn primary" onClick={onClose}>Selesai</button></div>
                )}
            </div>
        </div>
    );
}
