import React, { useMemo, useState } from 'react';
import { useApi } from '../kantor/api';
import { apiPost } from '../kantor/connection';

type Status = 'todo' | 'proses' | 'selesai' | 'gagal';
interface Kerja { id: string; ai: string; nama: string; judul: string; detail?: string; hasil?: string; sumber: 'chat' | 'tugas' | 'sistem' | 'trading' | 'laporan'; status: Status; dibuat: number; mulai?: number; selesai?: number }
interface StatAi { id: string; nama: string; peran: string; selesai: number; gagal: number; proses: number; todo: number; rataDetik: number | null; terakhir: number; selesai7: number; menganggur: boolean; peringkat: number }
interface Usulan { id: string; ai: string; nama: string; judul: string; isi: string; alasan: string; status: 'menunggu' | 'disetujui' | 'ditolak'; dibuat: number }
interface HrData { hari: number; stat: StatAi[]; review: Array<{ at: number; oleh: string; hari: number; teks: string }>; usulan: Usulan[]; reviewBerikut: number; sibuk: string; adaHr: boolean }
interface Data { menunggu?: number; bulan: string; bulanIni: string; daftarBulan: string[]; items: Kerja[]; anggota: Array<{ id: string; nama: string }> }

const KOLOM: Array<{ k: 'todo' | 'proses' | 'selesai'; label: string; ket: string }> = [
    { k: 'todo', label: 'To do', ket: 'menunggu giliran' },
    { k: 'proses', label: 'Proses', ket: 'sedang dikerjakan' },
    { k: 'selesai', label: 'Selesai', ket: 'beres bulan ini' }
];
const SUMBER: Record<Kerja['sumber'], string> = { chat: '💬 Chat', tugas: '📋 Tugas', sistem: '⚙️ Sistem', trading: '📈 Trading', laporan: '📝 Laporan' };
const namaBulan = (b: string) => new Date(`${b}-15T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const jam = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const hari = (t: number) => new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' });
const kunciHari = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
function lama(ms: number) { const d = Math.max(0, Math.round(ms / 1000)); return d < 60 ? `${d} dtk` : d < 3600 ? `${Math.round(d / 60)} mnt` : `${(d / 3600).toFixed(1)} jam`; }
function lalu(t: number) { const d = Math.round((Date.now() - t) / 1000); return d < 60 ? 'baru saja' : d < 3600 ? `${Math.round(d / 60)} mnt lalu` : d < 86400 ? `${Math.round(d / 3600)} jam lalu` : `${Math.round(d / 86400)} hari lalu`; }
const warna = (id: string) => `hsl(${[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)} 55% 45%)`;

/** Papan kerja AI: apa yang menunggu, sedang dikerjakan, dan sudah selesai. Riwayat sebulan; ganti bulan = papan baru. */
export function PapanPanel({ onClose }: { onClose: () => void }) {
    const [bulan, setBulan] = useState('');
    const d = useApi<Data>(`/api/kantor/papan${bulan ? `?bulan=${bulan}` : ''}`, 8000);
    const [ai, setAi] = useState('');
    const [sumber, setSumber] = useState('');
    const [kolomHp, setKolomHp] = useState<'todo' | 'proses' | 'selesai'>('selesai');
    const [buka, setBuka] = useState<string | null>(null);
    const [tampil, setTampil] = useState<'papan' | 'kinerja'>('papan');
    const hr = useApi<HrData>('/api/kantor/hr', 15000);
    const [pesan, setPesan] = useState('');
    const tunggu = (hr.data?.usulan || []).filter((u) => u.status === 'menunggu');

    const items = useMemo(() => (d.data?.items || []).filter((k) => (!ai || k.ai === ai) && (!sumber || k.sumber === sumber)), [d.data, ai, sumber]);
    const per = useMemo(() => ({
        todo: items.filter((k) => k.status === 'todo').sort((a, b) => a.dibuat - b.dibuat),
        proses: items.filter((k) => k.status === 'proses').sort((a, b) => (a.mulai || a.dibuat) - (b.mulai || b.dibuat)),
        selesai: items.filter((k) => k.status === 'selesai' || k.status === 'gagal').sort((a, b) => (b.selesai || b.dibuat) - (a.selesai || a.dibuat))
    }), [items]);
    const perAi = useMemo(() => { const m = new Map<string, { nama: string; n: number }>(); for (const k of d.data?.items || []) { if (k.status !== 'selesai') continue; const e = m.get(k.ai) || { nama: k.nama, n: 0 }; e.n++; m.set(k.ai, e); } return [...m.entries()].sort((a, b) => b[1].n - a[1].n); }, [d.data]);
    const arsip = !!d.data && d.data.bulan !== d.data.bulanIni;

    const kartu = (k: Kerja) => (
        <button key={k.id} className={`pk-kartu ${k.status} ${buka === k.id ? 'buka' : ''}`} onClick={() => setBuka(buka === k.id ? null : k.id)}>
            <div className="pk-atas">
                <span className="pk-av" style={{ background: warna(k.ai) }}>{k.nama.slice(0, 1).toUpperCase()}</span>
                <span className="pk-nama">{k.nama}</span>
                <span className="pk-sumber">{SUMBER[k.sumber]}</span>
            </div>
            <div className="pk-judul">{k.judul}</div>
            {k.detail && <div className="pk-detail">{k.detail}</div>}
            {buka === k.id && k.hasil && <div className="pk-hasil"><b>{k.status === 'gagal' ? 'Kendala' : 'Hasil'}:</b> {k.hasil}</div>}
            <div className="pk-bawah">
                {k.status === 'todo' && <span>masuk {lalu(k.dibuat)}</span>}
                {k.status === 'proses' && <span className="pk-jalan"><i /> berjalan {lama(Date.now() - (k.mulai || k.dibuat))}</span>}
                {(k.status === 'selesai' || k.status === 'gagal') && <span>{jam(k.selesai || k.dibuat)}{k.mulai && k.selesai ? ` · ${lama(k.selesai - k.mulai)}` : ''}</span>}
                {k.status === 'gagal' && <em className="pk-gagal">gagal</em>}
                {k.hasil && buka !== k.id && <em className="pk-lihat">lihat hasil</em>}
            </div>
        </button>
    );
    const isiKolom = (kk: 'todo' | 'proses' | 'selesai') => {
        const list = per[kk];
        if (!list.length) return <div className="pk-kosong">{kk === 'todo' ? 'Tidak ada antrean.' : kk === 'proses' ? 'Tidak ada yang sedang dikerjakan.' : 'Belum ada yang selesai.'}</div>;
        if (kk !== 'selesai') return list.map(kartu);
        const out: React.ReactNode[] = []; let h = '';
        for (const k of list.slice(0, 400)) { const kh = kunciHari(k.selesai || k.dibuat); if (kh !== h) { h = kh; out.push(<div key={`h${kh}`} className="pk-hari">{hari(k.selesai || k.dibuat)}</div>); } out.push(kartu(k)); }
        if (list.length > 400) out.push(<div key="lebih" className="pk-kosong">+{list.length - 400} pekerjaan lain bulan ini.</div>);
        return out;
    };

    return (
        <div className="papan interactive">
            <header className="pk-head">
                <div className="pk-judul-besar">
                    <h2>🗂️ Papan kerja AI</h2>
                    <small>{d.data ? `${namaBulan(d.data.bulan)}${arsip ? ' · arsip' : ' · papan dibersihkan otomatis tiap awal bulan (yang lama masuk arsip)'}` : 'memuat…'}</small>
                </div>
                <div className="pk-saring">
                    <select value={bulan || d.data?.bulan || ''} onChange={(e) => setBulan(e.target.value === d.data?.bulanIni ? '' : e.target.value)} aria-label="Bulan">
                        {(d.data?.daftarBulan || []).map((b) => <option key={b} value={b}>{namaBulan(b)}{b === d.data?.bulanIni ? ' (sekarang)' : ''}</option>)}
                    </select>
                    <select value={ai} onChange={(e) => setAi(e.target.value)} aria-label="AI">
                        <option value="">Semua AI</option>
                        {(d.data?.anggota || []).map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}
                    </select>
                    <select value={sumber} onChange={(e) => setSumber(e.target.value)} aria-label="Jenis">
                        <option value="">Semua jenis</option>
                        {Object.entries(SUMBER).filter(([k]) => k !== 'laporan').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="icon-btn" onClick={onClose} title="Tutup">✕</button>
                </div>
            </header>
            {perAi.length > 0 && (
                <div className="pk-rekap">
                    <span>Selesai bulan ini:</span>
                    {perAi.map(([id, e]) => <button key={id} className={ai === id ? 'on' : ''} onClick={() => setAi(ai === id ? '' : id)}><i style={{ background: warna(id) }} />{e.nama} <b>{e.n}</b></button>)}
                </div>
            )}
            {d.error && <div className="error">{d.error}</div>}
            <div className="pk-mode">
                <div className="sb-seg"><button className={tampil === 'papan' ? 'on' : ''} onClick={() => setTampil('papan')}>Papan</button><button className={tampil === 'kinerja' ? 'on' : ''} onClick={() => setTampil('kinerja')}>Kinerja & HR</button></div>
                {tunggu.length > 0 && <span className="pk-tunggu">🔔 {tunggu.length} usulan tugas menunggu persetujuan Bapak</span>}
            </div>
            {pesan && <div className="fin-alert">{pesan}</div>}
            {tunggu.length > 0 && <Persetujuan list={tunggu} onSelesai={(m) => { setPesan(m); hr.reload(); d.reload(); setTimeout(() => setPesan(''), 6000); }} />}
            {tampil === 'kinerja' && hr.data && <Kinerja h={hr.data} onJalan={(jenis) => jenis === 'muat' ? (setPesan('✓ Hana (HR Officer) ditambahkan. Muncul di kantor dalam ±1 menit.'), void setTimeout(() => hr.reload(), 1500)) : apiPost('/api/kantor/hr/jalankan', { jenis }).then(() => { setPesan(jenis === 'cek' ? 'Cek mingguan dijalankan — Joni akan mengirim hasilnya ke chat pribadi Bapak.' : 'Review HR dijalankan — hasilnya muncul di Grup Kantor & di sini.'); setTimeout(() => hr.reload(), 4000); }).catch((e) => setPesan(String(e.message || e)))} />}
            {tampil === 'papan' && <>
            <div className="pk-tab">{KOLOM.map((c) => <button key={c.k} className={kolomHp === c.k ? 'on' : ''} onClick={() => setKolomHp(c.k)}>{c.label} <b>{per[c.k].length}</b></button>)}</div>
            <div className="pk-grid">
                {KOLOM.map((c) => (
                    <section key={c.k} className={`pk-kolom k-${c.k} ${kolomHp === c.k ? 'tampil' : ''}`}>
                        <div className="pk-kh"><b>{c.label}</b><span>{per[c.k].length}</span><small>{c.ket}</small></div>
                        <div className="pk-isi">{isiKolom(c.k)}</div>
                    </section>
                ))}
            </div>
            </>}
        </div>
    );
}

/** Usulan tugas dari Joni untuk AI yang menganggur — baru dikirim setelah Pak Rico setuju. */
function Persetujuan({ list, onSelesai }: { list: Usulan[]; onSelesai: (m: string) => void }) {
    const [ubah, setUbah] = useState<Record<string, { judul: string; isi: string }>>({});
    const [sibuk, setSibuk] = useState('');
    const putus = (u: Usulan, aksi: 'setuju' | 'tolak') => {
        setSibuk(u.id);
        apiPost(`/api/kantor/hr/usulan/${u.id}`, { aksi, ...(ubah[u.id] || {}) }).then(() => onSelesai(aksi === 'setuju' ? `✓ Tugas untuk ${u.nama} dikirim.` : `Usulan untuk ${u.nama} ditolak.`)).catch((e) => onSelesai(String(e.message || e))).finally(() => setSibuk(''));
    };
    return (
        <div className="pk-setuju">
            {list.map((u) => {
                const e = ubah[u.id];
                return (
                    <div key={u.id} className="pk-usul">
                        <div className="pk-atas"><span className="pk-av" style={{ background: warna(u.ai) }}>{u.nama.slice(0, 1).toUpperCase()}</span><span className="pk-nama">Untuk {u.nama}</span><span className="pk-sumber">usulan Joni · {lalu(u.dibuat)}</span></div>
                        {e ? (<>
                            <input value={e.judul} maxLength={120} onChange={(x) => setUbah({ ...ubah, [u.id]: { ...e, judul: x.target.value } })} aria-label="Judul tugas" />
                            <textarea value={e.isi} rows={3} maxLength={600} onChange={(x) => setUbah({ ...ubah, [u.id]: { ...e, isi: x.target.value } })} aria-label="Isi tugas" />
                        </>) : (<><div className="pk-judul">{u.judul}</div><div className="pk-detail">{u.isi}</div></>)}
                        <small className="pk-alasan">Alasan: {u.alasan}</small>
                        <div className="pk-aksi">
                            <button className="btn small primary" disabled={sibuk === u.id} onClick={() => putus(u, 'setuju')}>✓ Setujui & kirim</button>
                            {!e && <button className="btn small" onClick={() => setUbah({ ...ubah, [u.id]: { judul: u.judul, isi: u.isi } })}>✏️ Ubah dulu</button>}
                            <button className="btn small" disabled={sibuk === u.id} onClick={() => putus(u, 'tolak')}>Tolak</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** Perbandingan kinerja tiap AI + review HR terakhir. */
function Kinerja({ h, onJalan }: { h: HrData; onJalan: (jenis: 'review' | 'cek' | 'muat') => void }) {
    const maks = Math.max(1, ...h.stat.map((s) => s.selesai));
    const r = h.review[0];
    return (
        <div className="pk-kinerja">
            <section className="pk-kotak">
                <div className="pk-kh2"><b>Perbandingan {h.hari} hari terakhir</b><small>dihitung dari Papan kerja — angka pasti, bukan penilaian AI</small></div>
                <div className="pk-tabel">
                    {h.stat.map((s) => (
                        <div key={s.id} className={`pk-baris ${s.menganggur ? 'ngg' : ''}`}>
                            <span className="pk-rk">{s.peringkat}</span>
                            <span className="pk-av" style={{ background: warna(s.id) }}>{s.nama.slice(0, 1).toUpperCase()}</span>
                            <div className="pk-siapa"><b>{s.nama}</b><small>{s.peran || s.id}</small></div>
                            <div className="pk-batang"><i style={{ width: `${(s.selesai / maks) * 100}%` }} /></div>
                            <div className="pk-angka"><b>{s.selesai}</b> selesai{s.gagal > 0 && <em> · {s.gagal} gagal</em>}{s.proses + s.todo > 0 && <span> · {s.proses + s.todo} berjalan/antre</span>}</div>
                            <div className="pk-ket">{s.menganggur ? <em className="pk-gagal">menganggur 7 hari</em> : s.terakhir ? `terakhir ${lalu(s.terakhir)}` : 'belum ada catatan'}</div>
                        </div>
                    ))}
                </div>
                <small className="pk-alasan">"Menganggur" = 7 hari tidak menyelesaikan apa pun dan tidak sedang mengerjakan atau antre apa pun. Tiap Senin Joni mengecek; kalau ada yang menganggur, dia mengusulkan tugas dan meminta persetujuan Bapak lewat chat pribadi.</small>
            </section>
            <section className="pk-kotak">
                <div className="pk-kh2"><b>Review HR Officer</b><small>tiap {h.hari} hari · berikutnya ±{new Date(h.reviewBerikut).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })}</small></div>
                {!h.adaHr && <div className="hz-bukti">ℹ️ <span>AI "HR Officer" (Hana) belum ada di kantor — sementara review ditulis otak AI kantor. <button className="btn small primary" onClick={() => apiPost<{ pesan: string }>('/api/kantor/hr/pasang', {}).then(() => onJalan('muat')).catch((e) => alert(String(e.message || e)))}>Tambahkan Hana ke kantor</button></span></div>}
                {r ? <><div className="pk-review">{r.teks}</div><small className="pk-alasan">{r.oleh} · {new Date(r.at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}</small></> : <div className="pk-kosong">Belum ada review. Review pertama berjalan otomatis setelah ada data ±seminggu.</div>}
                <div className="pk-aksi">
                    <button className="btn small" disabled={!!h.sibuk} onClick={() => onJalan('review')}>{h.sibuk === 'review' ? 'Sedang direview…' : 'Jalankan review sekarang'}</button>
                    <button className="btn small" disabled={!!h.sibuk} onClick={() => onJalan('cek')}>{h.sibuk === 'cek' ? 'Sedang dicek…' : 'Cek siapa menganggur'}</button>
                </div>
            </section>
        </div>
    );
}
