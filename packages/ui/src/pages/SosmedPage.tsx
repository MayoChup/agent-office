import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../kantor/api';
import { apiPost, serverBase, tokenLogin } from '../kantor/connection';
import { useSubNav } from '../kantor/subnav';
import { useInterval } from '../kantor/aktif';

type Format = 'feed' | 'reel' | 'carousel' | 'story';
type Status = 'rencana' | 'naskah' | 'prompt' | 'aset' | 'terjadwal' | 'mengunggah' | 'terbit' | 'manual' | 'gagal';
interface Adegan { no: number; detik: string; visual: string; teksLayar: string; narasi: string; sfx?: string }
interface Hasil { at: number; sumber: 'ig' | 'manual'; umurJam: number; tayang?: number; jangkauan?: number; suka?: number; komentar?: number; simpan?: number; bagikan?: number; ikuti?: number }
interface Aset { path: string; nama: string }
interface Konten {
    id: string; tgl: string; pilar: string; format: Format; judul: string; sudut: string; tujuan: string; dasar?: string; gayaId?: string;
    sudutPilihan?: Array<{ sudut: string; hook: string; scroll: number; relevansi: number; skor: number }>; hook?: string; hookLain?: string[]; naskah?: string; voiceover?: string; jumlahKata?: number;
    storyboard?: Adegan[]; subtitle?: string[]; slide?: Array<{ no: number; judul: string; isi: string; visual: string }>;
    caption?: string; hashtag?: string[]; ajakan?: string; captionTiktok?: string; youtube?: { judul: string; deskripsi: string };
    promptVideo?: string; promptGambar?: string; rekam?: string; promptEdit?: string; promptSuara?: { teks: string; gaya: string; pengaturan: string }; musik?: string; sampul?: string;
    status: Status; jam?: string; aset?: Aset | null; asetLain?: Aset[]; ig?: { tautan?: string; at: number } | null; hasil?: Hasil[]; evaluasi?: { at: number; nilai: 'bagus' | 'biasa' | 'kurang'; teks: string } | null; galat?: string;
}
interface Gaya { id: string; nama: string; jenis: 'real' | 'animasi'; deskripsi: string; contoh?: Aset | null; bawaan?: boolean }
interface Profil { akun: string; topik: string; audiens: string; tujuan: string; gaya: string; bahasa: string; perMinggu: number; format: string[]; durasi: number; suara: string; catatan: string; gayaVideo: string }
interface Strategi { at: number; niche: string; alasan: string; audiens: string; janji: string; ritme: string; jam: string; jadwal: Format[][]; pilar: Array<{ nama: string; tujuan: string; porsi: number; contoh: string[] }>; opsiNiche?: Array<{ niche: string; alasan: string }> }
interface Analisa { at: number; ringkas: string; masalah: string[]; pertanyaan: string[]; berhasil: string[]; celah: string[]; acuan: Array<{ akun: string; alasan: string }>; formatTerbaik: string; jamTerbaik: string; sumber: string }
interface Komentar { id: string; judul?: string; user: string; teks: string; at: number; draf?: string; status: string; galat?: string }
interface Rata { n: number; tayang?: number; jangkauan?: number; suka?: number; komentar?: number; simpan?: number; bagikan?: number }
interface Data {
    profil: Profil; strategi: Strategi | null; jadwal: Format[][]; analisa: Analisa | null; pelajaran: { at: number; ringkas: string; poin: string[] } | null; gaya: Gaya[];
    hariIni: Konten[]; besok: Konten[]; semua: Konten[]; terbit: Konten[]; komentar: Komentar[]; rata: Rata;
    hari: string; sibuk: string; siap: boolean; tim: Array<{ id: string; nama: string; ada: boolean }>; ig: boolean;
}
type Aksi = (p: Promise<any>, ok?: string) => void;

