import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { Info } from './InfoI';
import { H_MODE } from './Preset';

/**
 * "Sisi jual": bukti dari uji mundur 5 tahun & uji kertas — apakah saham berskor lemah benar-benar kalah dari S&P 500,
 * dan apakah keranjang "beli 10 teratas, short 10 terbawah" menghasilkan sesuatu. Analisis saja; tidak ada short sungguhan.
 */
type Kel = { n: number; rataEx: number | null; menang: number | null; galatStd: number | null; kalahPasar: number | null; hasilShort: number | null; biaya: number; terbukti: boolean; shortUntung: boolean };
type Rapor = { bulan: number; total: number; perBulan: number; winrate: number; pf: number | null; ddMaks: number; terbukti: boolean } | null;
type KelK = { n: number; rata: number | null; kalahPasar: number | null; galatStd: number | null; terbukti: boolean };
export interface DataSJ {
    uji: { at: number; per: Record<string, Record<'semua' | 'tekJualKuat' | 'tekJual' | 'fundJual' | 'gabLemah', Kel>>; keranjang: { longShort: Rapor; longSaja: Rapor; shortSaja: Rapor; spy: Rapor }; catatan: string } | null;
    kertas: { mulai: number | null; dicatat: number; hasil: Record<'beli' | 'jual', Record<string, KelK>> };
}
const NAMA: Record<string, string> = { tekJualKuat: 'Teknikal Jual kuat', tekJual: 'Teknikal Jual / Jual kuat', fundJual: 'Fundamental Jual / Jual kuat', gabLemah: 'Gabungan teknikal + fundamental lemah' };
const p = (v: number | null | undefined, d = 2) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const n1 = (v: number | null | undefined) => (v == null ? '–' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const tgl = (t: number) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

/** Data sisi jual bersama (dimuat sekali, dipakai kotak ini & tanda "Kandidat lemah"). */
export function useSisiJual() { return useApi<DataSJ>('/api/kantor/sisi-jual', 1_800_000); }
/** Apakah tanda "Kandidat lemah · hindari" boleh ditampilkan untuk horison ini (hanya kalau terbukti). */
export function lemahTerbukti(d: DataSJ | null | undefined, H: number) {
    const k = d?.uji?.per[String(H <= 10 ? 5 : H <= 30 ? 20 : 60)];
    return !!k && (k.gabLemah?.terbukti || k.tekJualKuat?.terbukti);
}

const INFO = 'Uji mundur: di setiap tanggal selama ±5 tahun, saham dinilai hanya dari data sampai tanggal itu, lalu hasilnya dibandingkan dengan S&P 500 (disesuaikan seberapa liar sahamnya).\n\n"Kalah dari pasar" = berapa persen kejadian saham itu tertinggal dari S&P 500. "Kalau di-short" = hasil posisi short setelah dikurangi perkiraan biaya transaksi 0,10% + pinjam saham 1%/tahun.\n\n"Terbukti" hanya kalau selisihnya lebih dari 2× galat standar (bukan kebetulan) dengan ≥300 kejadian.\n\nUji kertas: sinyal hari ini dicatat, lalu dinilai otomatis 20 & 60 hari bursa kemudian dengan harga nyata — tanpa uang, tanpa mengintip masa depan.';

/** Satu tombol: jalankan uji mundur lengkap (sisi beli + sisi jual + keranjang beli/short) sekaligus. */
function TombolUji({ selesai }: { selesai: () => void }) {
    const u = useApi<{ status: { jalan: boolean; progres: string } }>('/api/kantor/ujimundur', 0);
    const [msg, setMsg] = useState('');
    const jalan = !!u.data?.status.jalan;
    const tadi = React.useRef(false);
    React.useEffect(() => { if (!jalan) { if (tadi.current) { tadi.current = false; selesai(); } return; } tadi.current = true; const t = setInterval(() => u.reload(), 10_000); return () => clearInterval(t); }, [jalan]); // eslint-disable-line react-hooks/exhaustive-deps
    const mulai = async () => { setMsg(''); try { await apiPost('/api/kantor/ujimundur/jalankan', {}); u.reload(); } catch (e: any) { setMsg(String(e?.message || e)); } };
    return (
        <div className="sj-jalan">
            <button className="btn small primary" disabled={jalan} onClick={mulai}>{jalan ? 'Sedang menguji…' : 'Uji semua sekarang (beli & short)'}</button>
            <small>{jalan ? `${u.data?.status.progres} — ±20–40 menit, boleh ditinggal` : msg || 'Satu kali jalan menguji sisi beli, sisi jual, dan keranjang beli/short sekaligus.'}</small>
        </div>
    );
}

export function SisiJual({ mode }: { mode: string }) {
    const d = useSisiJual();
    const [buka, setBuka] = useState(false);
    const H = String(H_MODE[mode] ?? 20) === '5' ? '5' : String(H_MODE[mode] ?? 20) === '60' ? '60' : '20';
    const u = d.data?.uji, k = d.data?.kertas;
    if (!d.data) return null;
    const per = u?.per[H];
    const gl = per?.gabLemah, tk = per?.tekJualKuat;
    const ks = u?.keranjang;
    const vonis = !u ? 'Belum diuji — hasil pertama muncul setelah uji mundur mingguan berikutnya.'
        : gl?.terbukti || tk?.terbukti ? `Terbukti: saham berskor lemah rata-rata ${p((gl?.terbukti ? gl : tk)!.rataEx)} dari S&P 500 dalam ${H} hari bursa.${(gl?.terbukti ? gl : tk)!.shortUntung ? '' : ' Tapi setelah biaya, short-nya belum menguntungkan — pakai sebagai daftar "hindari", bukan short.'}`
        : 'Belum terbukti: saham berskor lemah tidak jelas kalah dari pasar. Sinyal Jual sebaiknya tidak dipakai untuk short.';
    const kj = k?.hasil.jual[H === '60' ? '60' : '20'], kb = k?.hasil.beli[H === '60' ? '60' : '20'];
    return (
        <section className={`sb-card sj ${gl?.terbukti || tk?.terbukti ? 'ok' : 'warn'}`}>
            <div className="sj-h"><b>Sisi jual · apakah sinyal turun bisa dipakai?</b> <Info judul="Cara membaca sisi jual" teks={INFO} /></div>
            <p className="sj-vonis">{vonis}</p>
            <TombolUji selesai={() => d.reload()} />
            {u && per && (
                <>
                    <button className="sj-toggle" onClick={() => setBuka(!buka)} aria-expanded={buka}>{buka ? 'Sembunyikan rincian' : 'Lihat rincian'}</button>
                    {buka && (
                        <div className="sj-rinci">
                            <div className="tbl-wrap"><table className="sj-tabel">
                                <thead><tr><th>Kelompok · {H} hari</th><th>vs S&P 500</th><th>Kalah pasar</th><th>Di-short</th><th className="sj-n">Kejadian</th></tr></thead>
                                <tbody>
                                    {(['gabLemah', 'tekJualKuat', 'tekJual', 'fundJual'] as const).map((key) => { const x = per[key]; if (!x || !x.n) return null; return (
                                        <tr key={key}><td>{NAMA[key]}<small className={x.terbukti ? 'sj-ok' : 'sj-no'}>{x.terbukti ? 'terbukti' : 'belum terbukti'}</small></td><td className={`mono ${(x.rataEx ?? 0) < 0 ? 'down' : 'up'}`}>{p(x.rataEx)}</td><td className="mono">{n1(x.kalahPasar)}</td><td className={`mono ${(x.hasilShort ?? 0) > 0 ? 'up' : 'down'}`}>{p(x.hasilShort)}</td><td className="mono sj-n">{x.n.toLocaleString('id-ID')}</td></tr>
                                    ); })}
                                    <tr className="sj-ref"><td>Semua saham (pembanding)</td><td className="mono">{p(per.semua?.rataEx)}</td><td className="mono">{n1(per.semua?.kalahPasar)}</td><td /><td className="mono sj-n">{per.semua?.n.toLocaleString('id-ID')}</td></tr>
                                </tbody>
                            </table></div>
                            {(!per.gabLemah?.n || !per.fundJual?.n) && <small className="sb-note">Kelompok fundamental belum bisa diuji: riwayat laporan keuangan lampau belum tersedia di uji ini.</small>}
                            {ks?.longShort && (
                                <div className="sj-keranjang">
                                    <b>Keranjang bulanan · beli 10 teratas, short 10 terbawah</b>
                                    <div className="sj-grid">
                                        {([['Beli + short', ks.longShort], ['Beli 10 teratas saja', ks.longSaja], ['Short 10 terbawah saja', ks.shortSaja], ['Pegang S&P 500', ks.spy]] as const).map(([n, r]) => r && (
                                            <div key={n}><small>{n}</small><b className={`mono ${r.total >= 0 ? 'up' : 'down'}`}>{p(r.total, 1)}</b><em>{r.bulan} bulan · menang {n1(r.winrate)} bulan · PF {r.pf == null ? '–' : r.pf.toLocaleString('id-ID')} · turun maks {n1(r.ddMaks)}</em></div>
                                        ))}
                                    </div>
                                    <small className="sb-note">{ks.longShort.terbukti ? 'Beli + short terbukti positif (bukan kebetulan).' : 'Beli + short belum terbukti positif.'} Biaya transaksi & pinjam sudah dikurangi.</small>
                                </div>
                            )}
                            <small className="sb-note">{u.catatan} Uji {tgl(u.at)}.</small>
                        </div>
                    )}
                </>
            )}
            <div className="sj-kertas">
                <b>Uji kertas (sinyal nyata, dinilai ke depan)</b>
                {!k || !k.dicatat ? <small>Mulai mencatat di sesi bursa berikutnya. Angka pertama muncul ±{H === '60' ? '60' : '20'} hari bursa setelahnya.</small> : (
                    <small>Sejak {k.mulai ? tgl(k.mulai) : '–'} · {k.dicatat} catatan. {H === '60' ? '60' : '20'} hari: Jual kuat {kj?.n ? `${p(kj.rata)} vs S&P 500 (${kj.n} dinilai${kj.terbukti ? ', terbukti' : ''})` : 'belum ada yang cukup umur'} · Beli kuat {kb?.n ? `${p(kb.rata)} (${kb.n} dinilai${kb.terbukti ? ', terbukti' : ''})` : 'belum ada yang cukup umur'}.</small>
                )}
            </div>
        </section>
    );
}

/* Saham "kandidat lemah" (Jual kuat & sisi jual terbukti) — diisi halaman Trading, dibaca kartu & Portofolio. */
let lemah = new Set<string>();
const dengar = new Set<() => void>();
export function setKandidatLemah(xs: string[]) { const b = new Set(xs); if (b.size === lemah.size && [...b].every((x) => lemah.has(x))) return; lemah = b; dengar.forEach((f) => f()); }
export function useKandidatLemah() {
    const [, setV] = useState(0);
    React.useEffect(() => { const f = () => setV((x) => x + 1); dengar.add(f); return () => { dengar.delete(f); }; }, []);
    return lemah;
}
export function TandaLemah({ s }: { s: string }) {
    const l = useKandidatLemah();
    if (!l.has(s)) return null;
    return <span className="sj-tanda" title="Sinyal Jual kuat, dan uji data membuktikan saham berskor lemah rata-rata kalah dari S&P 500. Pertimbangkan untuk dihindari / tidak ditambah. Bukan saran jual.">Kandidat lemah · hindari</span>;
}
