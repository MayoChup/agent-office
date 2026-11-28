import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tx, periode, dalam, rp, rpRingkas, arusDari, arusTotal, transfer, tujuanTransfer, kelompok } from './util';

type Bulan = { p: ReturnType<typeof periode>; masuk: number; keluar: number; bersih: number };
const simpan = (v: string) => { try { localStorage.setItem('kantor:keu-arus-n', v); } catch { /* */ } };
const baca = () => { try { return Number(localStorage.getItem('kantor:keu-arus-n')) || 0; } catch { return 0; } };

/**
 * Arus kas per bulan (periode gajian). Semua rekening: pindah dana antar rekening sendiri tidak dihitung.
 * Satu rekening: dana pindahan masuk/keluar ikut dihitung karena mengubah isi rekening itu.
 */
export function ArusKas({ tx, akun, mulai, geser, lihat }: { tx: Tx[]; akun: string; mulai: number; geser: number; lihat: (f: any) => void }) {
    const [n, setNS] = useState(() => baca() || (typeof window !== 'undefined' && window.innerWidth < 640 ? 6 : 12));
    const setN = (v: number) => { setNS(v); simpan(String(v)); };
    const bulan: Bulan[] = useMemo(() => Array.from({ length: n }, (_, i) => {
        const p = periode(mulai, geser - (n - 1) + i);
        return { p, ...arusTotal(tx.filter((t) => dalam(t, p)), akun) };
    }), [tx, akun, mulai, geser, n]);
    const [pilih, setPilih] = useState<number | null>(null);
    const idx = pilih !== null && pilih < bulan.length ? pilih : bulan.length - 1;
    const b = bulan[idx];
    const terisi = bulan.filter((x) => x.masuk || x.keluar);
    const rataBersih = terisi.length ? terisi.reduce((a, x) => a + x.bersih, 0) / terisi.length : 0;
    const terbaik = terisi.length ? terisi.reduce((a, x) => (x.bersih > a.bersih ? x : a)) : null;
    const rasio = b.masuk ? Math.round((b.bersih / b.masuk) * 100) : null;

    // Rincian bulan terpilih
    const isi = tx.filter((t) => dalam(t, b.p));
    const label = (t: Tx, arah: 'masuk' | 'keluar') => (transfer(t) ? `${arah === 'masuk' ? 'Dari' : 'Ke'} ${tujuanTransfer(t) || 'rekening lain'}` : arah === 'masuk' ? (t.pihak || t.kat || 'Pemasukan') : t.kat || 'Lainnya');
    const rinci = (arah: 'masuk' | 'keluar') => Array.from(kelompok(isi.filter((t) => arusDari(t, akun)[arah] > 0), (t) => label(t, arah)).entries())
        .map(([k, v]) => ({ k, v: v.reduce((a, t) => a + t.n, 0), n: v.length, pindah: v.every(transfer), kat: v[0].kat })).sort((x, y) => y.v - x.v);
    const sumber = rinci('masuk'), tujuan = rinci('keluar');

    return (
        <div className="ku-grid">
            <section className="ku-card ku-lebar ku-arus">
                <div className="ku-card-h">
                    <h3>Arus kas per bulan{akun ? ` · ${akun}` : ''}</h3>
                    <div className="ku-seg">{[6, 12].map((v) => <button key={v} className={n === v ? 'on' : ''} onClick={() => { setN(v); setPilih(null); }}>{v} bulan</button>)}</div>
                </div>
                <div className="ku-legend"><span><i className="ku-dot in" />Masuk</span><span><i className="ku-dot out" />Keluar</span><span><i className="ku-garis" />Bersih</span></div>
                <GrafikArus data={bulan} aktif={idx} pilih={setPilih} />
                <div className="ku-stat3">
                    <div><small>Rata-rata bersih</small><b className={`mono ${rataBersih < 0 ? 'neg' : ''}`}>{rataBersih >= 0 ? '+' : ''}{rp(rataBersih)}</b><em>{terisi.length} bulan berisi data</em></div>
                    <div><small>Bulan terbaik</small><b>{terbaik ? terbaik.p.pendek : '–'}</b>{terbaik && <em className="mono">{terbaik.bersih >= 0 ? '+' : ''}{rp(terbaik.bersih)}</em>}</div>
                    <div><small>Disisihkan {b.p.pendek}</small><b className={`mono ${rasio !== null && rasio < 0 ? 'neg' : ''}`}>{rasio === null ? '–' : `${rasio}%`}</b><em>dari uang masuk</em></div>
                </div>
            </section>

            <section className="ku-card ku-lebar">
                <div className="ku-card-h"><h3>{b.p.label}</h3><small>ketuk bulan di grafik untuk ganti</small></div>
                <div className="ku-io ku-io-3">
                    <div><small><i className="ku-dot in" />Masuk</small><b className="mono">{rp(b.masuk)}</b></div>
                    <div><small><i className="ku-dot out" />Keluar</small><b className="mono">{rp(b.keluar)}</b></div>
                    <div><small>Bersih</small><b className={`mono ${b.bersih < 0 ? 'neg' : ''}`}>{b.bersih >= 0 ? '+' : ''}{rp(b.bersih)}</b></div>
                </div>
                <div className="ku-dua">
                    <Rincian judul="Uang masuk dari" data={sumber} total={b.masuk} kelas="in" klik={(g) => lihat(g.pindah ? { jenis: 'Antar Rekening' } : { jenis: 'Masuk', pihak: g.k })} />
                    <Rincian judul="Uang keluar untuk" data={tujuan} total={b.keluar} kelas="out" klik={(g) => lihat(g.pindah ? { jenis: 'Antar Rekening' } : { jenis: 'Keluar', kat: g.k })} />
                </div>
            </section>

            <section className="ku-card ku-lebar">
                <div className="ku-card-h"><h3>Tabel bulanan</h3><small>{akun || 'semua rekening'}</small></div>
                <div className="ku-tabel" role="table">
                    <div className="ku-tr kepala" role="row"><span role="columnheader">Bulan</span><span role="columnheader">Masuk</span><span role="columnheader">Keluar</span><span role="columnheader">Bersih</span></div>
                    {[...bulan].map((x, i) => ({ x, i })).reverse().map(({ x, i }) => (
                        <button key={x.p.start} className={`ku-tr ${i === idx ? 'on' : ''}`} role="row" onClick={() => setPilih(i)}>
                            <span role="cell">{x.p.pendek}</span>
                            <span role="cell" className="mono">{rpRingkas(x.masuk)}</span>
                            <span role="cell" className="mono">{rpRingkas(x.keluar)}</span>
                            <span role="cell" className={`mono ${x.bersih < 0 ? 'neg' : 'pos'}`}>{x.bersih > 0 ? '+' : ''}{rpRingkas(x.bersih)}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

function Rincian({ judul, data, total, kelas, klik }: { judul: string; data: Array<{ k: string; v: number; n: number; pindah: boolean }>; total: number; kelas: string; klik: (g: any) => void }) {
    const atas = data.slice(0, 6), sisa = data.slice(6);
    const max = Math.max(1, ...atas.map((g) => g.v));
    return (
        <div className="ku-rinci">
            <h4>{judul}</h4>
            {data.length === 0 && <p className="ku-muted">Belum ada.</p>}
            {atas.map((g) => (
                <button key={g.k} className="ku-rinci-baris" onClick={() => klik(g)}>
                    <span className="ku-rinci-t"><b>{g.k}</b><span className="mono">{rp(g.v)}</span></span>
                    <span className="ku-meter"><i className={kelas} style={{ width: `${(g.v / max) * 100}%` }} /></span>
                    <small>{g.n} transaksi · {total ? Math.round((g.v / total) * 100) : 0}%</small>
                </button>
            ))}
            {sisa.length > 0 && <p className="ku-muted">+ {sisa.length} lainnya · {rp(sisa.reduce((a, g) => a + g.v, 0))}</p>}
        </div>
    );
}

/** Batang cermin: masuk ke atas, keluar ke bawah, garis bersih di atasnya. Satu skala untuk keduanya. */
function GrafikArus({ data, aktif, pilih }: { data: Bulan[]; aktif: number; pilih: (i: number) => void }) {
    // Lebar SVG = lebar kotak sebenarnya, supaya teks sumbu tetap 11px di HP (tidak ikut mengecil).
    const ref = useRef<HTMLDivElement>(null);
    const [W, setW] = useState(640);
    useEffect(() => {
        const el = ref.current; if (!el) return;
        const ukur = () => setW(Math.max(260, Math.round(el.clientWidth)));
        ukur(); const ro = new ResizeObserver(ukur); ro.observe(el); return () => ro.disconnect();
    }, []);
    const H = W < 480 ? 200 : 240, kiri = 44, atasPad = 8, bawahLabel = 24;
    const maxIn = Math.max(0, ...data.map((d) => d.masuk)), maxOut = Math.max(0, ...data.map((d) => d.keluar));
    const skala = Math.max(1, maxIn, maxOut, ...data.map((d) => Math.abs(d.bersih)));
    const atasN = Math.max(maxIn, ...data.map((d) => d.bersih)), bawahN = Math.max(maxOut, ...data.map((d) => -d.bersih));
    const tinggi = H - atasPad - bawahLabel;
    const rentang = Math.max(1, atasN) + Math.max(1, bawahN);
    const y0 = atasPad + (Math.max(1, atasN) / rentang) * tinggi;
    const py = (v: number) => y0 - (v / rentang) * tinggi;
    const lebar = (W - kiri) / data.length, bw = Math.min(26, lebar * 0.5);
    const tik = [Math.max(1, atasN), -Math.max(1, bawahN)].filter((v) => Math.abs(v) > skala * 0.05);
    const titik = data.map((d, i) => [kiri + i * lebar + lebar / 2, py(d.bersih)] as const);
    return (
        <div ref={ref} className="ku-grafik-wrap"><svg className="ku-grafik" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik arus kas per bulan">
            <line x1={kiri} x2={W} y1={y0} y2={y0} className="ku-nol" />
            {tik.map((v) => <g key={v}><line x1={kiri} x2={W} y1={py(v)} y2={py(v)} className="ku-kisi" /><text x={kiri - 6} y={py(v) + 4} textAnchor="end" className="ku-sumbu">{v < 0 ? '−' : ''}{rpRingkas(Math.abs(v))}</text></g>)}
            <text x={kiri - 6} y={y0 + 4} textAnchor="end" className="ku-sumbu">0</text>
            {data.map((d, i) => {
                const x = kiri + i * lebar + lebar / 2, on = i === aktif;
                const hIn = y0 - py(d.masuk), hOut = py(-d.keluar) - y0;
                return (
                    <g key={d.p.start} className={`ku-kol ${on ? 'on' : ''}`} onClick={() => pilih(i)}>
                        <rect x={kiri + i * lebar} y={atasPad} width={lebar} height={tinggi} className="ku-hit" />
                        {hIn > 0 && <rect x={x - bw / 2} y={y0 - hIn} width={bw} height={hIn} rx={3} className="ku-b-in" />}
                        {hOut > 0 && <rect x={x - bw / 2} y={y0} width={bw} height={hOut} rx={3} className="ku-b-out" />}
                        <text x={x} y={H - 6} textAnchor="middle" className={`ku-sumbu ${on ? 'on' : ''}`}>{d.p.pendek.split(' ')[0]}</text>
                        <title>{`${d.p.label}\nMasuk ${rp(d.masuk)}\nKeluar ${rp(d.keluar)}\nBersih ${rp(d.bersih)}`}</title>
                    </g>
                );
            })}
            <polyline points={titik.map((t) => t.join(',')).join(' ')} className="ku-bersih-garis" />
            {titik.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === aktif ? 4.5 : 3} className={`ku-bersih-titik ${i === aktif ? 'on' : ''}`} />)}
        </svg></div>
    );
}