const LS = 'kantor:sosmed-tab';
const FMT: Record<Format, { label: string; ico: string; pendek: string }> = { reel: { label: 'Reel', ico: '🎞️', pendek: 'R' }, feed: { label: 'Feed', ico: '🖼️', pendek: 'F' }, carousel: { label: 'Carousel', ico: '🗂️', pendek: 'C' }, story: { label: 'Story', ico: '⭕', pendek: 'S' } };
const FORMAT_URUT: Format[] = ['reel', 'feed', 'carousel', 'story'];
const LANGKAH: Array<{ s: Status[]; label: string }> = [{ s: ['rencana'], label: 'Ide' }, { s: ['naskah'], label: 'Naskah' }, { s: ['prompt'], label: 'Prompt siap' }, { s: ['aset', 'gagal'], label: 'Berkas masuk' }, { s: ['terjadwal', 'mengunggah', 'manual'], label: 'Dijadwalkan' }, { s: ['terbit'], label: 'Terbit' }];
const SIBUK: Record<string, string> = { analisa: 'Tara sedang menganalisa niche…', strategi: 'Tara menganalisa niche, lalu Maya menyusun strategi & jadwal…', rencana: 'Maya sedang mengisi kalender…', naskah: 'Lala menulis naskah, lalu Vino menyiapkan prompt…', harian: 'Tim menyiapkan konten hari ini & besok…', hasil: 'Mengambil angka hasil dari Instagram…', komentar: 'Mengambil komentar & menyiapkan draf balasan…', evaluasi: 'Maya sedang menganalisa hasil postingan…', pelajaran: 'Maya menarik pelajaran dari semua postingan…' };
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const tglId = (t: string, opt: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { ...opt, timeZone: 'UTC' });
const tambah = (t: string, n: number) => new Date(Date.parse(`${t}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const angka = (n?: number) => (n == null ? '–' : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}rb` : n.toLocaleString('id-ID'));
const jamK = (k: Konten, x: Data) => (k.jam || x.strategi?.jam || '19:00').padStart(5, '0');
const waktuK = (k: Konten, x: Data) => Date.parse(`${k.tgl}T${jamK(k, x)}:00+07:00`);
const kapan = (k: Konten, x: Data) => `${tglId(k.tgl, { weekday: 'short', day: 'numeric', month: 'short' })} · ${jamK(k, x)}`;
const cocok = (f: File, k: Konten) => (f.type.startsWith('video/') ? k.format === 'reel' || k.format === 'story' || k.format === 'carousel' : k.format !== 'reel');
const akhir = (k: Konten) => k.hasil?.slice().sort((a, b) => b.umurJam - a.umurJam)[0];

function Salin({ teks, label = 'Salin' }: { teks: string; label?: string }) {
    const [ok, setOk] = useState(false);
    return <button className="btn small" onClick={() => { navigator.clipboard?.writeText(teks).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }).catch(() => undefined); }}>{ok ? '✓ Tersalin' : `📋 ${label}`}</button>;
}
function Fmt({ f }: { f: Format }) { return <span className={`sm-fmt f-${f}`}>{FMT[f].ico} {FMT[f].label}</span>; }
async function unggahBerkas(folder: string, f: File, onPct: (n: number) => void): Promise<{ path: string }> {
    return new Promise((ok, gagal) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${serverBase()}/api/kantor/berkas/unggah?p=${encodeURIComponent(folder)}&nama=${encodeURIComponent(f.name)}&ukuran=${f.size}`);
        xhr.setRequestHeader('Authorization', `Bearer ${tokenLogin()}`); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => { let j: any = {}; try { j = JSON.parse(xhr.responseText); } catch { /* */ } if (xhr.status < 300) ok(j); else gagal(new Error(j.error || `HTTP ${xhr.status}`)); };
        xhr.onerror = () => gagal(new Error('Koneksi terputus')); xhr.send(f);
    });
}

/** Divisi Social Media: tim AI menganalisa & merencanakan; Pak Rico produksi; unggah setelah disetujui; hasil dianalisa. */
export function SosmedPage() {
    const d = useApi<Data>('/api/kantor/sosmed', 60_000);
    const x = d.data;
    const nAntre = x?.semua.filter((k) => k.tgl >= x.hari && ['prompt', 'aset', 'gagal'].includes(k.status)).length || 0;
    const nKom = x?.komentar.filter((c) => c.status === 'draf' || c.status === 'baru').length || 0;
    const TAB = useMemo(() => [
        { k: 'hari', ico: '🎬', label: 'Hari ini' }, { k: 'antre', ico: '📤', label: 'Antrean unggah', badge: nAntre || undefined }, { k: 'kalender', ico: '🗓️', label: 'Kalender' }, { k: 'analisa', ico: '🔎', label: 'Analisa niche' }, { k: 'strategi', ico: '🧭', label: 'Strategi' },
        { k: 'gaya', ico: '🎨', label: 'Gaya video' }, { k: 'kinerja', ico: '📈', label: 'Hasil posting' }, { k: 'komentar', ico: '💬', label: 'Komentar & DM', badge: nKom || undefined }, { k: 'akun', ico: '⚙️', label: 'Akun & tim' }
    ], [nKom, nAntre]);
    const [tab, setTabS] = useState(() => { try { return localStorage.getItem(LS) || 'hari'; } catch { return 'hari'; } });
    const setTab = (k: string) => { setTabS(k); try { localStorage.setItem(LS, k); } catch { /* */ } };
    useSubNav(TAB, tab, setTab);
    const [msg, setMsg] = useState('');
    const [buka, setBuka] = useState<string | null>(null);
    useInterval(() => d.reload(), x?.sibuk || x?.semua.some((k) => k.status === 'mengunggah') ? 5000 : null);
    const kabar = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 8000); };
    const aksi: Aksi = (p, ok) => { p.then(() => { if (ok) kabar(ok); d.reload(); }).catch((e) => kabar(String(e.message || e))); };
    const jalankan = (jenis: string, ok = 'Sedang dikerjakan tim — perkembangannya juga terlihat di Kantor → Papan kerja.') => aksi(apiPost('/api/kantor/sosmed/jalankan', { jenis }), ok);
    if (!x) return <div className="pg sm"><section className="sb-card">{d.error ? <div className="error">{d.error}</div> : <div className="pg-skel" style={{ height: 200 }} />}</section></div>;
    const kartu = (k: Konten) => <KartuKonten key={k.id} k={k} x={x} buka={buka === k.id} onBuka={() => setBuka(buka === k.id ? null : k.id)} aksi={aksi} kabar={kabar} />;
    const p = { x, aksi, kabar, jalankan, kartu, setTab };
    return (
        <div className="pg sm">
            <div className="pg-head"><div><h2>Konten</h2><p>Tim menganalisa niche, menyusun kalender, naskah & prompt. Bapak membuat video & suaranya, lalu tinggal Setujui.</p></div></div>
            <div className="sm-tabs" role="tablist">{TAB.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>{t.ico} {t.label}{t.badge ? <em>{t.badge}</em> : null}</button>)}</div>
            {msg && <div className="fin-alert">{msg}</div>}
            {x.sibuk && <div className="hz-bukti ok"><span className="pk-jalan"><i /></span><span>{SIBUK[x.sibuk] || 'Tim sedang bekerja…'}</span></div>}
            {!x.siap && tab !== 'akun' && tab !== 'gaya' && <Mulai x={x} setTab={setTab} />}
            {tab === 'hari' && x.siap && <TabHari {...p} />}
            {tab === 'antre' && x.siap && <TabAntre {...p} />}
            {tab === 'kalender' && x.siap && <TabKalender {...p} />}
            {tab === 'analisa' && x.siap && <TabAnalisa {...p} />}
            {tab === 'strategi' && x.siap && <TabStrategi {...p} />}
            {tab === 'gaya' && <TabGaya {...p} />}
            {tab === 'kinerja' && x.siap && <TabKinerja {...p} />}
            {tab === 'komentar' && x.siap && <TabKomentar {...p} />}
            {tab === 'akun' && <TabAkun {...p} muat={() => d.reload()} />}
        </div>
    );
}
type P = { x: Data; aksi: Aksi; kabar: (m: string) => void; jalankan: (j: string, ok?: string) => void; kartu: (k: Konten) => React.ReactElement; setTab: (k: string) => void };

function Mulai({ x, setTab }: { x: Data; setTab: (k: string) => void }) {
    const ada = x.tim.filter((t) => t.ada).length;
    return (
        <section className="sb-card sm-mulai">
            <h3>Mulai dari sini</h3>
            <ol>
                <li><b>Bentuk timnya</b> ({ada}/5 anggota ada) dan isi <b>profil akun</b> di tab "Akun & tim". Topik boleh dikosongkan, nanti tim yang mengusulkan niche.</li>
                <li>Pilih <b>gaya video</b> yang Bapak suka di tab "Gaya video" (boleh dibiarkan otomatis).</li>
                <li>Tekan <b>Susun strategi</b>. Tara menganalisa niche, lalu Maya menentukan pilar konten dan jadwal feed/reel/story per hari.</li>
                <li>Tekan <b>Isi kalender</b>. Mulai saat itu, tiap pagi tim menyiapkan naskah dan prompt untuk hari itu dan besoknya.</li>
            </ol>
            <button className="btn primary" onClick={() => setTab('akun')}>Buka Akun & tim</button>
        </section>
    );
}

function TabHari({ x, jalankan, kartu, setTab }: P) {
    const minggu = Array.from({ length: 7 }, (_, i) => tambah(x.hari, i));
    const per = (t: string) => x.semua.filter((k) => k.tgl === t);
    const perluAksi = x.semua.filter((k) => k.tgl <= tambah(x.hari, 1) && ['prompt', 'aset', 'gagal'].includes(k.status)).length;
    return (<>
        <section className="sb-card sm-pekan" aria-label="7 hari ke depan">
            {minggu.map((t, i) => {
                const isi = per(t), slot = x.jadwal[new Date(`${t}T00:00:00Z`).getUTCDay()] || [];
                return (
                    <button key={t} className={`sm-pk ${i === 0 ? 'kini' : ''}`} onClick={() => setTab('kalender')}>
                        <small>{i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : HARI_PANJANG[new Date(`${t}T00:00:00Z`).getUTCDay()]}</small>
                        <b>{+t.slice(8)}</b>
                        <span>{isi.length ? isi.map((k) => <i key={k.id} className={`f-${k.format} ${k.status === 'terbit' ? 'ok' : ''}`} title={`${FMT[k.format].label}: ${k.judul}`}>{FMT[k.format].pendek}</i>)
                            : slot.length ? slot.map((f) => <i key={f} className={`f-${f} kosong`} title={`Jadwal ${FMT[f].label} (belum ada ide)`}>{FMT[f].pendek}</i>) : <em>libur</em>}</span>
                    </button>
                );
            })}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Hari ini <small>{tglId(x.hari)} · unggah ±{x.strategi?.jam || '19:00'} WIB</small></h3><button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('harian')}>↻ Siapkan sekarang</button></div>
            {perluAksi > 0 && <p className="sm-tugas">👉 {perluAksi} konten menunggu Bapak: salin prompt → buat videonya → unggah berkas → Setujui. Mau sekaligus banyak? <button className="btn small" onClick={() => setTab('antre')}>Buka Antrean unggah</button></p>}
            {!x.hariIni.length && <div className="fin-empty">Tidak ada jadwal unggah hari ini.</div>}
            {x.hariIni.map(kartu)}
        </section>
        {x.besok.length > 0 && <section className="sb-card"><div className="sd-h"><h3>Besok <small>disiapkan lebih awal supaya Bapak sempat produksi</small></h3></div>{x.besok.map(kartu)}</section>}
    </>);
}

/** Antrean unggah: produksi banyak sekaligus → unggah semua berkas → setujui semua → terbit sesuai kalender. */
function TabAntre({ x, aksi, kabar, setTab }: P) {
    const daftar = x.semua.filter((k) => k.tgl >= x.hari && ['prompt', 'aset', 'gagal', 'terjadwal', 'mengunggah', 'manual'].includes(k.status)).sort((a, b) => waktuK(a, x) - waktuK(b, x));
    const butuh = daftar.filter((k) => k.status === 'prompt' || ((k.status === 'gagal' || k.status === 'aset') && !k.aset));
    const siap = daftar.filter((k) => (k.status === 'aset' || k.status === 'gagal') && k.aset);
    const jadwal = daftar.filter((k) => ['terjadwal', 'mengunggah', 'manual'].includes(k.status));
    const [pasang, setPasang] = useState<Array<{ f: File; id: string }>>([]);
    const [jalan, setJalan] = useState<string | null>(null);
    const [pilih, setPilih] = useState<Record<string, boolean>>({});
    const ref = useRef<HTMLInputElement>(null);
    const ambil = (files: File[]) => {
        const sisa = [...butuh, ...siap.filter((k) => k.format === 'carousel')];
        const dipakai = new Set<string>();
        setPasang(files.map((f) => { const k = sisa.find((y) => !dipakai.has(y.id) && cocok(f, y)); if (k && k.format !== 'carousel') dipakai.add(k.id); return { f, id: k?.id || '' }; }));
    };
    const unggahSemua = async () => {
        const per = new Map<string, File[]>(); for (const p of pasang) if (p.id) per.set(p.id, [...(per.get(p.id) || []), p.f]);
        let i = 0, n = [...per.values()].reduce((a, b) => a + b.length, 0);
        try {
            for (const [id, files] of per) {
                const { folder } = await apiPost<{ folder: string }>(`/api/kantor/sosmed/konten/${id}/folder`, {});
                for (let j = 0; j < files.length; j++) { i++; setJalan(`${i}/${n}`); const r = await unggahBerkas(folder, files[j], (q) => setJalan(`${i}/${n} · ${q}%`)); await apiPost(`/api/kantor/sosmed/konten/${id}/aset`, { path: r.path, tambah: j > 0 }); }
            }
            setPasang([]); aksi(Promise.resolve(), `✓ ${n} berkas tersimpan di cloud VPS. Cek daftar "Siap disetujui", lalu tekan Setujui semua.`);
        } catch (e: any) { kabar(String(e.message || e)); } finally { setJalan(null); }
    };
    const dipilih = siap.filter((k) => pilih[k.id] !== false);
    const Baris = ({ k, kanan }: { k: Konten; kanan?: React.ReactNode }) => (
        <div className={`sm-ab f-${k.format}`}><span className="sm-ab-w">{kapan(k, x)}</span><Fmt f={k.format} /><b>{k.judul}</b>{kanan}</div>
    );
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>1 · Taruh banyak berkas sekaligus <small>{butuh.length} konten menunggu berkas</small></h3>
                <button className="btn primary" disabled={!butuh.length || !!jalan} onClick={() => ref.current?.click()}>⬆️ Pilih berkas</button></div>
            <p className="sb-note" style={{ marginTop: 0 }}>Buat beberapa video/gambar sekaligus, pilih semuanya di sini. Sistem mencocokkan otomatis ke jadwal terdekat sesuai jenisnya (video → reel/story, gambar → feed/carousel/story). Periksa pasangannya, lalu tekan Unggah semua.</p>
            <input ref={ref} type="file" multiple hidden accept="video/mp4,video/quicktime,image/jpeg,image/png" onChange={(e) => { const f = Array.from<File>(e.target.files || []).slice(0, 30); if (f.length) ambil(f); e.target.value = ''; }} />
            {pasang.length > 0 && (<>
                <div className="sm-pasang">{pasang.map((p, i) => (
                    <div key={i}><span className="sm-pasang-f">{p.f.type.startsWith('video/') ? '🎞️' : '🖼️'} {p.f.name}<small>{(p.f.size / 1048576).toFixed(1)} MB</small></span><span aria-hidden="true">→</span>
                        <select value={p.id} onChange={(e) => setPasang(pasang.map((y, j) => (j === i ? { ...y, id: e.target.value } : y)))} aria-label={`Konten untuk ${p.f.name}`}>
                            <option value="">— jangan diunggah —</option>
                            {[...butuh, ...siap].filter((k) => cocok(p.f, k)).map((k) => <option key={k.id} value={k.id}>{kapan(k, x)} · {FMT[k.format].label} · {k.judul}</option>)}
                        </select></div>
                ))}</div>
                <div className="sm-aksi"><button className="btn primary" disabled={!!jalan || !pasang.some((p) => p.id)} onClick={unggahSemua}>{jalan ? `Mengunggah ${jalan}…` : `Unggah semua (${pasang.filter((p) => p.id).length})`}</button><button className="btn small" disabled={!!jalan} onClick={() => setPasang([])}>Batal</button></div>
                <p className="sb-note">Carousel: beberapa gambar boleh dipasangkan ke carousel yang sama; urutannya mengikuti urutan di sini.</p>
            </>)}
            {!pasang.length && butuh.length > 0 && <div className="sm-ablist">{butuh.map((k) => <Baris key={k.id} k={k} kanan={<em className="sm-ab-s">{k.status === 'prompt' ? 'prompt siap' : 'belum ada berkas'}</em>} />)}</div>}
            {!butuh.length && <div className="fin-empty">Semua konten mendatang sudah punya berkas. {x.semua.some((k) => k.tgl >= x.hari && (k.status === 'rencana' || k.status === 'naskah')) ? 'Sebagian masih ide/naskah: buka Kalender untuk membuat promptnya.' : ''}</div>}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>2 · Siap disetujui <small>{siap.length}</small></h3>
                <button className="btn primary" disabled={!dipilih.length} onClick={() => { if (confirm(`Setujui ${dipilih.length} konten? Masing-masing ${x.ig ? 'terbit otomatis' : 'diingatkan lewat Telegram'} pada tanggal & jamnya.`)) aksi(apiPost<{ dijadwalkan: number; masalah: string[] }>('/api/kantor/sosmed/setujui-semua', { ids: dipilih.map((k) => k.id) }).then((r) => { if (r.masalah.length) kabar(`${r.dijadwalkan} dijadwalkan. Belum bisa: ${r.masalah.join(' · ')}`); return r; }), `✓ ${dipilih.length} konten dijadwalkan.`); }}>✓ Setujui semua ({dipilih.length})</button></div>
            {!siap.length && <div className="fin-empty">Belum ada konten yang berkasnya sudah masuk.</div>}
            <div className="sm-ablist">{siap.map((k) => <label key={k.id} className="sm-ab-c"><input type="checkbox" checked={pilih[k.id] !== false} onChange={(e) => setPilih({ ...pilih, [k.id]: e.target.checked })} /><Baris k={k} kanan={<em className="sm-ab-s">📁 {k.aset?.nama}{k.asetLain?.length ? ` +${k.asetLain.length}` : ''}</em>} /></label>)}</div>
            {siap.length > 0 && <p className="sb-note">Caption ikut terunggah apa adanya; periksa dulu di tab Caption pada kartunya bila perlu. Jam bisa diubah di kartu konten.</p>}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>3 · Terjadwal <small>{jadwal.length}</small></h3></div>
            {!jadwal.length && <div className="fin-empty">Belum ada yang terjadwal.</div>}
            <div className="sm-ablist">{jadwal.map((k) => <Baris key={k.id} k={k} kanan={k.status === 'mengunggah' ? <span className="pk-jalan"><i /> mengunggah…</span> : k.status === 'manual' ? <em className="sm-ab-s">unggah manual</em> : <button className="btn small" onClick={() => aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/batal`, {}), 'Jadwal dibatalkan.')}>Batalkan</button>} />)}</div>
            <p className="sb-note">{x.ig ? 'Kantor mengunggah tepat pada jamnya (dicek tiap menit) dan mengabari Bapak lewat Telegram.' : 'Instagram belum tersambung: pada jamnya Bapak diingatkan lewat Telegram untuk mengunggah manual. Sambungkan Instagram di Akun & tim supaya terbit otomatis.'} <button className="btn small" onClick={() => setTab('kalender')}>Lihat kalender</button></p>
        </section>
    </>);
}

