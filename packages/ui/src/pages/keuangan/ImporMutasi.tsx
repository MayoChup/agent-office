import React, { useMemo, useRef, useState } from 'react';
import { apiPost, serverBase, tokenLogin } from '../../kantor/connection';
import { useApi } from '../../kantor/api';
import { rp, tglPendek, ikon } from './util';

import { Ikon } from '../../components/Ikon';
interface MTx { idx: number; id: string; tanggal: string; jenis: 'Masuk' | 'Keluar' | 'Antar Rekening'; nominal: number; saldo: number | null; ket: string; pihak: string; kategori: string; yakin: boolean; status: 'baru' | 'cocok'; cocok: { id: string; d: string; pihak: string } | null }
interface Lebih { id: string; d: string; jenis: string; n: number; pihak: string; ket: string }
interface Hasil { pola?: string; periode: { dari: string; sampai: string }; saldoAwal: number | null; saldoAkhir: number | null; transaksi: MTx[]; lebih: Lebih[]; halaman: number; peringatan: string[] }

export interface ItemAntre { id: string; nama: string; akun: string; akunOtomatis: boolean; status: 'antre' | 'proses' | 'siap' | 'gagal' | 'disimpan'; dibuat: number; selesai?: number; error?: string; butuhSandi?: boolean; butuhAkun?: boolean; ringkas?: { total: number; baru: number; cocok: number; pindah: number; dari: string; sampai: string }; hasil?: any; pola?: string }

/** Salin pola tata letak PDF (tanpa data pribadi) supaya format bank yang belum terbaca bisa diperbaiki. */
async function salinPola(pola?: string) {
    if (!pola) { alert('Pola format belum tersedia untuk PDF ini.'); return; }
    try { await navigator.clipboard.writeText(`Pola format mutasi (tanpa data pribadi: huruf → x, angka → 9)\n${pola}`); alert('Pola format tersalin. Tempel ke Claude supaya pembacanya diperbaiki.'); }
    catch { alert('Tidak bisa menyalin otomatis di perangkat ini.'); }
}

