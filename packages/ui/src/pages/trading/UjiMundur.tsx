import React, { useEffect, useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';

import { Ikon } from '../../components/Ikon';
type R = { n: number; rataEx: number | null; menang: number | null; galatStd: number | null };
interface HasilH { semua: R; label: Record<string, R>; kuintil: R[]; komponen: Array<R & { nama: string }>; preset: Array<{ id: string; guru: string; nama: string; lolos75: R; lolos50: R; kurang: R }> }
type UjiL = { label: Record<string, R>; semua: R; selisih: number; galat: number; t: number; tanggal: number };
type W = { k: string; t: string; w: number };
interface BobotH { lulus: boolean; latih: { dari: string; sampai: string; n: number }; uji: { dari: string; sampai: string; n: number; lambda: number; ic: number; baru: UjiL; lama: UjiL; alasan: string[] }; teratas: W[]; terbawah: W[] }
interface Hasil { bobot?: { batas: string; H: Record<string, BobotH> }; at: number; saham: number; gagal: number; sampel: number; periode: { dari: string; sampai: string }; catatan: string[]; H: Record<string, HasilH> }
interface Data { saran?: { teks: string | null } | null; berikutnya?: number; status: { jalan: boolean; progres: string; mulai: number; selesai: number; galat: string }; hasil: Hasil | null }

const MODE: Array<{ H: number; label: string }> = [{ H: 1, label: 'Day trading (1 hari)' }, { H: 5, label: 'Swing pendek (5 hari)' }, { H: 20, label: 'Swing (20 hari)' }, { H: 60, label: 'Posisi/Investasi (60 hari)' }];
const LABEL = ['Beli kuat', 'Beli', 'Tahan', 'Jual', 'Jual kuat'];
const p = (x: number | null, d = 2) => (x == null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}%`);
const bermakna = (a: R, base: R) => a.n >= 300 && a.rataEx != null && base.rataEx != null && a.rataEx - base.rataEx > 2 * (a.galatStd ?? 0);
const kelasEx = (x: number | null) => (x == null ? '' : x > 0 ? 'up' : x < 0 ? 'down' : '');

/** Hasil uji mundur: apakah skor & preset benar-benar mengalahkan pasar di masa lalu. */
export function UjiMundur({ sisipan }: { sisipan?: React.ReactNode } = {}) {
    const d = useApi<Data>('/api/kantor/ujimundur', 0);
    const [H, setH] = useState(20);
    const [msg, setMsg] = useState('');
    useEffect(() => { if (!d.data?.status.jalan) return; const t = setInterval(() => d.reload(), 10_000); return () => clearInterval(t); }, [d.data?.status.jalan]);
    const jalankan = async () => { setMsg(''); try { await apiPost('/api/kantor/ujimundur/jalankan', {}); d.reload(); } catch (e: any) { setMsg(String(e.message || e)); } };
    const st = d.data?.status, h = d.data?.hasil, r = h?.H[String(H)];
    const lbl = r ? LABEL.map((k) => ({ k, ...r.label[k] })) : [];
    const bk = r?.label['Beli kuat'], jk = r?.label['Jual kuat'];
    const urut = lbl.filter((x) => x.n >= 100 && x.rataEx != null).map((x) => x.rataEx as number);
    const menurun = urut.length >= 3 && urut.every((v, i) => i === 0 || v <= urut[i - 1] + 0.05);
    const vonis = !r ? '' : bk && jk && bk.n >= 100 && jk.n >= 100 && bk.rataEx! > jk.rataEx! + 2 * Math.hypot(bk.galatStd || 0, jk.galatStd || 0)
        ? (menurun ? '✅ Skor PUNYA daya pembeda: makin tinggi labelnya, makin baik hasilnya — berurutan rapi.' : '🟡 "Beli kuat" memang lebih baik dari "Jual kuat", tapi urutan label di tengah tidak rapi. Pakai label ekstrem saja.')
        : '❌ Skor BELUM terbukti: saham berlabel "Beli kuat" tidak jelas lebih baik dari "Jual kuat" untuk horison ini.';
    return (
        <div className="um">
            <section className="sb-card">
                <div className="sd-h"><h3><Ikon e="🧪" /> Uji mundur (backtest)</h3></div>
                <p className="sb-note">Skor teknikal & preset guru dihitung ulang di setiap tanggal selama ±5 tahun terakhir (hanya memakai data sampai tanggal itu), lalu dibandingkan dengan hasil sesudahnya — <b>dibanding S&P 500 pada periode yang sama, disesuaikan risiko</b> (saham yang biasa bergerak 1,5× pasar dibandingkan dengan 1,5× hasil S&P 500). Positif = mengalahkan pasar.</p>
                <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn primary" disabled={!!st?.jalan} onClick={jalankan}>{st?.jalan ? <><Ikon e="⏳" /> {'Sedang berjalan…'}</> : h ? <><Ikon e="↻" /> {'Jalankan ulang'}</> : '▶ Jalankan uji mundur'}</button>
                    <small className="sb-note">{st?.jalan ? `${st.progres} — ±20–40 menit, bisa ditinggal` : h ? `Terakhir: ${new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} · ${h.saham} saham · ${h.sampel.toLocaleString('id-ID')} sampel · ${h.periode.dari} s/d ${h.periode.sampai}` : 'Belum pernah dijalankan.'}</small>
                </div>
                {(st?.galat || msg) && <div className="error">{st?.galat || msg}</div>}
                {!!d.data?.berikutnya && !st?.jalan && <small className="sb-note"><Ikon e="🔁" /> Berjalan otomatis tiap ±30 hari (akhir pekan). Berikutnya: ±{new Date(d.data.berikutnya).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}. Bobot & rekomendasi di halaman Trading ikut diperbarui sendiri.</small>}
                {d.data?.saran?.teks && <div className="su-ai-box"><b><Ikon e="✨" /> Ringkasan AI</b><p>{d.data.saran.teks}</p></div>}
            </section>
            {sisipan}
            {h && r && (<>
                <div className="sb-seg scroll">{MODE.map((m) => <button key={m.H} className={H === m.H ? 'on' : ''} onClick={() => setH(m.H)}>{m.label}</button>)}</div>
                <section className="sb-card">
                    <div className="sd-h"><h3>Rumus lama: apakah skor teknikal berguna?</h3></div>
                    <p className="um-vonis">{vonis}</p>
                    <table className="um-t"><thead><tr><th>Label saat itu</th><th>Kasus</th><th>Rata-rata vs S&P 500</th><th>Mengalahkan pasar</th></tr></thead>
                        <tbody>
                            {lbl.map((x) => <tr key={x.k}><td>{x.k}</td><td className="mono">{x.n.toLocaleString('id-ID')}</td><td className={`mono ${kelasEx(x.rataEx)}`}>{p(x.rataEx)}</td><td className="mono">{x.menang ?? '–'}%</td></tr>)}
                            <tr className="um-base"><td>Semua saham</td><td className="mono">{r.semua.n.toLocaleString('id-ID')}</td><td className={`mono ${kelasEx(r.semua.rataEx)}`}>{p(r.semua.rataEx)}</td><td className="mono">{r.semua.menang}%</td></tr>
                        </tbody></table>
                    <p className="sb-note">Rata-rata per posisi selama {H} hari bursa, sudah disesuaikan risiko. Contoh: +0,50% artinya rata-rata unggul 0,5% dari S&P 500 dalam {H} hari.</p>
                </section>
                <BobotBaru b={h.bobot?.H[String(H)]} H={H} />
                <section className="sb-card">
                    <div className="sd-h"><h3>Preset guru (teknikal) — saham yang lolos ≥75% kriteria</h3></div>
                    <table className="um-t"><thead><tr><th>Preset</th><th>Kasus</th><th>Rata-rata vs S&P 500</th><th>Menang</th><th>Terbukti?</th></tr></thead>
                        <tbody>{[...r.preset].sort((a, b) => (b.lolos75.rataEx ?? -99) - (a.lolos75.rataEx ?? -99)).map((x) => {
                            const ok = bermakna(x.lolos75, r.semua) && (x.lolos75.rataEx ?? 0) > 0;
                            return <tr key={x.id}><td>{x.guru}<small> · {x.nama}</small></td><td className="mono">{x.lolos75.n.toLocaleString('id-ID')}</td><td className={`mono ${kelasEx(x.lolos75.rataEx)}`}>{p(x.lolos75.rataEx)}</td><td className="mono">{x.lolos75.menang ?? '–'}%</td><td>{x.lolos75.n < 300 ? <span className="pr-pct">kasus sedikit</span> : ok ? <span className="pr-pct ok">✓ ya</span> : <span className="pr-pct no">belum</span>}</td></tr>;
                        })}</tbody></table>
                    <p className="sb-note">"Terbukti" = mengalahkan pasar DAN rata-rata semua saham dengan selisih lebih dari 2× galat standar (kecil kemungkinan kebetulan), minimal 300 kasus. Preset yang terbukti dipakai sebagai rekomendasi berbasis data di panel preset.</p>
                </section>
                <BuktiIndikator r={r} H={H} />
                <section className="sb-card"><div className="sd-h"><h3>Catatan kejujuran</h3></div><ul className="sd-alasan">{h.catatan.map((c) => <li key={c}>{c}</li>)}</ul></section>
            </>)}
        </div>
    );
}

/** Hasil "bobot dari data": dilatih pada data lama, diuji pada data baru yang tidak dipakai saat melatih. */
function BobotBaru({ b, H }: { b?: BobotH; H: number }) {
    if (!b) return <section className="sb-card"><div className="sd-h"><h3><Ikon e="🧠" /> Bobot baru dari data</h3></div><p className="sb-note">Belum ada — jalankan ulang uji mundur supaya bobot dicari dari data & diuji. (Perlu cukup data sebelum dan sesudah 2025.)</p></section>;
    const th = (t: string) => t.slice(0, 4);
    const bar = (u: UjiL, k: string) => u.label[k];
    return (
        <section className="sb-card">
            <div className="sd-h"><h3><Ikon e="🧠" /> Bobot baru dari data</h3></div>
            <p className="sb-note">Bobot tiap ciri grafik <b>disusun dari data {th(b.latih.dari)}–{th(b.latih.sampai)}</b> ({b.latih.n.toLocaleString('id-ID')} kasus), lalu <b>diuji di data {th(b.uji.dari)}–{th(b.uji.sampai)}</b> ({b.uji.n.toLocaleString('id-ID')} kasus) yang sama sekali tidak dipakai saat menyusun — seperti ujian dengan soal baru.</p>
            <p className="um-vonis">{b.lulus ? <><Ikon e="✅" /> {`LULUS: dipakai otomatis sebagai skor teknikal untuk horison ±${H} hari.`}</> : <><Ikon e="❌" /> {`TIDAK LULUS: horison ±${H} hari tetap memakai rumus lama, diberi tanda "belum terbukti".`}</>}</p>
            {!b.lulus && !!b.uji.alasan.length && <ul className="sd-alasan">{b.uji.alasan.map((a) => <li key={a}>{a}</li>)}</ul>}
            <table className="um-t"><thead><tr><th>Di data uji {th(b.uji.dari)}–{th(b.uji.sampai)}</th><th>Bobot baru</th><th>Rumus lama</th></tr></thead>
                <tbody>
                    {LABEL.map((k) => <tr key={k}><td>{k}</td><td className={`mono ${kelasEx(bar(b.uji.baru, k)?.rataEx ?? null)}`}>{p(bar(b.uji.baru, k)?.rataEx ?? null)} <small>({(bar(b.uji.baru, k)?.n ?? 0).toLocaleString('id-ID')})</small></td><td className={`mono ${kelasEx(bar(b.uji.lama, k)?.rataEx ?? null)}`}>{p(bar(b.uji.lama, k)?.rataEx ?? null)} <small>({(bar(b.uji.lama, k)?.n ?? 0).toLocaleString('id-ID')})</small></td></tr>)}
                    <tr className="um-base"><td>"Beli kuat" − "Jual kuat"</td><td className={`mono ${kelasEx(b.uji.baru.selisih)}`}>{p(b.uji.baru.selisih)} <small>± {b.uji.baru.galat?.toFixed(2)}</small></td><td className={`mono ${kelasEx(b.uji.lama.selisih)}`}>{p(b.uji.lama.selisih)} <small>± {b.uji.lama.galat?.toFixed(2)}</small></td></tr>
                </tbody></table>
            <p className="sb-note">Lulus kalau selisih "Beli kuat" − "Jual kuat" lebih dari 2× galat (sudah memperhitungkan periode yang tumpang tindih), "Beli kuat" lebih baik dari rata-rata, dan urutan skor searah dengan hasil.</p>
            <div className="um-w">
                <div><b>Ciri yang paling menaikkan skor</b>{b.teratas.filter((x) => x.w > 0).map((x) => <div key={x.k}><span>{x.t}</span><b className="mono up">{p(x.w, 3)}</b></div>)}</div>
                <div><b>Ciri yang paling menurunkan skor</b>{b.terbawah.filter((x) => x.w < 0).map((x) => <div key={x.k}><span>{x.t}</span><b className="mono down">{p(x.w, 3)}</b></div>)}</div>
            </div>
            <p className="sb-note">Angka = pengaruh rata-rata ciri itu terhadap hasil vs saham lain dalam {H} hari bursa (sudah diperhitungkan bersama ciri lain).</p>
        </section>
    );
}

/** Bukti per indikator: tiap sinyal teknikal dikelompokkan menurut hasil uji mundur (dibanding rata-rata semua saham). */
function BuktiIndikator({ r, H }: { r: HasilH; H: number }) {
    const base = r.semua.rataEx ?? 0;
    const st = (k: HasilH['komponen'][number]) => { const beda = (k.rataEx ?? 0) - base; return k.n >= 300 && Math.abs(beda) > 2 * (k.galatStd ?? 0) ? (beda > 0 ? 'naik' : 'turun') : 'tidak'; };
    const grup: Array<{ k: 'naik' | 'turun' | 'tidak'; judul: string; ket: string }> = [
        { k: 'naik', judul: 'Terbukti naik', ket: 'diikuti hasil lebih baik dari rata-rata saham' },
        { k: 'turun', judul: 'Terbukti turun', ket: 'diikuti hasil lebih buruk dari rata-rata saham' },
        { k: 'tidak', judul: 'Belum terbukti', ket: 'bedanya terlalu kecil / kasusnya terlalu sedikit — bisa kebetulan' }
    ];
    const arahCocok = (k: HasilH['komponen'][number]) => { const s0 = st(k); return (k.nama[0] === '+' && s0 === 'naik') || (k.nama[0] !== '+' && s0 === 'turun'); };
    return (
        <section className="sb-card bk">
            <div className="sd-h"><h3>Bukti per indikator · {H} hari bursa</h3></div>
            <p className="sb-note">Setiap sinyal teknikal diuji sendiri-sendiri: saat sinyal itu muncul, bagaimana hasil saham {H} hari kemudian dibanding S&P 500 (disesuaikan risiko), lalu dibandingkan dengan rata-rata semua saham ({base >= 0 ? '+' : '−'}{Math.abs(base).toFixed(2)}%). <b>Terbukti</b> = selisihnya lebih dari 2× galat standar dengan minimal 300 kasus.</p>
            {grup.map((g) => {
                const xs = r.komponen.filter((k) => st(k) === g.k).sort((a, b) => (b.rataEx ?? 0) - (a.rataEx ?? 0));
                if (!xs.length) return null;
                return (
                    <div key={g.k} className={`bk-grup ${g.k}`}>
                        <h4>{g.judul} <small>{xs.length} sinyal · {g.ket}</small></h4>
                        {xs.map((k) => (
                            <div key={k.nama} className="bk-r">
                                <span>{k.nama.slice(2)}{g.k !== 'tidak' && <em className={arahCocok(k) ? 'ok' : 'lawan'}>{arahCocok(k) ? 'searah skor' : 'berlawanan dengan skor'}</em>}</span>
                                <b className={`mono ${kelasEx(k.rataEx)}`}>{p(k.rataEx)}</b>
                                <small className="mono">{k.n.toLocaleString('id-ID')} kasus</small>
                            </div>
                        ))}
                    </div>
                );
            })}
            <p className="sb-note">Sinyal yang <b>berlawanan dengan skor</b> (dihitung plus tapi hasilnya buruk, atau sebaliknya) dikecilkan/dibalik otomatis oleh "Bobot baru dari data" di atas — kalau bobot baru itu LULUS ujian di data 2025 ke atas. Tanda yang sama muncul di alasan skor teknikal tiap saham.</p>
        </section>
    );
}