function TabKalender({ x, aksi, jalankan, kartu }: P) {
    const [bulan, setBulan] = useState(x.hari.slice(0, 7));
    const [pilih, setPilih] = useState(x.hari);
    const [ubahJadwal, setUbahJadwal] = useState(false);
    const awal = `${bulan}-01`, dow = (new Date(`${awal}T00:00:00Z`).getUTCDay() + 6) % 7;
    const jmlHari = new Date(Date.UTC(+bulan.slice(0, 4), +bulan.slice(5, 7), 0)).getUTCDate();
    const sel = Array.from({ length: Math.ceil((dow + jmlHari) / 7) * 7 }, (_, i) => (i < dow || i >= dow + jmlHari ? null : tambah(awal, i - dow)));
    const geser = (n: number) => { const t = new Date(Date.UTC(+bulan.slice(0, 4), +bulan.slice(5, 7) - 1 + n, 1)); setBulan(t.toISOString().slice(0, 7)); };
    const per = (t: string) => x.semua.filter((k) => k.tgl === t);
    const hitung = FORMAT_URUT.map((f) => ({ f, n: x.semua.filter((k) => k.tgl.startsWith(bulan) && k.format === f).length }));
    return (<>
        <section className="sb-card sm-kal">
            <div className="sm-kal-h">
                <div className="sm-kal-nav"><button className="icon-btn" onClick={() => geser(-1)} aria-label="Bulan sebelumnya">‹</button><h3>{new Date(`${awal}T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button className="icon-btn" onClick={() => geser(1)} aria-label="Bulan berikutnya">›</button></div>
                <div className="sm-aksi"><button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('rencana', 'Maya mengisi 7 hari ke depan sesuai jadwal.')}>Isi 7 hari</button><button className="btn small primary" disabled={!!x.sibuk} onClick={() => jalankan('bulan', 'Maya mengisi 30 hari ke depan (bertahap, ±5–10 menit).')}>Isi 30 hari</button></div>
            </div>
            <div className="sm-legend">{hitung.map(({ f, n }) => <span key={f}><i className={`f-${f}`} />{FMT[f].label} <b>{n}</b></span>)}<span><i className="kosong" />slot jadwal belum terisi</span></div>
            <div className="sm-grid" role="grid">
                {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((h) => <div key={h} className="sm-gh">{h}</div>)}
                {sel.map((t, i) => {
                    if (!t) return <div key={i} className="sm-gc luar" />;
                    const isi = per(t), slot = t >= x.hari ? (x.jadwal[new Date(`${t}T00:00:00Z`).getUTCDay()] || []).filter((f) => !isi.some((k) => k.format === f)) : [];
                    return (
                        <button key={t} className={`sm-gc ${t === x.hari ? 'kini' : ''} ${t === pilih ? 'pilih' : ''} ${t < x.hari ? 'lewat' : ''}`} onClick={() => setPilih(t)} aria-label={`${tglId(t)}: ${isi.length} konten`}>
                            <b>{+t.slice(8)}</b>
                            {isi.map((k) => <span key={k.id} className={`sm-gk f-${k.format} ${k.status === 'terbit' ? 'ok' : ''}`}><i>{FMT[k.format].pendek}</i><em>{k.judul}</em></span>)}
                            {slot.map((f) => <span key={f} className={`sm-gk f-${f} kosong`}><i>{FMT[f].pendek}</i><em>{FMT[f].label}</em></span>)}
                        </button>
                    );
                })}
            </div>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>{tglId(pilih)}</h3></div>
            {per(pilih).map(kartu)}
            {!per(pilih).length && <div className="fin-empty">Belum ada konten di tanggal ini.</div>}
            <IdeBaru x={x} tgl={pilih} aksi={aksi} />
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Jadwal mingguan <small>format yang diunggah tiap hari</small></h3><button className="btn small" onClick={() => setUbahJadwal(!ubahJadwal)}>{ubahJadwal ? 'Tutup' : 'Ubah jadwal'}</button></div>
            {ubahJadwal ? <JadwalEdit x={x} aksi={aksi} selesai={() => setUbahJadwal(false)} /> : (
                <div className="sm-jadwal">{[1, 2, 3, 4, 5, 6, 0].map((h) => <div key={h}><small>{HARI[h]}</small>{(x.jadwal[h] || []).length ? x.jadwal[h].map((f) => <Fmt key={f} f={f} />) : <em>libur</em>}</div>)}</div>
            )}
            <p className="sb-note">{x.strategi ? `Disusun Maya dari analisa niche${x.strategi.ritme ? ` (${x.strategi.ritme})` : ''}. Jam unggah ±${x.strategi.jam} WIB.` : 'Jadwal sementara dari profil akun. Susun strategi supaya Maya menyesuaikannya dengan niche.'}</p>
        </section>
    </>);
}
function JadwalEdit({ x, aksi, selesai }: { x: Data; aksi: Aksi; selesai: () => void }) {
    const [j, setJ] = useState<Format[][]>(x.jadwal.map((d) => [...d]));
    const [jam, setJam] = useState(x.strategi?.jam || '19:00');
    const tog = (h: number, f: Format) => setJ(j.map((d, i) => (i !== h ? d : d.includes(f) ? d.filter((y) => y !== f) : [...d, f])));
    return (<>
        <div className="sm-jadwal edit">{[1, 2, 3, 4, 5, 6, 0].map((h) => <div key={h}><small>{HARI[h]}</small>{FORMAT_URUT.map((f) => <button key={f} className={`sm-fmt f-${f} ${j[h].includes(f) ? 'on' : 'off'}`} aria-pressed={j[h].includes(f)} onClick={() => tog(h, f)}>{FMT[f].pendek} {FMT[f].label}</button>)}</div>)}</div>
        <div className="sm-aksi"><label className="sm-jam">Jam unggah <input type="time" value={jam} onChange={(e) => setJam(e.target.value)} /></label>
            <button className="btn primary" disabled={!x.strategi} onClick={() => { aksi(apiPost('/api/kantor/sosmed/jadwal', { jadwal: j, jam }), 'Jadwal disimpan. Slot baru akan diisi saat kalender diisi berikutnya.'); selesai(); }}>Simpan jadwal</button>
            {!x.strategi && <small className="sb-note">Susun strategi dulu.</small>}</div>
    </>);
}
function IdeBaru({ x, tgl, aksi }: { x: Data; tgl: string; aksi: Aksi }) {
    const [f, setF] = useState({ judul: '', format: 'reel' as Format, pilar: x.strategi?.pilar[0]?.nama || '', gayaId: '' });
    if (tgl < x.hari) return null;
    return (
        <form className="sm-ide" onSubmit={(e) => { e.preventDefault(); if (!f.judul.trim()) return; aksi(apiPost('/api/kantor/sosmed/konten', { ...f, tgl }), 'Ide ditambahkan. Buka kartunya lalu tekan "Buat naskah & prompt".'); setF({ ...f, judul: '' }); }}>
            <input placeholder={`Ide sendiri untuk ${tglId(tgl, { day: 'numeric', month: 'short' })}…`} value={f.judul} maxLength={90} onChange={(e) => setF({ ...f, judul: e.target.value })} />
            <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as Format })} aria-label="Format">{FORMAT_URUT.map((y) => <option key={y} value={y}>{FMT[y].label}</option>)}</select>
            {(f.format === 'reel' || f.format === 'story') && <select value={f.gayaId} onChange={(e) => setF({ ...f, gayaId: e.target.value })} aria-label="Gaya"><option value="">Gaya: otomatis</option>{x.gaya.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}</select>}
            {!!x.strategi?.pilar.length && <select value={f.pilar} onChange={(e) => setF({ ...f, pilar: e.target.value })} aria-label="Pilar">{x.strategi.pilar.map((p) => <option key={p.nama}>{p.nama}</option>)}</select>}
            <button className="btn">Tambah</button>
        </form>
    );
}

function TabAnalisa({ x, jalankan }: P) {
    const a = x.analisa;
    const Daftar = ({ judul, isi, ket }: { judul: string; isi: string[]; ket: string }) => <div className="sm-an"><h4>{judul}</h4><small>{ket}</small><ul>{isi.map((y) => <li key={y}>{y}</li>)}</ul></div>;
    return (
        <section className="sb-card">
            <div className="sd-h"><h3>Analisa niche <small>{a ? `oleh Tara · ${new Date(a.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · diperbarui otomatis tiap 2 minggu` : 'dasar semua ide konten'}</small></h3><button className="btn small primary" disabled={!!x.sibuk} onClick={() => jalankan('analisa')}>{a ? 'Analisa ulang' : 'Analisa sekarang'}</button></div>
            {!a && <div className="fin-empty">Belum ada analisa. Tara akan mencari masalah penonton, pola konten yang berhasil, dan celah di niche ini.</div>}
            {a && (<>
                <p className="sm-lead">{a.ringkas}</p>
                <div className="sm-an-grid">
                    <Daftar judul="😣 Masalah penonton" ket="yang paling sering dialami" isi={a.masalah} />
                    <Daftar judul="❓ Pertanyaan yang sering muncul" ket="bahan ide konten edukasi" isi={a.pertanyaan} />
                    <Daftar judul="🔥 Yang sedang berhasil" ket="format, pembuka, topik" isi={a.berhasil} />
                    <Daftar judul="🎯 Celah yang belum digarap" ket="peluang untuk menonjol" isi={a.celah} />
                </div>
                <div className="sm-dua"><div><small>Format paling cocok</small><p>{a.formatTerbaik || '–'}</p></div><div><small>Jam unggah terbaik</small><p>{a.jamTerbaik || '–'}</p></div><div><small>Sumber analisa</small><p>{a.sumber || '–'}</p></div></div>
                {a.acuan.length > 0 && <div className="sm-acuan"><h4>Akun acuan untuk dipelajari</h4>{a.acuan.map((y) => <p key={y.akun}><b>{y.akun}</b> — {y.alasan}</p>)}</div>}
                <p className="sb-note">Setiap ide di kalender ditandai masalah/celah mana yang dijawabnya. Kalau sumbernya "perkiraan", anggap sebagai hipotesis dan cek akun acuannya sendiri.</p>
            </>)}
        </section>
    );
}

function TabStrategi({ x, jalankan }: P) {
    const s = x.strategi;
    return (
        <section className="sb-card sm-strategi">
            <div className="sd-h"><h3>Niche & pilar konten</h3><button className="btn small primary" disabled={!!x.sibuk} onClick={() => jalankan('strategi')}>{s ? 'Susun ulang strategi' : 'Susun strategi'}</button></div>
            {!s && <div className="fin-empty">Belum ada strategi. Tara menganalisa niche dulu, lalu Maya menentukan niche, pilar konten, dan jadwal format per hari.</div>}
            {s && (<>
                <div className="sm-niche"><small>Niche</small><b>{s.niche}</b><p>{s.alasan}</p></div>
                <div className="sm-dua"><div><small>Penonton</small><p>{s.audiens}</p></div><div><small>Janji ke pengikut</small><p>{s.janji}</p></div><div><small>Ritme unggah</small><p>{s.ritme || '–'} · ±{s.jam} WIB</p></div></div>
                <div className="sm-pilar-bar">{s.pilar.map((p, i) => <i key={p.nama} style={{ width: `${p.porsi}%`, opacity: 1 - i * 0.15 }} title={`${p.nama} ${p.porsi}%`} />)}</div>
                <div className="sm-pilar">{s.pilar.map((p) => (
                    <div key={p.nama}><div className="sm-pilar-h"><b>{p.nama}</b><span className="mono">{p.porsi}%</span></div><p>{p.tujuan}</p>{p.contoh.length > 0 && <ul>{p.contoh.map((c) => <li key={c}>{c}</li>)}</ul>}
                        <small>{x.semua.filter((k) => k.pilar === p.nama).length} konten di kalender</small></div>
                ))}</div>
                {!!s.opsiNiche?.length && <div className="sm-opsi"><small>Alternatif niche (kalau mau ganti, tulis di Akun & tim → Topik, lalu susun ulang)</small>{s.opsiNiche.map((o) => <p key={o.niche}><b>{o.niche}</b> — {o.alasan}</p>)}</div>}
            </>)}
        </section>
    );
}

function TabGaya({ x, aksi, kabar }: P) {
    const [f, setF] = useState({ nama: '', jenis: 'animasi', deskripsi: '' });
    const [naik, setNaik] = useState<string | null>(null);
    const ref = useRef<HTMLInputElement>(null); const target = useRef('');
    const pasangContoh = async (file: File) => {
        const id = target.current;
        try { const { folder } = await apiPost<{ folder: string }>(`/api/kantor/sosmed/gaya/${id}/folder`, {}); setNaik(id); const r = await unggahBerkas(folder, file, () => undefined); aksi(apiPost(`/api/kantor/sosmed/gaya/${id}/ubah`, { contoh: { path: r.path } }), 'Gambar acuan tersimpan. Vino akan menyebutnya di setiap prompt gaya ini.'); }
        catch (e: any) { kabar(String(e.message || e)); } finally { setNaik(null); }
    };
    const real = x.gaya.filter((g) => g.jenis === 'real'), anim = x.gaya.filter((g) => g.jenis === 'animasi');
    const Kartu = ({ g }: { g: Gaya }) => (
        <div className={`sm-gaya ${x.profil.gayaVideo === g.id ? 'on' : ''}`}>
            <div className="sm-gaya-h"><b>{g.nama}</b>{x.profil.gayaVideo === g.id && <em>utama</em>}</div>
            <p>{g.deskripsi}</p>
            {g.contoh && <small>🖼️ Acuan: {g.contoh.nama}</small>}
            <div className="sm-aksi kecil">
                {x.profil.gayaVideo !== g.id && <button className="btn small" onClick={() => aksi(apiPost('/api/kantor/sosmed/profil', { gayaVideo: g.id }), `${g.nama} jadi gaya utama.`)}>Jadikan utama</button>}
                {!g.bawaan && <><button className="btn small" disabled={naik === g.id} onClick={() => { target.current = g.id; ref.current?.click(); }}>{naik === g.id ? 'Mengunggah…' : g.contoh ? 'Ganti gambar acuan' : '⬆️ Gambar acuan'}</button>
                    <button className="btn small" onClick={() => { if (confirm(`Hapus gaya "${g.nama}"?`)) aksi(apiPost(`/api/kantor/sosmed/gaya/${g.id}/hapus`, {}), 'Gaya dihapus.'); }}>🗑</button></>}
            </div>
        </div>
    );
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>Gaya video <small>dipakai Vino saat menulis prompt reel & story</small></h3>
                {x.profil.gayaVideo !== 'otomatis' && <button className="btn small" onClick={() => aksi(apiPost('/api/kantor/sosmed/profil', { gayaVideo: 'otomatis' }), 'Gaya kembali otomatis: Maya memilih yang cocok untuk tiap konten.')}>Kembali ke otomatis</button>}</div>
            <p className="sb-note" style={{ marginTop: 0 }}>{x.profil.gayaVideo === 'otomatis' ? '✨ Saat ini otomatis: Maya memilih gaya yang paling cocok untuk tiap konten. Bapak tetap bisa mengganti gaya per konten.' : `Gaya utama: ${x.gaya.find((g) => g.id === x.profil.gayaVideo)?.nama}. Bisa diganti per konten di kartunya.`}</p>
            <h4 className="sm-sub">🎥 Real</h4>
            <p className="sb-note">Bapak merekam mentahan dengan HP, lalu memberikannya ke Claude bersama <b>prompt edit</b> dari Vino. Kartu konten juga berisi daftar apa saja yang perlu direkam.</p>
            <div className="sm-gaya-grid">{real.map((g) => <Kartu key={g.id} g={g} />)}</div>
            <h4 className="sm-sub">✏️ Animasi</h4>
            <p className="sb-note">Prompt video ditulis lengkap dengan ciri gaya, tokoh yang konsisten, dan adegan per detik, siap ditempel ke pembuat video AI.</p>
            <div className="sm-gaya-grid">{anim.map((g) => <Kartu key={g.id} g={g} />)}</div>
            <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files?.[0]; if (fl) pasangContoh(fl); e.target.value = ''; }} />
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Tambah gaya sendiri</h3></div>
            <p className="sb-note" style={{ marginTop: 0 }}>Tulis ciri-cirinya (warna, garis, tekstur, gerakan, suasana). Setelah tersimpan, tekan "Gambar acuan" untuk menaruh contoh gambarnya.</p>
            <form className="sm-form" onSubmit={(e) => { e.preventDefault(); aksi(apiPost('/api/kantor/sosmed/gaya', f), 'Gaya baru tersimpan.'); setF({ nama: '', jenis: 'animasi', deskripsi: '' }); }}>
                <label>Nama gaya<input value={f.nama} maxLength={60} placeholder="mis. Neon retro" onChange={(e) => setF({ ...f, nama: e.target.value })} /></label>
                <label>Jenis<select value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}><option value="animasi">Animasi</option><option value="real">Real</option></select></label>
                <label className="lebar">Ciri-ciri gaya <small>boleh campur Indonesia/Inggris</small><textarea rows={3} value={f.deskripsi} maxLength={600} placeholder="mis. 2D retro synthwave, garis neon pink-biru, latar grid ungu, grain halus, gerak lambat" onChange={(e) => setF({ ...f, deskripsi: e.target.value })} /></label>
                <div className="lebar"><button className="btn primary" disabled={!f.nama.trim() || !f.deskripsi.trim()}>Simpan gaya</button></div>
            </form>
        </section>
    </>);
}

function TabKinerja({ x, jalankan }: P) {
    const r = x.rata;
    const [pilih, setPilih] = useState<string | null>(null);
    const k = x.terbit.find((y) => y.id === pilih);
    const grup = (kunci: (k: Konten) => string) => {
        const m = new Map<string, { n: number; t: number }>();
        for (const y of x.terbit) { const h = akhir(y); const v = h?.jangkauan ?? h?.tayang; if (v == null) continue; const g = m.get(kunci(y)) || { n: 0, t: 0 }; g.n++; g.t += v; m.set(kunci(y), g); }
        return [...m.entries()].map(([nama, g]) => ({ nama, rata: Math.round(g.t / g.n), n: g.n })).sort((a, b) => b.rata - a.rata);
    };
    const pf = grup((y) => FMT[y.format].label), pp = grup((y) => y.pilar), mx = Math.max(1, ...pf.map((y) => y.rata), ...pp.map((y) => y.rata));
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>Rata-rata akun <small>{r.n} posting punya data</small></h3>
                <div className="sm-aksi">{x.ig && <button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('hasil')}>↻ Ambil angka dari Instagram</button>}<button className="btn small primary" disabled={!!x.sibuk || r.n < 2} onClick={() => jalankan('pelajaran')}>Tarik pelajaran</button></div></div>
            <div className="sm-metrik">{([['Tayang', r.tayang], ['Jangkauan', r.jangkauan], ['Suka', r.suka], ['Komentar', r.komentar], ['Simpan', r.simpan], ['Bagikan', r.bagikan]] as Array<[string, number | undefined]>).map(([l, v]) => <div key={l}><small>{l}</small><b>{angka(v)}</b></div>)}</div>
            <p className="sb-note">{x.ig ? 'Angka diambil otomatis ±24 jam dan ±7 hari setelah terbit (story sebelum 24 jam), lalu Maya menilai tiap postingan.' : 'Instagram belum tersambung: isi angka dari Insight Instagram di tab "Hasil" pada kartu tiap konten, lalu Maya menilainya.'}</p>
        </section>
        {(pf.length > 0 || pp.length > 0) && (
            <section className="sb-card">
                <div className="sd-h"><h3>Perbandingan <small>rata-rata jangkauan (atau tayang)</small></h3></div>
                <div className="sm-banding">{[['Per format', pf], ['Per pilar', pp]].map(([j, arr]) => <div key={j as string}><h4>{j as string}</h4>{(arr as typeof pf).map((y) => <div key={y.nama} className="sm-bar"><span>{y.nama} <small>({y.n})</small></span><i style={{ width: `${(y.rata / mx) * 100}%` }} /><b>{angka(y.rata)}</b></div>)}</div>)}</div>
            </section>
        )}
        {x.pelajaran && (
            <section className="sb-card sm-pelajaran">
                <div className="sd-h"><h3>Pelajaran dari hasil posting <small>Maya · {new Date(x.pelajaran.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · dipakai otomatis untuk rencana & naskah berikutnya</small></h3></div>
                <p className="sm-lead">{x.pelajaran.ringkas}</p>
                <ul>{x.pelajaran.poin.map((y) => <li key={y}>{y}</li>)}</ul>
            </section>
        )}
        <section className="sb-card">
            <div className="sd-h"><h3>Postingan yang sudah terbit <small>{x.terbit.length}</small></h3></div>
            {!x.terbit.length && <div className="fin-empty">Belum ada postingan yang terbit.</div>}
            {x.terbit.length > 0 && <div className="sm-tabel"><table className="um-t"><thead><tr><th>Tanggal</th><th>Konten</th><th>Tayang</th><th>Jangkauan</th><th>Suka</th><th>Komen</th><th>Simpan</th><th>Bagikan</th><th>Nilai</th></tr></thead>
                <tbody>{x.terbit.map((y) => { const h = akhir(y); return <tr key={y.id} className={pilih === y.id ? 'on' : ''} onClick={() => setPilih(pilih === y.id ? null : y.id)}><td className="mono">{y.tgl.slice(5)}</td><td><Fmt f={y.format} /> {y.judul}</td><td>{angka(h?.tayang)}</td><td>{angka(h?.jangkauan)}</td><td>{angka(h?.suka)}</td><td>{angka(h?.komentar)}</td><td>{angka(h?.simpan)}</td><td>{angka(h?.bagikan)}</td><td>{y.evaluasi ? <span className={`sm-nilai ${y.evaluasi.nilai}`}>{y.evaluasi.nilai}</span> : '–'}</td></tr>; })}</tbody></table></div>}
            {k?.evaluasi && <div className="sm-blok" style={{ marginTop: 10 }}><div className="sm-blok-h"><b>Analisa Maya: {k.judul}</b><span className={`sm-nilai ${k.evaluasi.nilai}`}>{k.evaluasi.nilai}</span></div><p className="sm-p">{k.evaluasi.teks}</p></div>}
        </section>
    </>);
}

function TabKomentar({ x, aksi, kabar, jalankan }: P) {
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>Komentar masuk <small>draf balasan oleh Dea</small></h3>{x.ig && <button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('komentar')}>↻ Ambil komentar baru</button>}</div>
            {x.ig ? <p className="sb-note" style={{ marginTop: 0 }}>Komentar dari postingan 14 hari terakhir diambil otomatis tiap ±30 menit. Balasan hanya terkirim saat Bapak menekan <b>Kirim</b>.</p>
                : <p className="sb-note" style={{ marginTop: 0 }}>Instagram belum tersambung, jadi komentar belum bisa diambil otomatis. Tempel komentar atau DM di kotak bawah untuk dibuatkan draf balasan.</p>}
            {!x.komentar.length && x.ig && <div className="fin-empty">Tidak ada komentar yang menunggu balasan.</div>}
            {x.komentar.map((c) => <KartuKomentar key={c.id} c={c} ig={x.ig} aksi={aksi} />)}
        </section>
        <Balas kabar={kabar} />
        <section className="sb-card"><p className="sb-note" style={{ margin: 0 }}>DM belum bisa ditarik otomatis: Instagram mewajibkan aplikasi Meta yang sudah ditinjau untuk akses pesan. Sementara itu, tempel DM di kotak atas untuk dibuatkan draf.</p></section>
    </>);
}
function KartuKomentar({ c, ig, aksi }: { c: Komentar; ig: boolean; aksi: Aksi }) {
    const [v, setV] = useState(c.draf || '');
    useEffect(() => setV(c.draf || ''), [c.draf]);
    const url = (a: string) => `/api/kantor/sosmed/komentar/${encodeURIComponent(c.id)}/${a}`;
    return (
        <div className="sm-kom">
            <div className="sm-kom-h"><b>@{c.user}</b><small>di "{c.judul}" · {new Date(c.at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
            <p>{c.teks}</p>
            {c.status === 'baru' && !c.draf ? <div className="sm-aksi"><button className="btn small" onClick={() => aksi(apiPost(url('draf'), {}), 'Draf balasan dibuat.')}>Buatkan draf</button><button className="btn small" onClick={() => aksi(apiPost(url('abaikan'), {}))}>Abaikan</button></div> : (<>
                <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} aria-label="Draf balasan" />
                {c.galat && <div className="error">{c.galat}</div>}
                <div className="sm-aksi">{ig ? <button className="btn small primary" disabled={!v.trim()} onClick={() => { if (confirm(`Kirim balasan ke @${c.user}?`)) aksi(apiPost(url('kirim'), { draf: v }), '✓ Balasan terkirim.'); }}>Kirim balasan</button> : <Salin teks={v} label="Salin balasan" />}
                    {v !== (c.draf || '') && <button className="btn small" onClick={() => aksi(apiPost(url('ubah'), { draf: v }), 'Draf disimpan.')}>Simpan draf</button>}
                    <button className="btn small" onClick={() => aksi(apiPost(url('abaikan'), {}))}>Abaikan</button></div>
            </>)}
        </div>
    );
}
function Balas({ kabar }: { kabar: (m: string) => void }) {
    const [t, setT] = useState(''); const [draf, setDraf] = useState(''); const [tunggu, setTunggu] = useState(false);
    return (
        <section className="sb-card">
            <div className="sd-h"><h3>Tempel komentar / DM</h3></div>
            <div className="sm-edit"><textarea rows={3} placeholder="Tempel komentar atau DM dari Instagram di sini…" value={t} onChange={(e) => setT(e.target.value)} />
                <button className="btn" disabled={!t.trim() || tunggu} onClick={() => { setTunggu(true); apiPost<{ draf: string }>('/api/kantor/sosmed/balas', { komentar: t }).then((r) => setDraf(r.draf)).catch((e) => kabar(String(e.message || e))).finally(() => setTunggu(false)); }}>{tunggu ? 'Dea sedang menulis…' : 'Buatkan draf balasan'}</button></div>
            {draf && <div className="sm-blok" style={{ marginTop: 10 }}><div className="sm-blok-h"><b>Draf balasan</b><Salin teks={draf} /></div><pre>{draf}</pre></div>}
        </section>
    );
}

const SKILL: Record<string, string> = { sosmed: '/ig-plan · /ig-profile · /ig-audit', 'sosmed-riset': '/ig-viral · /ig-audit', 'sosmed-penulis': '/reels-cepat · /ig-reel · /ig-caption · /ig-carousel · /ig-story · /ig-repurpose · /ig-human', 'sosmed-produksi': '/ig-human + prompt per gaya', 'sosmed-komunitas': '/ig-reply · /ig-comment · /ig-dm' };
const TUGAS: Record<string, string> = { sosmed: 'Strategi, jadwal format, kalender, evaluasi hasil & pelajaran', 'sosmed-riset': 'Analisa niche: masalah penonton, pola yang berhasil, celah, akun acuan', 'sosmed-penulis': '3 sudut + skor, hook, naskah, voiceover, shot list, subtitle, caption per platform', 'sosmed-produksi': 'Prompt video/gambar sesuai gaya, daftar rekam & prompt edit (real), prompt suara ElevenLabs, unggah', 'sosmed-komunitas': 'Draf balasan komentar & DM' };
function TabAkun({ x, aksi, kabar, muat }: P & { muat: () => void }) {
    const [p, setP] = useState<Profil>(x.profil);
    const [pasang, setPasang] = useState(false);
    const set = (k: keyof Profil) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value });
    const kurang = x.tim.filter((t) => !t.ada);
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>Tim social media <small>{x.tim.length - kurang.length}/5 anggota</small></h3>
                <button className="btn small primary" disabled={pasang} onClick={() => { setPasang(true); apiPost('/api/kantor/sosmed/pasang', {}).then(() => { kabar('✓ Divisi Social Media terbentuk/diperbarui beserta skill-nya. Anggotanya muncul di kantor dalam ±1 menit.'); setTimeout(muat, 1500); }).catch((e) => kabar(String(e.message || e))).finally(() => setPasang(false)); }}>{pasang ? 'Sedang memasang…' : kurang.length ? 'Bentuk Divisi Social Media' : '↻ Perbarui skill tim'}</button></div>
            <div className="sm-tim-l">{x.tim.map((t) => <div key={t.id} className={t.ada ? 'ada' : ''}><b>{t.ada ? '●' : '○'} {t.nama}</b><p>{TUGAS[t.id]}</p><small>{SKILL[t.id]}</small></div>)}</div>
            <p className="sb-note">Skill diambil dari repo sumber terbuka <b>instagram-agent-skill</b> (13 skill: ig-reel, ig-viral, ig-caption, ig-carousel, ig-story, ig-profile, ig-plan, ig-human, ig-comment, ig-reply, ig-dm, ig-repurpose, ig-audit) ditambah skill <b>reels-cepat</b> dari Bapak, dibagi per peran. {kurang.length ? 'Sebelum tim dibentuk, pekerjaan mereka dikerjakan otak AI kantor dengan format yang sama.' : ''}</p>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Profil akun <small>dibaca semua anggota tim</small></h3></div>
            <div className="sm-form">
                <label>Nama akun Instagram<input value={p.akun} placeholder="@namaakun" onChange={set('akun')} /></label>
                <label>Bahasa konten<input value={p.bahasa} onChange={set('bahasa')} /></label>
                <label className="lebar">Topik / niche <small>kosongkan kalau mau tim yang mengusulkan</small><input value={p.topik} placeholder="mis. AI praktis untuk pemilik usaha kecil" onChange={set('topik')} /></label>
                <label className="lebar">Siapa penontonnya<input value={p.audiens} placeholder="mis. pemilik UMKM 25–40 tahun yang gaptek" onChange={set('audiens')} /></label>
                <label className="lebar">Tujuan akun<input value={p.tujuan} placeholder="mis. bangun kepercayaan lalu jual kelas / jasa" onChange={set('tujuan')} /></label>
                <label className="lebar">Gaya bicara<textarea rows={2} value={p.gaya} placeholder="mis. santai lu/gua, to the point, sedikit humor" onChange={set('gaya')} /></label>
                <label className="lebar">Karakter suara narasi (untuk prompt ElevenLabs)<input value={p.suara} placeholder="mis. pria 30-an, hangat, tempo sedang, logat Jakarta" onChange={set('suara')} /></label>
                <label>Konten utama per minggu <small>feed + reel + carousel</small><input type="number" min={1} max={14} value={p.perMinggu} onChange={(e) => setP({ ...p, perMinggu: +e.target.value })} /></label>
                <label>Durasi reel (detik)<input type="number" min={10} max={90} value={p.durasi} onChange={(e) => setP({ ...p, durasi: +e.target.value })} /></label>
                <div className="lebar sm-cek"><small>Format yang dipakai</small>{FORMAT_URUT.map((f) => <label key={f}><input type="checkbox" checked={p.format.includes(f)} onChange={(e) => setP({ ...p, format: e.target.checked ? [...p.format, f] : p.format.filter((y) => y !== f) })} /> {FMT[f].ico} {FMT[f].label}</label>)}</div>
                <label className="lebar">Catatan lain untuk tim<textarea rows={2} value={p.catatan} placeholder="hal yang harus dihindari, produk yang dijual, contoh akun panutan, dll." onChange={set('catatan')} /></label>
            </div>
            <button className="btn primary" onClick={() => aksi(apiPost('/api/kantor/sosmed/profil', p), '✓ Profil akun disimpan. Lanjut: tab Strategi → Susun strategi.')}>Simpan profil</button>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Sambungan Instagram <small>{x.ig ? 'tersambung' : 'belum tersambung'}</small></h3></div>
            {x.ig ? <p className="sb-note">✅ Kantor bisa mengunggah feed, reel, carousel, dan story setelah Bapak menekan Setujui, mengambil angka hasil, dan menarik komentar. Tidak ada yang diunggah atau dibalas tanpa persetujuan Bapak.</p> : (<>
                <p className="sb-note">Tanpa sambungan, alurnya tetap jalan sampai "siap diunggah": Bapak tinggal unduh berkas dan tempel caption, lalu isi angka hasil secara manual. Supaya kantor bisa mengunggah, mengambil angka hasil, dan menarik komentar sendiri, perlu sambungan resmi Instagram (Meta):</p>
                <ol className="sm-ol"><li>Akun Instagram harus jenis <b>Profesional</b> (Bisnis/Kreator).</li><li>Buat aplikasi di Meta for Developers dan ambil <b>ID akun Instagram</b> serta <b>token akses jangka panjang</b> dengan izin menerbitkan konten, membaca insight, dan mengelola komentar.</li><li>Simpan keduanya di VPS sebagai <code>INSTAGRAM_USER_ID</code> dan <code>INSTAGRAM_TOKEN</code> pada berkas <code>.env</code> kantor, lalu mulai ulang kantor. Jangan kirim token lewat chat.</li></ol>
            </>)}
        </section>
    </>);
}

/* ── Kartu satu konten ── */
function KartuKonten({ k, x, buka, onBuka, aksi, kabar }: { k: Konten; x: Data; buka: boolean; onBuka: () => void; aksi: Aksi; kabar: (m: string) => void }) {
    const langkah = Math.max(0, LANGKAH.findIndex((l) => l.s.includes(k.status)));
    const gaya = x.gaya.find((g) => g.id === (k.gayaId || (x.profil.gayaVideo !== 'otomatis' ? x.profil.gayaVideo : '')));
    const [sub, setSub] = useState(k.status === 'terbit' ? 'hasil' : 'produksi');
    const sibuk = !!x.sibuk;
    const url = (a: string) => `/api/kantor/sosmed/konten/${k.id}/${a}`;
    return (
        <article className={`sm-k ${buka ? 'buka' : ''} st-${k.status} f-${k.format}`}>
            <button className="sm-k-h" onClick={onBuka} aria-expanded={buka}>
                <div className="sm-k-atas"><Fmt f={k.format} />{(k.format === 'reel' || k.format === 'story') && <span className="sm-pil">{gaya ? `🎨 ${gaya.nama}` : '🎨 gaya otomatis'}</span>}<span className="sm-pil">{k.pilar}</span><small>{tglId(k.tgl, { weekday: 'short', day: 'numeric', month: 'short' })}</small></div>
                <b>{k.judul}</b>
                {k.hook ? <em>"{k.hook}"</em> : k.sudut ? <em>{k.sudut}</em> : null}
                {k.dasar && <span className="sm-dasar">🎯 {k.dasar}</span>}
                <div className="sm-langkah">{LANGKAH.map((l, i) => <span key={l.label} className={i < langkah ? 'lewat' : i === langkah ? 'kini' : ''}>{l.label}</span>)}</div>
            </button>
            {k.galat && <div className="error">Terkendala: {k.galat}</div>}
            {buka && (
                <div className="sm-isi">
                    {k.status === 'rencana' ? (<>
                        {k.tujuan && <p className="sm-sudut"><b>Tujuan:</b> {k.tujuan}</p>}
                        <PilihGaya k={k} x={x} aksi={aksi} />
                        <div className="sm-aksi"><button className="btn primary" disabled={sibuk} onClick={() => aksi(apiPost(url('kembangkan'), {}), 'Lala menulis naskah (format reels-cepat), lalu Vino menyiapkan prompt (±2–5 menit).')}>Buat naskah & prompt sekarang</button></div>
                    </>) : (<>
                        <div className="sm-sub-tab" role="tablist">{[['produksi', '🎬 Produksi'], ['naskah', '📝 Naskah'], ['caption', '✍️ Caption'], ['hasil', '📈 Hasil']].map(([kk, l]) => <button key={kk} role="tab" aria-selected={sub === kk} className={sub === kk ? 'on' : ''} onClick={() => setSub(kk)}>{l}</button>)}</div>
                        {sub === 'produksi' && <Produksi k={k} x={x} aksi={aksi} kabar={kabar} />}
                        {sub === 'naskah' && <Naskah k={k} durasi={x.profil.durasi} />}
                        {sub === 'caption' && <Caption k={k} aksi={aksi} />}
                        {sub === 'hasil' && <HasilKonten k={k} x={x} aksi={aksi} />}
                    </>)}
                    <div className="sm-aksi kecil">
                        {k.status !== 'rencana' && k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn small" disabled={sibuk} onClick={() => { if (confirm('Tulis ulang naskah & prompt dari awal?')) aksi(apiPost(url('kembangkan'), { ulang: true }), 'Sedang ditulis ulang.'); }}>↻ Tulis ulang</button>}
                        {k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn small" onClick={() => { if (confirm(`Hapus "${k.judul}" dari kalender?`)) aksi(apiPost(url('hapus'), {}), 'Dihapus dari kalender.'); }}>🗑 Hapus</button>}
                    </div>
                </div>
            )}
        </article>
    );
}
function PilihGaya({ k, x, aksi, onGanti }: { k: Konten; x: Data; aksi: Aksi; onGanti?: () => void }) {
    if (k.format !== 'reel' && k.format !== 'story') return null;
    return (
        <label className="sm-pilih-gaya">🎨 Gaya video
            <select value={k.gayaId || ''} onChange={(e) => { aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/ubah`, { gayaId: e.target.value || null }), 'Gaya diganti.'); onGanti?.(); }}>
                <option value="">{x.profil.gayaVideo !== 'otomatis' ? `Gaya utama (${x.gaya.find((g) => g.id === x.profil.gayaVideo)?.nama})` : 'Otomatis (dipilih AI)'}</option>
                <optgroup label="Real">{x.gaya.filter((g) => g.jenis === 'real').map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}</optgroup>
                <optgroup label="Animasi">{x.gaya.filter((g) => g.jenis === 'animasi').map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}</optgroup>
            </select>
        </label>
    );
}
function Blok({ judul, teks, salin, utama, children }: { judul: string; teks?: string; salin?: string; utama?: boolean; children?: React.ReactNode }) {
    return <section className={`sm-blok ${utama ? 'utama' : ''}`}><div className="sm-blok-h"><b>{judul}</b>{teks && <Salin teks={teks} label={salin} />}</div>{teks && <pre>{teks}</pre>}{children}</section>;
}
function Produksi({ k, x, aksi, kabar }: { k: Konten; x: Data; aksi: Aksi; kabar: (m: string) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [naik, setNaik] = useState<string | null>(null);
    const [gayaBaru, setGayaBaru] = useState(false);
    const url = (a: string) => `/api/kantor/sosmed/konten/${k.id}/${a}`;
    const gaya = x.gaya.find((g) => g.id === (k.gayaId || (x.profil.gayaVideo !== 'otomatis' ? x.profil.gayaVideo : '')));
    const banyak = k.format === 'carousel';
    const unggah = async (files: File[]) => {
        try {
            const { folder } = await apiPost<{ folder: string }>(url('folder'), {});
            for (let i = 0; i < files.length; i++) {
                setNaik(files.length > 1 ? `${i + 1}/${files.length}` : '0%');
                const r = await unggahBerkas(folder, files[i], (n) => setNaik(files.length > 1 ? `${i + 1}/${files.length} · ${n}%` : `${n}%`));
                await apiPost(url('aset'), { path: r.path, tambah: banyak && i > 0 });
            }
            aksi(Promise.resolve(), '✓ Berkas tersimpan di cloud VPS (Berkas → Sosmed). Periksa caption, lalu tekan Setujui.');
        } catch (e: any) { kabar(String(e.message || e)); } finally { setNaik(null); }
    };
    const n = 1 + (k.asetLain?.length || 0);
    const nanti = waktuK(k, x) > Date.now();
    let langkah = 1;
    return (<>
        <PilihGaya k={k} x={x} aksi={aksi} onGanti={() => setGayaBaru(true)} />
        {gayaBaru && <div className="hz-bukti warn"><span>Gaya diganti. Buat ulang prompt supaya sesuai gaya baru? <button className="btn small" disabled={!!x.sibuk} onClick={() => { setGayaBaru(false); aksi(apiPost(url('kembangkan'), { produksiSaja: true }), 'Vino menulis ulang prompt sesuai gaya baru.'); }}>Buat ulang prompt</button></span></div>}
        {k.status === 'naskah' && !k.promptVideo && !k.promptGambar && !k.promptEdit && <div className="sm-aksi"><button className="btn primary" disabled={!!x.sibuk} onClick={() => aksi(apiPost(url('kembangkan'), {}), 'Vino menyiapkan prompt.')}>Buat prompt produksi</button></div>}
        {k.rekam && <Blok utama judul={`${langkah++} · Yang perlu direkam`} teks={k.rekam} salin="Salin daftar rekam" />}
        {k.promptEdit && <Blok utama judul={`${langkah++} · Prompt edit untuk Claude`} teks={k.promptEdit} salin="Salin prompt edit"><small className="sb-note">Tempel ke Claude bersama video mentahan Bapak.</small></Blok>}
        {k.promptVideo && <Blok utama judul={`${langkah++} · Prompt video${gaya ? ` (${gaya.nama})` : ''}`} teks={k.promptVideo} salin="Salin prompt video">{gaya?.contoh && <small className="sb-note">🖼️ Lampirkan juga gambar acuan "{gaya.contoh.nama}" (menu Berkas → Sosmed → Gaya).</small>}</Blok>}
        {k.promptGambar && <Blok utama judul={`${langkah++} · Prompt gambar${banyak ? ' per slide' : ''}`} teks={k.promptGambar} salin="Salin prompt gambar" />}
        {k.promptSuara && (
            <Blok utama judul={`${langkah++} · Prompt suara ElevenLabs`} teks={k.promptSuara.teks} salin="Salin teks + tag ekspresi">
                <div className="sm-suara"><div><small>Karakter suara</small><p>{k.promptSuara.gaya}</p></div><div><small>Pengaturan</small><p>{k.promptSuara.pengaturan}</p></div></div>
                <small className="sb-note">Tag dalam kurung siku (mis. [excited]) adalah tag ekspresi ElevenLabs v3. Tempel apa adanya.</small>
            </Blok>
        )}
        {(k.promptVideo || k.promptGambar || k.promptEdit || k.aset) && (
            <section className="sm-blok utama">
                <div className="sm-blok-h"><b>{langkah} · Taruh hasil & setujui</b></div>
                {k.aset ? <p className="sm-aset">📁 {k.aset.nama}{banyak && n > 1 ? ` + ${n - 1} berkas lain` : ''} <small>tersimpan di Berkas → Sosmed</small></p> : <p className="sb-note" style={{ marginTop: 0 }}>Setelah {k.format === 'reel' ? 'video' : banyak ? 'semua slide' : k.format === 'story' ? 'gambar/video story' : 'gambar'} jadi, unggah di sini. Berkasnya tersimpan di cloud VPS Bapak.</p>}
                <input ref={input} type="file" multiple={banyak} accept={k.format === 'reel' ? 'video/mp4,video/quicktime' : k.format === 'story' ? 'video/mp4,video/quicktime,image/jpeg,image/png' : banyak ? 'image/jpeg,image/png,video/mp4' : 'image/jpeg,image/png'} hidden onChange={(e) => { const f = Array.from<File>(e.target.files || []).slice(0, 10); if (f.length) unggah(f); e.target.value = ''; }} />
                <div className="sm-aksi">
                    {k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn" disabled={naik != null} onClick={() => input.current?.click()}>{naik != null ? `Mengunggah ${naik}…` : k.aset ? '↻ Ganti berkas' : banyak ? '⬆️ Unggah semua slide (urut)' : '⬆️ Unggah berkas'}</button>}
                    {['aset', 'gagal'].includes(k.status) && k.aset && (nanti
                        ? <button className="btn primary" onClick={() => aksi(apiPost(url('setujui'), {}), `Disetujui — ${x.ig ? 'terbit otomatis' : 'Bapak diingatkan lewat Telegram'} ${kapan(k, x)} WIB.`)}>✓ Setujui · terbit {kapan(k, x)}</button>
                        : <button className="btn primary" onClick={() => { if (confirm(x.ig ? `Unggah "${k.judul}" (${FMT[k.format].label}) ke Instagram sekarang, beserta captionnya?` : `Instagram belum tersambung. Tandai "${k.judul}" siap diunggah manual?`)) aksi(apiPost(url('setujui'), { sekarang: true }), x.ig ? 'Disetujui — sedang diunggah ke Instagram.' : 'Siap diunggah manual: salin caption di tab Caption.'); }}>✓ Setujui{x.ig ? ' & unggah sekarang' : ''}</button>)}
                    {['aset', 'gagal'].includes(k.status) && k.aset && nanti && <button className="btn small" onClick={() => { if (confirm(`Unggah "${k.judul}" sekarang, tidak menunggu jadwal?`)) aksi(apiPost(url('setujui'), { sekarang: true }), 'Disetujui — diunggah sekarang.'); }}>Unggah sekarang</button>}
                    {k.status === 'terjadwal' && <><span className="sm-terjadwal">⏰ Terjadwal {kapan(k, x)} WIB{x.ig ? '' : ' (pengingat)'}</span><button className="btn small" onClick={() => { if (confirm(`Unggah "${k.judul}" sekarang?`)) aksi(apiPost(url('setujui'), { sekarang: true }), 'Diunggah sekarang.'); }}>Unggah sekarang</button><button className="btn small" onClick={() => aksi(apiPost(url('batal'), {}), 'Jadwal dibatalkan.')}>Batalkan jadwal</button></>}
                    {k.status === 'mengunggah' && <span className="pk-jalan"><i /> sedang diunggah ke Instagram…</span>}
                    {k.status === 'terbit' && <span className="sm-terbit">✅ Terbit{k.ig?.tautan && <> · <a href={k.ig.tautan} target="_blank" rel="noreferrer">lihat di Instagram</a></>}</span>}
                </div>
                {k.status !== 'terbit' && k.status !== 'mengunggah' && <JamUnggah k={k} x={x} aksi={aksi} />}
                {k.status === 'manual' && <TerbitManual k={k} aksi={aksi} />}
            </section>
        )}
    </>);
}
function JamUnggah({ k, x, aksi }: { k: Konten; x: Data; aksi: Aksi }) {
    return (
        <div className="sm-jamk">
            <label>Tanggal<input type="date" value={k.tgl} min={x.hari} onChange={(e) => e.target.value && aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/ubah`, { tgl: e.target.value }), 'Tanggal diubah.')} /></label>
            <label>Jam (WIB)<input type="time" value={jamK(k, x)} onChange={(e) => e.target.value && aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/ubah`, { jam: e.target.value }))} /></label>
            {k.jam && <button className="btn small" onClick={() => aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/ubah`, { jam: '' }), `Kembali ke jam umum ${x.strategi?.jam || '19:00'}.`)}>Pakai jam umum</button>}
        </div>
    );
}
function TerbitManual({ k, aksi }: { k: Konten; aksi: Aksi }) {
    const [t, setT] = useState('');
    return (<>
        <p className="sb-note">Unggah manual: unduh berkas dari menu Berkas → Sosmed, tempel caption dari tab Caption. Setelah terbit, tandai di sini supaya hasilnya bisa dianalisa.</p>
        <div className="sm-ide"><input placeholder="Tautan postingan Instagram (opsional)" value={t} onChange={(e) => setT(e.target.value)} /><button className="btn" onClick={() => aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/terbit-manual`, { tautan: t }), 'Ditandai terbit. Isi angka hasilnya besok di tab Hasil.')}>Tandai sudah terbit</button></div>
    </>);
}
function Naskah({ k, durasi }: { k: Konten; durasi: number }) {
    return (<>
        {!!k.sudutPilihan?.length && (
            <section className="sm-blok"><div className="sm-blok-h"><b>3 sudut & skornya</b><small className="sb-note" style={{ margin: 0 }}>perkiraan dari pola konten, bukan data performa</small></div>
                <div className="sm-tabel"><table className="um-t"><thead><tr><th>Sudut</th><th>Hook</th><th>Scroll</th><th>Relevansi</th><th>Skor</th></tr></thead>
                    <tbody>{k.sudutPilihan.map((s, i) => <tr key={i} className={i === 0 ? 'on' : ''}><td>{i === 0 ? '⭐ ' : ''}{s.sudut}</td><td>{s.hook}</td><td className="mono">{s.scroll}%</td><td className="mono">{s.relevansi}%</td><td className="mono"><b>{s.skor}%</b></td></tr>)}</tbody></table></div>
            </section>
        )}
        {k.hook && <section className="sm-blok"><div className="sm-blok-h"><b>Hook</b><Salin teks={k.hook} /></div><p className="sm-hook-utama">{k.hook}</p>{!!k.hookLain?.length && <ul className="sm-hook">{k.hookLain.map((h) => <li key={h}>{h}</li>)}</ul>}</section>}
        {k.naskah && <Blok judul="Naskah (Hook → Masalah → Solusi → CTA)" teks={k.naskah} />}
        {k.voiceover && <Blok judul={`Voiceover${k.jumlahKata ? ` · ${k.jumlahKata} kata ≈ ${Math.round(k.jumlahKata / 2.75)} dtk (target ${durasi} dtk)` : ''}`} teks={k.voiceover} salin="Salin voiceover"><small className="sb-note">"/" jeda pendek · "//" jeda panjang · KAPITAL = ditekan</small></Blok>}
        {!!k.slide?.length && (
            <section className="sm-blok"><div className="sm-blok-h"><b>{k.format === 'feed' ? 'Isi gambar' : `Slide (${k.slide.length})`}</b></div>
                <div className="sm-slide">{k.slide.map((s) => <div key={s.no}><small>{s.no}</small><b>{s.judul}</b><p>{s.isi}</p><em>{s.visual}</em></div>)}</div></section>
        )}
        {!!k.storyboard?.length && (
            <section className="sm-blok"><div className="sm-blok-h"><b>{k.format === 'story' ? 'Bingkai story' : 'Shot list'}</b><small className="sb-note" style={{ margin: 0 }}>waktu = perkiraan sampai suara direkam</small></div>
                <div className="sm-tabel"><table className="um-t sm-sb"><thead><tr><th>Detik</th><th>Visual</th><th>Teks di layar</th><th>{k.format === 'story' ? 'Stiker' : 'SFX'}</th><th>Narasi</th></tr></thead>
                    <tbody>{k.storyboard.map((a) => <tr key={a.no}><td className="mono">{a.detik}</td><td>{a.visual}</td><td>{a.teksLayar}</td><td>{a.sfx || '–'}</td><td>{a.narasi}</td></tr>)}</tbody></table></div>
                {(k.sampul || k.musik) && <p className="sb-note">{k.sampul ? `Sampul: ${k.sampul}. ` : ''}{k.musik ? `Musik: ${k.musik}.` : ''}</p>}
            </section>
        )}
        {!!k.subtitle?.length && <section className="sm-blok"><div className="sm-blok-h"><b>Subtitle</b><Salin teks={k.subtitle.join('\n').replace(/\*\*/g, '')} /></div><div className="sm-subtitle">{k.subtitle.map((s, i) => <span key={i} dangerouslySetInnerHTML={{ __html: s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />)}</div></section>}
    </>);
}
function Caption({ k, aksi }: { k: Konten; aksi: Aksi }) {
    const ig = [k.caption || '', k.ajakan && !(k.caption || '').includes(k.ajakan) ? k.ajakan : '', (k.hashtag || []).join(' ')].filter(Boolean).join('\n\n');
    return (<>
        <section className="sm-blok utama"><div className="sm-blok-h"><b>Instagram</b><Salin teks={ig} label="Salin caption + hashtag" /></div>
            <EditTeks nilai={k.caption || ''} baris={5} onSimpan={(v) => aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/ubah`, { caption: v }), 'Caption disimpan.')} />
            {!!k.hashtag?.length && <p className="sm-tag">{k.hashtag.join(' ')}</p>}{k.ajakan && <p className="sb-note">Ajakan: {k.ajakan}</p>}
            <small className="sb-note">Caption inilah yang ikut terunggah saat Bapak menekan Setujui.</small></section>
        {k.captionTiktok && <Blok judul="TikTok" teks={k.captionTiktok} />}
        {k.youtube && <Blok judul="YouTube Shorts" teks={`${k.youtube.judul}\n\n${k.youtube.deskripsi}`} />}
        {!k.caption && <div className="fin-empty">Caption muncul setelah naskah ditulis.</div>}
    </>);
}
function HasilKonten({ k, x, aksi }: { k: Konten; x: Data; aksi: Aksi }) {
    const [f, setF] = useState<Record<string, string>>({ umurJam: '24' });
    const h = akhir(k), r = x.rata;
    if (k.status !== 'terbit' && k.status !== 'manual') return <div className="fin-empty">Hasil bisa dianalisa setelah konten terbit.</div>;
    const KOL: Array<[keyof Hasil, string]> = [['tayang', 'Tayang'], ['jangkauan', 'Jangkauan'], ['suka', 'Suka'], ['komentar', 'Komentar'], ['simpan', 'Simpan'], ['bagikan', 'Bagikan'], ['ikuti', 'Pengikut baru']];
    return (<>
        {h ? (
            <section className="sm-blok utama"><div className="sm-blok-h"><b>Hasil setelah ±{h.umurJam >= 48 ? `${Math.round(h.umurJam / 24)} hari` : `${h.umurJam} jam`}</b><small className="sb-note" style={{ margin: 0 }}>{h.sumber === 'ig' ? 'dari Instagram' : 'diisi manual'}</small></div>
                <div className="sm-metrik">{KOL.map(([kk, l]) => { const v = h[kk] as number | undefined, rv = (r as any)[kk] as number | undefined; return <div key={kk}><small>{l}</small><b>{angka(v)}</b>{v != null && rv ? <em className={v >= rv ? 'naik' : 'turun'}>{v >= rv ? '▲' : '▼'} {Math.round((v / rv - 1) * 100)}% vs rata-rata</em> : null}</div>; })}</div>
            </section>
        ) : <p className="sb-note" style={{ marginTop: 0 }}>{x.ig && k.ig?.at ? 'Angka diambil otomatis ±24 jam setelah terbit.' : 'Isi angka dari Insight Instagram (buka postingan → Lihat insight).'}</p>}
        {k.evaluasi && <section className="sm-blok"><div className="sm-blok-h"><b>Analisa Maya</b><span className={`sm-nilai ${k.evaluasi.nilai}`}>{k.evaluasi.nilai}</span></div><p className="sm-p">{k.evaluasi.teks}</p></section>}
        <section className="sm-blok">
            <div className="sm-blok-h"><b>Isi angka manual</b>{h && <button className="btn small" disabled={!!x.sibuk} onClick={() => aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/evaluasi`, {}), 'Maya sedang menganalisa hasilnya.')}>{k.evaluasi ? '↻ Analisa ulang' : 'Analisa hasil'}</button>}</div>
            <form className="sm-hasil-f" onSubmit={(e) => { e.preventDefault(); aksi(apiPost(`/api/kantor/sosmed/konten/${k.id}/hasil`, f), 'Angka tersimpan. Maya sedang menganalisanya.'); }}>
                <label>Umur postingan<select value={f.umurJam} onChange={(e) => setF({ ...f, umurJam: e.target.value })}><option value="24">±1 hari</option><option value="72">±3 hari</option><option value="168">±7 hari</option></select></label>
                {KOL.map(([kk, l]) => <label key={kk}>{l}<input inputMode="numeric" value={f[kk] || ''} onChange={(e) => setF({ ...f, [kk]: e.target.value.replace(/\D/g, '') })} /></label>)}
                <div className="lebar"><button className="btn primary">Simpan & analisa</button></div>
            </form>
        </section>
    </>);
}
function EditTeks({ nilai, baris, onSimpan }: { nilai: string; baris: number; onSimpan: (v: string) => void }) {
    const [v, setV] = useState(nilai);
    useEffect(() => setV(nilai), [nilai]);
    return <div className="sm-edit"><textarea value={v} rows={baris} onChange={(e) => setV(e.target.value)} />{v !== nilai && <button className="btn small primary" onClick={() => onSimpan(v)}>Simpan perubahan</button>}</div>;
}