/** Kirim satu PDF ke antrean server (berkas mentah; kalau diputus jaringan, lewat JSON base64). */
async function kirimKeAntre(file: File, akun: string, sandi: string) {
    let isi: ArrayBuffer;
    try { isi = await file.arrayBuffer(); } catch { throw new Error('Berkas tidak bisa dibaca dari HP. Simpan dulu PDF-nya ke penyimpanan HP (bukan langsung dari Drive/WhatsApp), lalu pilih lagi.'); }
    const q = `nama=${encodeURIComponent(file.name)}&akun=${encodeURIComponent(akun)}`;
    const mentah = () => fetch(`${serverBase()}/api/kantor/keuangan/mutasi-antre?${q}`, { method: 'POST', headers: { Authorization: `Bearer ${tokenLogin()}`, 'Content-Type': 'application/octet-stream', ...(sandi ? { 'X-Pdf-Sandi': sandi } : {}) }, body: isi });
    const json = () => {
        const b = new Uint8Array(isi); let bin = '';
        for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
        return fetch(`${serverBase()}/api/kantor/keuangan/mutasi-antre-json`, { method: 'POST', headers: { Authorization: `Bearer ${tokenLogin()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ nama: file.name, akun, sandi, pdf: btoa(bin) }) });
    };
    let res: Response;
    try { res = await mentah(); } catch {
        try { res = await json(); } catch {
            await new Promise((r) => setTimeout(r, 4000));
            try { res = await json(); } catch { throw new Error('Sambungan ke server terputus. Cek internet lalu coba lagi.'); }
        }
    }
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.ok === false) throw new Error(d.error || `HTTP ${res.status}`);
    return d.item as ItemAntre;
}

/** Unggah banyak PDF mutasi sekaligus (campur bank) → dibaca server di belakang layar → ditinjau belakangan. */
export function UnggahMutasi({ akun: daftarAkun, onClose, onTerkirim }: { akun: string[]; onClose: () => void; onTerkirim: () => void }) {
    const bank = daftarAkun.filter((a) => a !== 'Cash');
    const [berkas, setBerkas] = useState<Array<{ file: File; akun: string; sandi: string; status: '' | 'kirim' | 'ok' | 'gagal'; pesan?: string }>>([]);
    const [busy, setBusy] = useState(false);
    const [selesai, setSelesai] = useState(false);
    const inp = useRef<HTMLInputElement>(null);
    const ubah = (i: number, x: Partial<(typeof berkas)[number]>) => setBerkas((b) => b.map((y, j) => (j === i ? { ...y, ...x } : y)));
    const kirimSemua = async () => {
        setBusy(true);
        for (let i = 0; i < berkas.length; i++) {
            if (berkas[i].status === 'ok') continue;
            ubah(i, { status: 'kirim', pesan: '' });
            try { await kirimKeAntre(berkas[i].file, berkas[i].akun, berkas[i].sandi); ubah(i, { status: 'ok' }); }
            catch (e: any) { ubah(i, { status: 'gagal', pesan: String(e?.message || e) }); }
        }
        setBusy(false); setSelesai(true); onTerkirim();
    };
    const semuaOk = berkas.length > 0 && berkas.every((b) => b.status === 'ok');
    return (
        <div className="k-sheet" onClick={onClose}>
            <div className="k-sheet-in mt" onClick={(e) => e.stopPropagation()}>
                <div className="k-sheet-h"><b><Ikon e="📥" /> Impor mutasi rekening (PDF)</b><button onClick={onClose}>✕</button></div>
                {!semuaOk && <p className="hint">Pilih satu atau beberapa PDF e-statement/mutasi, boleh campur bank. Bank dikenali otomatis dari isinya. PDF dibaca di server kantor sendiri: <b>tidak dikirim ke AI</b> dan tidak disimpan. Setelah terkirim, Bapak boleh menutup aplikasi; nanti dikabari saat siap ditinjau.</p>}
                <div className="mt-berkas">
                    {berkas.map((b, i) => (
                        <div key={i} className={`mt-berkas-baris ${b.status}`}>
                            <div className="mt-top"><b><Ikon e="📄" /> {b.file.name}</b><small>{Math.round(b.file.size / 1024)} KB</small></div>
                            {b.status !== 'ok' && (
                                <div className="mt-berkas-atur">
                                    <select className="input" value={b.akun} onChange={(e) => ubah(i, { akun: e.target.value })} aria-label="Bank">
                                        <option value="">Bank: otomatis</option>
                                        {bank.map((a) => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                    <input className="input" type="password" autoComplete="off" placeholder="Kata sandi PDF (kalau ada)" value={b.sandi} onChange={(e) => ubah(i, { sandi: e.target.value })} />
                                    {!busy && <button className="k-link" onClick={() => setBerkas((x) => x.filter((_, j) => j !== i))}>Hapus</button>}
                                </div>
                            )}
                            {b.status === 'kirim' && <small className="hint">Mengirim…</small>}
                            {b.status === 'ok' && <small className="in">✓ Terkirim, sedang dibaca server</small>}
                            {b.status === 'gagal' && <div className="error">{b.pesan}</div>}
                        </div>
                    ))}
                </div>
                {!semuaOk && <button className="mt-file" disabled={busy} onClick={() => inp.current?.click()}>{berkas.length ? '+ Tambah PDF lain' : 'Pilih PDF mutasi…'}</button>}
                <input ref={inp} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { const f = Array.from(e.target.files || []); setBerkas((b) => [...b, ...f.map((file) => ({ file, akun: '', sandi: '', status: '' as const }))].slice(0, 20)); e.target.value = ''; }} />
                {semuaOk
                    ? <div className="mt-done"><p>✅ {berkas.length} PDF terkirim. Server membacanya satu per satu; Bapak akan dikabari saat siap ditinjau di kartu <b>"Mutasi menunggu ditinjau"</b>.</p><button className="btn primary" onClick={onClose}>Tutup</button></div>
                    : <button className="btn primary k-save" disabled={!berkas.length || busy} onClick={kirimSemua}>{busy ? 'Mengirim…' : selesai ? 'Kirim ulang yang gagal' : `Kirim ${berkas.length || ''} PDF`}</button>}
            </div>
        </div>
    );
}

/** Kartu di Beranda: PDF yang sedang dibaca / siap ditinjau / gagal. */
export function AntreMutasiKartu({ akun: daftarAkun, onTinjau, sinyal }: { akun: string[]; onTinjau: (x: ItemAntre) => void; sinyal: number }) {
    const r = useApi<{ items: ItemAntre[] }>(`/api/kantor/keuangan/mutasi-antre?s=${sinyal}`, 10_000);
    const [sandi, setSandi] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');
    const items = (r.data?.items || []).filter((x) => x.status !== 'disimpan');
    if (!items.length) return null;
    const aksi = async (id: string, a: string, body: any = {}) => { setBusy(id); try { await apiPost(`/api/kantor/keuangan/mutasi-antre/${id}/${a}`, body); r.reload(); } catch (e: any) { alert(String(e?.message || e)); } setBusy(''); };
    const buka = async (x: ItemAntre) => { setBusy(x.id); try { const d: any = await (await fetch(`${serverBase()}/api/kantor/keuangan/mutasi-antre/${x.id}`, { headers: { Authorization: `Bearer ${tokenLogin()}` } })).json(); if (d.ok) onTinjau(d.item); } catch { /* */ } setBusy(''); };
    return (
        <section className="k-card k-span2">
            <div className="k-card-h"><h3>Mutasi menunggu ditinjau</h3><small>{items.length} PDF</small></div>
            <div className="mt-antre">
                {items.map((x) => (
                    <div key={x.id} className={`mt-antre-baris ${x.status}`}>
                        <div className="mt-top">
                            <b>{x.akun || 'Bank ?'}{x.ringkas?.dari ? ` · ${tglPendek(x.ringkas.dari)} – ${tglPendek(x.ringkas.sampai)}` : ''}</b>
                            <small>{x.status === 'antre' ? 'menunggu giliran' : x.status === 'proses' ? 'sedang dibaca…' : x.status === 'siap' ? 'siap ditinjau' : 'gagal'}</small>
                        </div>
                        <small className="hint">{x.nama}{x.ringkas ? ` · ${x.ringkas.baru} baru, ${x.ringkas.cocok} sudah tercatat${x.ringkas.pindah ? `, ${x.ringkas.pindah} pindah dana` : ''}` : ''}</small>
                        {x.status === 'gagal' && <div className="error">{x.error}</div>}
                        <div className="mt-berkas-atur">
                            {x.status === 'siap' && <button className="btn small primary" disabled={busy === x.id} onClick={() => buka(x)}>Tinjau</button>}
                            {x.status === 'gagal' && x.butuhSandi && <><input className="input" type="password" autoComplete="off" placeholder="Kata sandi PDF" value={sandi[x.id] || ''} onChange={(e) => setSandi({ ...sandi, [x.id]: e.target.value })} /><button className="btn small primary" disabled={busy === x.id || !sandi[x.id]} onClick={() => aksi(x.id, 'ulangi', { sandi: sandi[x.id] })}>Coba lagi</button></>}
                            {x.status === 'gagal' && x.butuhAkun && <select className="input" value="" onChange={(e) => e.target.value && aksi(x.id, 'ulangi', { akun: e.target.value })}><option value="">Pilih bank…</option>{daftarAkun.filter((a) => a !== 'Cash').map((a) => <option key={a} value={a}>{a}</option>)}</select>}
                            {x.status === 'gagal' && <button className="k-link" disabled={busy === x.id} onClick={async () => { try { const d: any = await (await fetch(`${serverBase()}/api/kantor/keuangan/mutasi-antre/${x.id}`, { headers: { Authorization: `Bearer ${tokenLogin()}` } })).json(); await salinPola(d.item?.pola || d.item?.hasil?.pola); } catch { /* */ } }}>Salin pola format</button>}
                            {(x.status === 'siap' || x.status === 'gagal') && <button className="k-link" disabled={busy === x.id} onClick={() => { if (confirm('Buang hasil baca PDF ini? Transaksi yang sudah tersimpan tidak ikut terhapus.')) void aksi(x.id, 'hapus'); }}>Buang</button>}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** Tinjau hasil baca satu PDF → simpan. */
export function ImporMutasi({ tinjau, onClose, onSelesai }: { tinjau: ItemAntre; onClose: () => void; onSelesai: () => void }) {
    const akun = tinjau.akun;
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const awal: Hasil = tinjau.hasil;
    const [h, setH] = useState<Hasil | null>(awal);
    const [pilih, setPilih] = useState<Record<string, boolean>>(() => Object.fromEntries((awal?.transaksi || []).map((t: MTx) => [t.id, t.status === 'baru'])));
    const [hapus, setHapus] = useState<Record<string, boolean>>({});
    const [kat, setKat] = useState<Record<string, string>>(() => Object.fromEntries((awal?.transaksi || []).map((t: MTx) => [t.id, t.kategori])));
    const [pakaiSaldo, setPakaiSaldo] = useState(true);
    const [hasilSimpan, setHasilSimpan] = useState('');
    void setH;
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
                sahkan: tx.filter((t) => t.status === 'cocok' && t.cocok?.id?.startsWith('auto-tf-')).map((t) => ({ id: t.cocok!.id, tanggal: t.tanggal })),
                saldo: pakaiSaldo && h.saldoAkhir != null && !!h.periode.sampai ? { nilai: h.saldoAkhir, tanggal: h.periode.sampai } : null
            });
            setHasilSimpan(`✅ ${r.ditambah || 0} transaksi ditambahkan${r.disahkan ? `, ${r.disahkan} pindah dana otomatis disahkan` : ''}${r.dilewati ? ` (${r.dilewati} dilewati karena nominalnya tidak valid)` : ''}${r.dihapus ? `, ${r.dihapus} dihapus` : ''}${r.saldo ? `, saldo ${akun} diperbarui` : ''}.`);
            try { await apiPost(`/api/kantor/keuangan/mutasi-antre/${tinjau.id}/selesai`, {}); } catch { /* tidak penting */ }
            onSelesai();
        } catch (e: any) { setErr(String(e?.message || e)); }
        setBusy(false);
    };

    return (
        <div className="k-sheet" onClick={onClose}>
            <div className="k-sheet-in mt" onClick={(e) => e.stopPropagation()}>
                <div className="k-sheet-h"><b><Ikon e="📥" /> Tinjau mutasi {akun}</b><button onClick={onClose}>✕</button></div>
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
                        {(h.peringatan.length > 0 || !tx.length) && h.pola && <p className="hint">Formatnya belum terbaca sempurna? <button className="k-link" onClick={() => salinPola(h.pola)}>Salin pola format (tanpa data pribadi)</button> lalu kirim ke Claude.</p>}
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
                                            {t.status === 'cocok' && t.cocok?.id?.startsWith('auto-tf-') ? <span className="mt-tag ok">✓ pindah dana otomatis, disahkan saat disimpan</span> : t.status === 'cocok' ? <span className="mt-tag ok">✓ sudah tercatat{t.cocok ? ` (${tglPendek(t.cocok.d)}${t.cocok.pihak ? `, ${t.cocok.pihak}` : ''})` : ''}</span> : <span className="mt-tag new">baru</span>}
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
                        {h.saldoAkhir != null && !!h.periode.sampai && (
                            <label className="mt-saldo"><input type="checkbox" checked={pakaiSaldo} onChange={(e) => setPakaiSaldo(e.target.checked)} /> Samakan saldo {akun} dengan mutasi: <b className="mono">{rp(h.saldoAkhir)}</b> per {tglPendek(h.periode.sampai)}</label>
                        )}
                        {err && <div className="error">{err}</div>}
                        <div className="row" style={{ gap: 8 }}>
                            <button className="btn" onClick={onClose}>Nanti saja</button>
                            <button className="btn primary k-save" style={{ flex: 1 }} disabled={busy || (!dipilih.length && !Object.values(hapus).some(Boolean) && !(pakaiSaldo && !!h.periode.sampai) && !tx.some((t) => t.cocok?.id?.startsWith('auto-tf-')))} onClick={terapkan}>
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
