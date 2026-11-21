import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TanggalInput } from '../components/Tanggal';
import { useApi } from '../kantor/api';
import { apiPost, serverBase, tokenLogin } from '../kantor/connection';
import { useSubNav } from '../kantor/subnav';
import { useInterval } from '../kantor/aktif';
import { StoryboardSketsa, type Adegan as AdeganS } from './sosmed/Sketsa';
import { Beranda, type AkunInfo, type PlatInfo } from './sosmed/Beranda';
import { GaleriPilih, PratinjauGaya } from './sosmed/Pratinjau';
import { Starter, type JawabanStarter } from './sosmed/Starter';
import { TabAset, StudioKonten, PilihPalet, type SaranAset } from './sosmed/Studio';

import { Ikon } from '../components/Ikon';
import { Hidup } from '../components/Hidup';
import { konfirmasi } from '../components/Konfirmasi';
type Format = 'feed' | 'reel' | 'carousel' | 'story' | 'video';
type Status = 'rencana' | 'sketsa' | 'naskah' | 'prompt' | 'aset' | 'terjadwal' | 'mengunggah' | 'terbit' | 'manual' | 'gagal';
type Adegan = AdeganS;
interface Varian { no: number; sudut: string; hook: string; ringkas: string; scroll: number; relevansi: number; skor: number; gayaId?: string; look?: string; grade?: string; efek?: string[]; sampul?: string; hashtag?: string[]; ajakan?: string; voiceover?: string; jumlahKata?: number; storyboard: Adegan[]; musik?: string; caption?: string; promptVideo?: string; promptSuara?: { teks: string; gaya: string; pengaturan: string }; rekam?: string; promptEdit?: string; galat?: string }
interface Hasil { at: number; sumber: 'ig' | 'manual'; umurJam: number; tayang?: number; jangkauan?: number; suka?: number; komentar?: number; simpan?: number; bagikan?: number; ikuti?: number }
interface Aset { path: string; nama: string; dihapus?: number }
interface Konten {
    id: string; kode?: string; arahan?: string; look?: string; grade?: string; efek?: string[]; varian?: Varian[]; pilih?: number; tgl: string; pilar: string; format: Format; judul: string; sudut: string; tujuan: string; dasar?: string; gayaId?: string;
    sudutPilihan?: Array<{ sudut: string; hook: string; scroll: number; relevansi: number; skor: number }>; hook?: string; hookLain?: string[]; naskah?: string; voiceover?: string; jumlahKata?: number;
    storyboard?: Adegan[]; subtitle?: string[]; slide?: Array<{ no: number; judul: string; isi: string; visual: string; aset?: string; tata?: string; poin?: string[]; kiri?: string; kanan?: string; elemen?: Array<{ jenis: string; teks?: string }>; gambarElemen?: string }>;
    hiasan?: 'otomatis' | 'sedikit' | 'tanpa';
    pakaiAset?: string[]; saranAset?: SaranAset[]; desain?: { gaya: string; oleh: 'templat' | 'claude'; at: number; catatan?: string } | null;
    caption?: string; hashtag?: string[]; ajakan?: string; captionTiktok?: string; youtube?: { judul: string; deskripsi: string };
    promptVideo?: string; promptGambar?: string; rekam?: string; promptEdit?: string; promptSuara?: { teks: string; gaya: string; pengaturan: string }; musik?: string; sampul?: string;
    status: Status; jam?: string; aset?: Aset | null; asetLain?: Aset[]; ig?: { tautan?: string; at: number } | null; hasil?: Hasil[]; evaluasi?: { at: number; nilai: 'bagus' | 'biasa' | 'kurang'; teks: string } | null; galat?: string;
}
interface Gaya { id: string; nama: string; jenis: 'real' | 'animasi'; deskripsi: string; contoh?: Aset | null; bawaan?: boolean }
interface Profil { akun: string; topik: string; audiens: string; tujuan: string; gaya: string; bahasa: string; perMinggu: number; format: string[]; durasi: number; durasiPanjang: number; suara: string; catatan: string; gayaVideo: string; look: string; grade: string }
interface ItemK { id: string; nama: string; ket: string; diSkill?: boolean; cocok?: string }
interface Strategi { at: number; niche: string; alasan: string; audiens: string; janji: string; ritme: string; jam: string; jadwal: Format[][]; pilar: Array<{ nama: string; tujuan: string; porsi: number; contoh: string[] }>; opsiNiche?: Array<{ niche: string; alasan: string }> }
interface Analisa { at: number; ringkas: string; masalah: string[]; pertanyaan: string[]; berhasil: string[]; celah: string[]; acuan: Array<{ akun: string; alasan: string }>; formatTerbaik: string; jamTerbaik: string; sumber: string }
interface Komentar { id: string; judul?: string; user: string; teks: string; at: number; draf?: string; status: string; galat?: string }
interface Rata { n: number; tayang?: number; jangkauan?: number; suka?: number; komentar?: number; simpan?: number; bagikan?: number }
interface Data {
    profil: Profil; strategi: Strategi | null; jadwal: Format[][]; analisa: Analisa | null; pelajaran: { at: number; ringkas: string; poin: string[] } | null; gaya: Gaya[];
    hariIni: Konten[]; besok: Konten[]; semua: Konten[]; terbit: Konten[]; komentar: Komentar[]; rata: Rata;
    hari: string; sibuk: string; siap: boolean; tim: Array<{ id: string; nama: string; ada: boolean }>; ig: boolean;
    akunAktif: string; platform: string; akun: AkunInfo[]; platformInfo: Record<string, PlatInfo>; katalog: { look: ItemK[]; efek: ItemK[]; grade: ItemK[] };
    pengikut: Array<{ tgl: string; n: number; sumber: string }>; bisaKomentar: boolean; kunciTerisi: string[];
    tumbuh: { at: number; ringkas: string; rutinitas: Array<{ tugas: string; menit: number }>; tren: Array<{ topik: string; kenapa: string; ide: string }>; kolaborasi: string[]; giveaway: string; iklan: string; sumber: string } | null;
    laporan: { at: number; bulan: string; teks: string } | null;
    starter: { at: number; jawaban: Record<string, any>; ringkas: string } | null; setup: { at: number; selesai: boolean; langkah: Array<{ id: string; label: string; status: string; ket?: string }> } | null; paketProfil: PaketProfil | null;
}
interface PaketProfil { at: number; namaTampilan: string[]; username: string[]; bio: Array<{ teks: string; alasan: string }>; kategori: string; linkBio: { cta: string; isi: string[] }; highlight: Array<{ nama: string; isi: string; sampul: string }>; fotoProfil: string; banner: string; postPertama: Array<{ judul: string; format: string; alasan: string }>; tips: string[] }
/** Tautan gambar acuan gaya buatan Bapak (tautan sementara dari Berkas). */
function useGambarGaya(gaya: Gaya[]) {
    const [peta, setPeta] = useState<Record<string, string>>({});
    const kunci = gaya.filter((g) => g.contoh?.path).map((g) => `${g.id}:${g.contoh!.path}`).join('|');
    useEffect(() => {
        let batal = false;
        Promise.all(gaya.filter((g) => g.contoh?.path).map((g) => apiPost<{ url: string }>('/api/kantor/berkas/tautan', { p: g.contoh!.path }).then((r) => [g.id, `${serverBase()}${r.url}`] as const).catch(() => null)))
            .then((x) => { if (!batal) setPeta(Object.fromEntries(x.filter(Boolean) as Array<readonly [string, string]>)); });
        return () => { batal = true; };
    }, [kunci]); // eslint-disable-line react-hooks/exhaustive-deps
    return peta;
}
type Aksi = (p: Promise<any>, ok?: string) => void;

const LS = 'kantor:sosmed-tab';
const FMT_DASAR: Record<Format, { label: string; ico: string; pendek: string }> = { reel: { label: 'Reel', ico: '🎞️', pendek: 'R' }, feed: { label: 'Feed', ico: '🖼️', pendek: 'F' }, carousel: { label: 'Carousel', ico: '🗂️', pendek: 'C' }, story: { label: 'Story', ico: '⭕', pendek: 'S' }, video: { label: 'Video panjang', ico: '🎬', pendek: 'V' } };
/** Akun & platform yang sedang dibuka (dipakai semua panggilan API halaman ini). */
let GAMBAR: Record<string, string> = {};
let AKUN = 'utama', PLAT = 'instagram', PLAT_NAMA = 'Instagram', PLAT_LABEL: Record<string, string> = {}, FORMAT_URUT: Format[] = ['reel', 'feed', 'carousel', 'story'];
const FMT = new Proxy(FMT_DASAR, { get: (t, f: string) => (t as any)[f] && { ...(t as any)[f], label: PLAT_LABEL[f] || (t as any)[f].label } }) as typeof FMT_DASAR;
const VIDEO = (f: Format) => f === 'reel' || f === 'story' || f === 'video';
const RASIO = (f: Format) => (f === 'video' ? '16:9' : f === 'feed' || f === 'carousel' ? (PLAT === 'tiktok' ? '9:16' : '4:5') : '9:16');
function post<T = any>(path: string, body: unknown) { return apiPost<T>(`${path}${path.includes('?') ? '&' : '?'}akun=${encodeURIComponent(AKUN)}`, body); }
const LANGKAH: Array<{ s: Status[]; label: string }> = [{ s: ['rencana'], label: 'Ide' }, { s: ['sketsa', 'naskah'], label: 'Sketsa / naskah' }, { s: ['prompt'], label: 'Prompt siap' }, { s: ['aset', 'gagal'], label: 'Berkas masuk' }, { s: ['terjadwal', 'mengunggah', 'manual'], label: 'Dijadwalkan' }, { s: ['terbit'], label: 'Terbit' }];
const SIBUK: Record<string, string> = { revisi: 'Vino sedang merevisi sesuai catatan Bapak…', analisa: 'Tara sedang menganalisa niche…', strategi: 'Tara menganalisa niche, lalu Maya menyusun strategi & jadwal…', rencana: 'Maya sedang mengisi kalender…', naskah: 'Lala menulis naskah, lalu Vino menyiapkan prompt…', harian: 'Tim menyiapkan konten hari ini & besok…', hasil: 'Mengambil angka hasil & pengikut…', komentar: 'Mengambil komentar & menyiapkan draf balasan…', evaluasi: 'Maya sedang menganalisa hasil postingan…', pelajaran: 'Maya menarik pelajaran dari semua postingan…', desain: 'Kantor sedang mendesain slide…', tumbuh: 'Maya menyusun rencana pertumbuhan minggu ini…', laporan: 'Maya menulis laporan bulanan…', starter: 'Tim sedang menyiapkan akun…' };
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const tglId = (t: string, opt: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { ...opt, timeZone: 'UTC' });
const tambah = (t: string, n: number) => new Date(Date.parse(`${t}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const angka = (n?: number) => (n == null ? '–' : n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}rb` : n.toLocaleString('id-ID'));
const jamK = (k: Konten, x: Data) => (k.jam || x.strategi?.jam || '19:00').padStart(5, '0');
const waktuK = (k: Konten, x: Data) => Date.parse(`${k.tgl}T${jamK(k, x)}:00+07:00`);
const kapan = (k: Konten, x: Data) => `${tglId(k.tgl, { weekday: 'short', day: 'numeric', month: 'short' })} · ${jamK(k, x)}`;
const label = (k: Konten) => `${k.kode || ''}${k.pilih ? `-${k.pilih}` : ''}`;
const normal = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const cocok = (f: File, k: Konten) => (f.type.startsWith('video/') ? VIDEO(k.format) || k.format === 'carousel' : k.format !== 'reel' && k.format !== 'video');
const akhir = (k: Konten) => k.hasil?.slice().sort((a, b) => b.umurJam - a.umurJam)[0];

function Salin({ teks, label = 'Salin' }: { teks: string; label?: string }) {
    const [ok, setOk] = useState(false);
    return <button className="btn small" onClick={() => { navigator.clipboard?.writeText(teks).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }).catch(() => undefined); }}>{ok ? '✓ Tersalin' : <><Ikon e="📋" /> {`${label}`}</>}</button>;
}
function Fmt({ f }: { f: Format }) { return <span className={`sm-fmt f-${f}`}><Ikon e={FMT[f].ico} /> {FMT[f].label}</span>; }
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
    const [akunId, setAkunS] = useState(() => { try { return localStorage.getItem('kantor:sosmed-akun') || 'beranda'; } catch { return 'beranda'; } });
    const beranda = akunId === 'beranda';
    AKUN = beranda ? 'utama' : akunId;
    const d = useApi<Data>(`/api/kantor/sosmed?akun=${encodeURIComponent(AKUN)}`, 60_000);
    const x = d.data && d.data.akunAktif === AKUN ? d.data : null;
    if (x) { PLAT = x.platform; PLAT_NAMA = x.platformInfo[x.platform]?.nama || x.platform; PLAT_LABEL = x.platformInfo[x.platform]?.label || {}; FORMAT_URUT = (x.platformInfo[x.platform]?.format || FORMAT_URUT) as Format[]; }
    const nAntre = x?.semua.filter((k) => k.tgl >= x.hari && ['prompt', 'aset', 'gagal'].includes(k.status)).length || 0;
    const nKom = x?.komentar.filter((c) => c.status === 'draf' || c.status === 'baru').length || 0;
    const TAB = useMemo(() => beranda ? [{ k: 'ringkasan', ico: '📊', label: 'Ringkasan performa' }, { k: 'kalender', ico: '🗓️', label: 'Kalender master' }] : [
        { k: 'hari', ico: '🎬', label: 'Hari ini' }, { k: 'antre', ico: '📤', label: 'Antrean unggah', badge: nAntre || undefined }, { k: 'kalender', ico: '🗓️', label: 'Kalender' }, { k: 'aset', ico: '🧰', label: 'Gudang aset' }, { k: 'kinerja', ico: '📈', label: 'Hasil posting' }, { k: 'komentar', ico: '💬', label: 'Komentar & DM', badge: nKom || undefined }, { k: 'analisa', ico: '🔎', label: 'Analisa niche' }, { k: 'strategi', ico: '🧭', label: 'Strategi' },
        { k: 'gaya', ico: '🎨', label: 'Gaya & efek' }, { k: 'profil', ico: '🪪', label: 'Profil & bio' }, { k: 'akun', ico: '⚙️', label: 'Akun & tim' }
    ], [nKom, nAntre, beranda]);
    const [tabAkun, setTabAkun] = useState(() => { try { return localStorage.getItem(LS) || 'hari'; } catch { return 'hari'; } });
    const [tabBeranda, setTabBeranda] = useState('ringkasan');
    const tab = beranda ? tabBeranda : tabAkun;
    const setTab = (k: string) => { if (beranda) { setTabBeranda(k); return; } setTabAkun(k); try { localStorage.setItem(LS, k); } catch { /* */ } };
    const pilihAkun = (id: string) => { setAkunS(id); setBuka(null); try { localStorage.setItem('kantor:sosmed-akun', id); } catch { /* */ } };
    useSubNav(TAB, tab, setTab);
    const [msg, setMsg] = useState('');
    const [buka, setBuka] = useState<string | null>(null);
    const [kuis, setKuis] = useState(false);
    const [lain, setLain] = useState(false);
    const gambarGaya = useGambarGaya(d.data?.gaya || []);
    GAMBAR = gambarGaya;
    useInterval(() => d.reload(), x?.sibuk || x?.semua.some((k) => k.status === 'mengunggah') ? 5000 : null);
    const kabar = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 8000); };
    const aksi: Aksi = (p, ok) => { p.then(() => { if (ok) kabar(ok); d.reload(); }).catch((e) => kabar(String(e.message || e))); };
    const jalankan = (jenis: string, ok = 'Sedang dikerjakan tim — perkembangannya juga terlihat di Kantor → Papan kerja.', arahan = '') => aksi(post('/api/kantor/sosmed/jalankan', { jenis, arahan }), ok);
    const daftar = d.data?.akun || [];
    const kepala = (
        <>
            <div className="pg-head"><div><h2>Konten</h2><p>Tim menganalisa niche, menyusun kalender, naskah & prompt untuk semua akun. Bapak membuat video & suaranya, lalu tinggal Setujui.</p></div></div>
            <PilihAkun daftar={daftar} info={d.data?.platformInfo || {}} aktif={akunId} pilih={pilihAkun} aksi={aksi} kabar={kabar} />
        </>
    );
    if (!d.data) return <div className="pg sm">{kepala}<section className="sb-card">{d.error ? <div className="error">{d.error}</div> : <div className="pg-skel" style={{ height: 200 }} />}</section></div>;
    if (!beranda && !daftar.some((a) => a.id === akunId)) { setTimeout(() => pilihAkun('beranda'), 0); return null; }
    // Tab utama (dipakai tiap hari) di depan; sisanya di "Lainnya" supaya tidak 10 tab sejajar.
    const UTAMA = ['hari', 'antre', 'kalender', 'aset', 'kinerja', 'komentar'];
    const tombolTab = (t: (typeof TAB)[number]) => <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => { setTab(t.k); if (UTAMA.includes(t.k)) setLain(false); }}><Ikon e={t.ico} /> {t.label}{(t as any).badge ? <em>{(t as any).badge}</em> : null}</button>;
    const tabLain = beranda ? [] : TAB.filter((t) => !UTAMA.includes(t.k));
    const bukaLain = lain || tabLain.some((t) => t.k === tab);
    const tabs = beranda ? <div className="sm-tabs" role="tablist">{TAB.map(tombolTab)}</div> : (<>
        <div className="sm-tabs" role="tablist">{TAB.filter((t) => UTAMA.includes(t.k)).map(tombolTab)}
            <button type="button" className={`sm-tab-lain ${bukaLain ? 'on' : ''}`} aria-expanded={bukaLain} onClick={() => setLain(!bukaLain)}><Ikon e="⋯" /> Lainnya</button></div>
        {bukaLain && <div className="sm-tabs sm-tabs-2" role="tablist" aria-label="Tab lainnya">{tabLain.map(tombolTab)}</div>}
    </>);
    if (beranda) return <div className="pg sm">{kepala}{tabs}{msg && <div className="fin-alert">{msg}</div>}<Beranda tab={tab} akun={daftar} platform={d.data.platformInfo} pilihAkun={pilihAkun} kabar={kabar} /></div>;
    if (!x) return <div className="pg sm">{kepala}<section className="sb-card"><div className="pg-skel" style={{ height: 200 }} /></section></div>;
    const kartu = (k: Konten) => <KartuKonten key={k.id} k={k} x={x} buka={buka === k.id} onBuka={() => setBuka(buka === k.id ? null : k.id)} aksi={aksi} kabar={kabar} gambarGaya={gambarGaya} />;
    const p = { x, aksi, kabar, jalankan, kartu, setTab, gambarGaya };
    return (
        <div className="pg sm">
            {kepala}
            {tabs}
            {msg && <div className="fin-alert">{msg}</div>}
            {x.siap && <AngkaUtama x={x} setTab={setTab} />}
            {x.sibuk && <div className="hz-bukti ok"><span className="pk-jalan"><i /></span><span>{SIBUK[x.sibuk] || 'Tim sedang bekerja…'}</span></div>}
            {x.siap && !kuis && tab === 'hari' && x.setup?.langkah.some((l) => l.id === 'brand' && l.status === 'selesai') && <PilihPalet akun={akunId} kabar={kabar} kunci={String(x.setup.at)} muat={() => d.reload()} setup />}
            {x.siap && !kuis && tab === 'hari' && <LangkahBerikut x={x} setTab={setTab} />}
            {x.setup && (!x.setup.selesai || x.setup.langkah.some((l) => l.status === 'gagal') || (tab === 'hari' && Date.now() - x.setup.at < 86400_000)) && <ProgresSetup x={x} jalankan={jalankan} />}
            {(kuis || (!x.strategi && !x.starter && !x.setup)) && tab !== 'akun' ? <Starter key={x.akunAktif} platform={x.platformInfo[x.platform]} formatPlatform={x.platformInfo[x.platform]?.format || []} labelFormat={x.platformInfo[x.platform]?.label || {}}
                gaya={x.gaya.map((g) => ({ ...g, ket: g.deskripsi }))} katalog={x.katalog} sibuk={!!x.sibuk} gambarGaya={gambarGaya} batal={x.strategi || x.starter ? () => setKuis(false) : undefined}
                kirim={(jw: JawabanStarter) => { aksi(post('/api/kantor/sosmed/starter', { jawaban: jw }), 'Brief diterima. Tim mulai bekerja — progresnya terlihat di atas.'); setKuis(false); }} />
            : !x.siap && tab !== 'akun' && tab !== 'gaya' && <Mulai bukaKuis={() => setKuis(true)} />}
            {x.siap && <Hidup key={`${akunId}-hari`} aktif={tab === 'hari'}><RutinitasHari {...p} /><TabHari {...p} /></Hidup>}
            {x.siap && <Hidup key={`${akunId}-antre`} aktif={tab === 'antre'}><TabAntre {...p} /></Hidup>}
            {x.siap && <Hidup key={`${akunId}-kalender`} aktif={tab === 'kalender'}><TabKalender {...p} /></Hidup>}
            {x.siap && <Hidup key={`${akunId}-aset`} aktif={tab === 'aset'}><TabAset akun={akunId} kabar={kabar} namaAkun={x.akun.find((a) => a.id === akunId)?.nama || ''} /></Hidup>}
            {x.siap && <Hidup key={`${akunId}-analisa`} aktif={tab === 'analisa'}><TabAnalisa {...p} /></Hidup>}
            {x.siap && <Hidup key={`${akunId}-strategi`} aktif={tab === 'strategi'}><TabStrategi {...p} /><KartuTumbuh {...p} /></Hidup>}
            <Hidup key={`${akunId}-gaya`} aktif={tab === 'gaya'}><TabGaya {...p} /></Hidup>
            {x.siap && <Hidup key={`${akunId}-profil`} aktif={tab === 'profil'}><TabProfil {...p} /></Hidup>}
            {x.siap && <Hidup key={`${akunId}-kinerja`} aktif={tab === 'kinerja'}><TabKinerja {...p} /><KartuLaporan {...p} /></Hidup>}
            {x.siap && <Hidup key={`${akunId}-komentar`} aktif={tab === 'komentar'}><TabKomentar {...p} /></Hidup>}
            <Hidup key={`${akunId}-akun`} aktif={tab === 'akun'}><TabAkun {...p} muat={() => d.reload()} keBeranda={() => pilihAkun('beranda')} bukaKuis={() => { setKuis(true); setTab('hari'); }} /></Hidup>
        </div>
    );
}
/** Baris pemilih akun: Beranda (semua akun) + tiap akun + tambah akun baru. */
function PilihAkun({ daftar, info, aktif, pilih, aksi, kabar }: { daftar: AkunInfo[]; info: Record<string, PlatInfo>; aktif: string; pilih: (id: string) => void; aksi: Aksi; kabar: (m: string) => void }) {
    const [tambah, setTambah] = useState(false);
    const [f, setF] = useState({ nama: '', platform: 'tiktok', handle: '' });
    return (<>
        <nav className="sm-akun" aria-label="Pilih akun">
            <button className={aktif === 'beranda' ? 'on' : ''} onClick={() => pilih('beranda')}><span className="sm-akun-i"><Ikon e="🏠" /></span><span><b>Beranda</b><small>semua akun</small></span></button>
            {daftar.map((a) => (
                <button key={a.id} className={aktif === a.id ? 'on' : ''} onClick={() => pilih(a.id)} style={{ ['--ak' as any]: a.warna }}>
                    <span className="sm-akun-i">{info[a.platform]?.ikon || '•'}</span><span><b>{a.nama}</b><small>{info[a.platform]?.nama}{a.handle ? ` · ${a.handle}` : ''}{a.tersambung ? '' : ' · manual'}</small></span>{a.menunggu > 0 && <em>{a.menunggu}</em>}
                </button>
            ))}
            <button className="sm-akun-plus" onClick={() => setTambah(!tambah)} aria-expanded={tambah}>＋ Akun</button>
        </nav>
        {tambah && (
            <form className="sb-card sm-akun-f" onSubmit={(e) => { e.preventDefault(); apiPost<{ akun: AkunInfo }>('/api/kantor/sosmed/akun', f).then((r) => { setTambah(false); setF({ nama: '', platform: 'tiktok', handle: '' }); kabar(`Akun ${r.akun.nama} dibuat. Isi profilnya & sambungkan di tab "Akun & tim".`); aksi(Promise.resolve()); pilih(r.akun.id); }).catch((er) => kabar(String(er.message || er))); }}>
                <label>Nama akun (untuk Bapak)<input value={f.nama} maxLength={40} placeholder="mis. TikTok kuliner" onChange={(e) => setF({ ...f, nama: e.target.value })} /></label>
                <label>Platform<select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>{Object.entries(info).map(([id, p]) => <option key={id} value={id}><Ikon e={p.ikon} /> {p.nama}</option>)}</select></label>
                <label>Username / nama channel<input value={f.handle} maxLength={60} placeholder="@username" onChange={(e) => setF({ ...f, handle: e.target.value })} /></label>
                <div className="sm-aksi"><button className="btn primary" disabled={!f.nama.trim()}>Tambah akun</button><button type="button" className="btn small" onClick={() => setTambah(false)}>Batal</button></div>
                <small className="sb-note" style={{ gridColumn: '1 / -1', margin: 0 }}>Tiap akun punya strategi, kalender, dan hasil sendiri. Tim AI-nya sama. Format otomatis menyesuaikan platform ({info[f.platform]?.format.map((y) => info[f.platform]?.label[y] || y).join(', ')}).</small>
            </form>
        )}
    </>);
}
type P = { x: Data; aksi: Aksi; kabar: (m: string) => void; jalankan: (j: string, ok?: string, arahan?: string) => void; kartu: (k: Konten) => React.ReactElement; setTab: (k: string) => void; gambarGaya: Record<string, string> };

function Arahan({ nilai, set, ph }: { nilai: string; set: (v: string) => void; ph: string }) {
    return <label className="sm-arahan"><span><Ikon e="💬" /> Arahan Bapak <small>opsional · wajib diikuti tim</small></span><textarea rows={2} value={nilai} maxLength={1500} placeholder={ph} onChange={(e) => set(e.target.value)} /></label>;
}
function ProgresSetup({ x, jalankan }: { x: Data; jalankan: P['jalankan'] }) {
    const st = x.setup!; const ikon: Record<string, string> = { tunggu: '○', jalan: '⏳', selesai: '✅', gagal: '⚠️' };
    const selesai = st.langkah.filter((l) => l.status === 'selesai').length;
    const gagal = st.langkah.filter((l) => l.status === 'gagal').length;
    const jalan = x.sibuk === 'starter' || st.langkah.some((l) => l.status === 'jalan');
    const beres = st.selesai && !gagal;
    return (
        <section className={`sb-card sm-setup ${gagal && !jalan ? 'ada-gagal' : ''}`}>
            <div className="sd-h"><h3>{beres ? <><Ikon e="🎉" /> {'Akun siap'}</> : gagal && !jalan ? <><Ikon e="⚠️" /> {`${gagal} langkah belum berhasil`}</> : <><Ikon e="🚀" /> {'Tim sedang menyiapkan akun ini'}</>} <small>{selesai}/{st.langkah.length} langkah</small></h3></div>
            <div className="sm-setup-bar"><i style={{ width: `${(selesai / st.langkah.length) * 100}%` }} /></div>
            <ol>{st.langkah.map((l) => <li key={l.id} className={l.status}><span>{ikon[l.status]}</span>{l.label}{l.status === 'jalan' && <em className="pk-jalan"><i /></em>}{l.ket && <small> — {l.ket}</small>}</li>)}</ol>
            {beres && <p className="sb-note">Semua sudah dibuat. Ikuti kartu <b>Langkah berikutnya</b> — satu per satu, tidak perlu menebak harus ke tab mana.</p>}
            {gagal > 0 && !jalan && <div className="sm-setup-ulang"><p className="sb-note">Biasanya karena otak AI sedang sibuk atau kena batas. Langkah yang sudah berhasil tidak diulang.</p>
                <button className="btn primary" disabled={!!x.sibuk} onClick={() => jalankan('ulangSetup', 'Tim mencoba lagi langkah yang gagal — progresnya terlihat di sini.')}><Ikon e="↻" /> {'Coba lagi langkah yang gagal'}</button></div>}
            {jalan && <p className="sb-note">Sekitar 10–20 menit. Bapak boleh menutup halaman ini — Maya mengabari lewat chat saat selesai.</p>}
        </section>
    );
}
function TabProfil({ x, jalankan }: P) {
    const pk = x.paketProfil, [arahan, setArahan] = useState('');
    const nama = x.platformInfo[x.platform]?.nama || '';
    const batasBio = ({ tiktok: 80, instagram: 150, facebook: 255, youtube: 1000 } as Record<string, number>)[x.platform] || 150;
    return (
        <section className="sb-card sm-profil">
            <div className="sd-h"><h3>Profil & bio {nama} <small>{pk ? `oleh Maya · ${new Date(pk.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : 'belum dibuat'}</small></h3>
                <button className="btn small primary" disabled={!!x.sibuk} onClick={() => { jalankan('profil', 'Maya menyusun paket profil (±1–2 menit).', arahan); setArahan(''); }}>{pk ? <><Ikon e="↻" /> {'Buat ulang'}</> : 'Buatkan paket profil'}</button></div>
            <Arahan nilai={arahan} set={setArahan} ph="mis. 'bio lebih santai', 'sebut kelas Rp99rb', 'username jangan pakai angka'" />
            {!pk && <div className="fin-empty">Maya akan membuat nama tampilan, username, 3 versi bio, isi link bio, highlight, arahan foto profil, dan 3 postingan pertama.</div>}
            {pk && (<>
                <div className="sm-pk-grid">
                    <div><h4>Bio <small>pilih satu</small></h4>{pk.bio.map((b, i) => <div key={i} className="sm-blok sm-bio"><div className="sm-blok-h"><b>Versi {i + 1}</b><Salin teks={b.teks} label="Salin bio" /></div><p className="sm-p">{b.teks}</p><small className="sb-note">{b.alasan} · <span className={b.teks.length > batasBio ? 'sm-lebih' : ''}>{b.teks.length}/{batasBio} karakter{b.teks.length > batasBio ? ' — terlalu panjang, pangkas dulu' : ''}</span></small></div>)}</div>
                    <div>
                        <h4>Nama tampilan</h4><ul className="sm-pk-l">{pk.namaTampilan.map((n) => <li key={n}><span>{n}</span><Salin teks={n} /></li>)}</ul>
                        <h4>Username <small>cek ketersediaannya dulu</small></h4><ul className="sm-pk-l">{pk.username.map((n) => <li key={n}><span className="mono">@{n}</span><Salin teks={n} /></li>)}</ul>
                        {pk.kategori && <><h4>Kategori akun</h4><p className="sm-p">{pk.kategori}</p></>}
                        {pk.fotoProfil && <><h4>Foto profil</h4><p className="sm-p">{pk.fotoProfil}</p></>}
                        {pk.banner && <><h4>Banner / cover</h4><p className="sm-p">{pk.banner}</p></>}
                    </div>
                </div>
                {(pk.linkBio.cta || pk.linkBio.isi.length > 0) && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="🔗" /> Link di bio</b>{pk.linkBio.cta && <Salin teks={pk.linkBio.cta} label="Salin ajakan" />}</div>{pk.linkBio.cta && <p className="sm-p"><b>{pk.linkBio.cta}</b></p>}<ul>{pk.linkBio.isi.map((y) => <li key={y}>{y}</li>)}</ul></div>}
                {pk.highlight.length > 0 && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="⭕" /> {x.platform === 'instagram' || x.platform === 'facebook' ? 'Sorotan story (highlight)' : 'Seri / playlist'}</b></div><div className="sm-hl">{pk.highlight.map((h) => <div key={h.nama}><i>{h.nama.slice(0, 1)}</i><b>{h.nama}</b><p>{h.isi}</p><small>{h.sampul}</small></div>)}</div></div>}
                {pk.postPertama.length > 0 && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="📌" /> 3 postingan pertama</b><small className="sb-note" style={{ margin: 0 }}>untuk dipin di atas profil</small></div><ol className="sm-ol">{pk.postPertama.map((y) => <li key={y.judul}><b>{y.judul}</b> <span className="sm-pil">{y.format}</span><br /><small className="sb-note">{y.alasan}</small></li>)}</ol></div>}
                {pk.tips.length > 0 && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="⚙" /> Pengaturan akun</b></div><ul>{pk.tips.map((y) => <li key={y}>{y}</li>)}</ul></div>}
            </>)}
        </section>
    );
}
function Mulai({ bukaKuis }: { bukaKuis: () => void }) {
    return (
        <section className="sb-card sm-mulai">
            <h3>Brief akun ini belum lengkap</h3>
            <p className="sb-note">Jawab beberapa pertanyaan singkat (±3 menit). Setelah itu tim mengerjakan semuanya: riset niche, strategi, bio, kalender, sampai sketsa konten pertama.</p>
            <button className="btn primary" onClick={bukaKuis}>Isi brief sekarang</button>
        </section>
    );
}

/** Satu langkah yang perlu Bapak lakukan sekarang — supaya tidak perlu menebak harus ke tab mana. */
const LS_LANGKAH = (akun: string) => `kantor:sosmed-langkah:${akun}`;
function bacaSudah(akun: string): string[] { try { return JSON.parse(localStorage.getItem(LS_LANGKAH(akun)) || '[]'); } catch { return []; } }
export function LangkahBerikut({ x, setTab, ekstra }: { x: Data; setTab: (k: string) => void; ekstra?: Array<{ id: string; judul: string; ket: string; tab: string; tombol: string; manual?: boolean; aktif: boolean }> }) {
    const [sudah, setSudah] = useState(() => bacaSudah(x.akunAktif));
    useEffect(() => { setSudah(bacaSudah(x.akunAktif)); }, [x.akunAktif]);
    const tandai = (id: string) => { const b = [...new Set([...sudah, id])]; setSudah(b); try { localStorage.setItem(LS_LANGKAH(x.akunAktif), JSON.stringify(b)); } catch { /* */ } };
    if (!x.setup || !x.setup.selesai || x.setup.langkah.some((l) => l.status === 'gagal')) return null;
    const perluPilih = x.semua.filter((k) => k.tgl >= x.hari && k.status === 'sketsa').length;
    const perluBuat = x.semua.filter((k) => k.tgl >= x.hari && ['prompt', 'aset', 'gagal'].includes(k.status)).length;
    const kom = x.komentar.filter((c) => c.status === 'draf' || c.status === 'baru').length;
    const daftar = [
        { id: 'profil', judul: 'Pasang profil akun', ket: `Salin nama, username, dan bio pilihan ke ${PLAT_NAMA}, lalu pasang foto profil.`, tab: 'profil', tombol: 'Buka Profil & bio', manual: true, aktif: !!x.paketProfil },
        { id: 'gudang', judul: 'Isi Gudang aset', ket: 'Unggah logo, foto produk, maskot, atau foto tempat. Semua konten mengambil dari sini supaya feed konsisten.', tab: 'aset', tombol: 'Buka Gudang aset', manual: true, aktif: true },
        { id: 'brand', judul: 'Atur brand kit', ket: 'Minta usulan Maya untuk palet, font, gaya desain, dan konsep logo — lalu pilih yang Bapak suka. Ada juga foto profil & cover highlight siap pakai.', tab: 'aset', tombol: 'Atur brand kit', manual: true, aktif: true },
        ...(ekstra || []),
        { id: 'pilih', judul: `Pilih sketsa untuk ${perluPilih} konten`, ket: 'Tiap konten punya beberapa sketsa. Ketuk yang paling Bapak suka — tim lanjut menulis naskah & caption.', tab: 'hari', tombol: 'Pilih sketsa', aktif: perluPilih > 0 },
        { id: 'buat', judul: `Buat ${perluBuat} konten`, ket: 'Naskah & prompt sudah siap. Tekan "Kirim ke Claude" atau salin promptnya, lalu unggah hasilnya dan Setujui.', tab: 'antre', tombol: 'Buka Antrean unggah', aktif: perluBuat > 0 },
        { id: 'komentar', judul: `Balas ${kom} komentar/DM`, ket: 'Dea sudah menyiapkan draf balasan. Tinggal periksa dan kirim.', tab: 'komentar', tombol: 'Buka Komentar & DM', aktif: kom > 0 },
        { id: 'sambung', judul: `Sambungkan ${PLAT_NAMA} (opsional)`, ket: 'Supaya konten terbit otomatis tepat jamnya dan angka hasilnya terbaca sendiri. Tanpa ini pun tetap jalan — Bapak diingatkan untuk unggah manual.', tab: 'akun', tombol: 'Sambungkan', manual: true, aktif: !x.ig },
    ];
    const kini = daftar.find((l) => l.aktif && !(l.manual && sudah.includes(l.id)));
    const total = daftar.filter((l) => l.manual || l.aktif).length, beres = daftar.filter((l) => l.manual && sudah.includes(l.id)).length;
    return (
        <section className="sb-card sm-lanjut" aria-label="Langkah berikutnya">
            {kini ? (<>
                <small className="sm-lanjut-k">Langkah berikutnya{total > 1 ? ` · ${beres} beres` : ''}</small>
                <h3>{kini.judul}</h3>
                <p>{kini.ket}</p>
                <div className="sm-lanjut-a">
                    <button className="btn primary" onClick={() => setTab(kini.tab)}>{kini.tombol}</button>
                    {kini.manual && <button className="btn" onClick={() => tandai(kini.id)}>{kini.id === 'sambung' ? 'Nanti saja' : 'Sudah'}</button>}
                </div>
            </>) : (<>
                <small className="sm-lanjut-k">Langkah berikutnya</small>
                <h3><Ikon e="✅" /> Semua beres untuk sekarang</h3>
                <p>Tiap pagi tim menyiapkan sketsa untuk hari ini dan besok. Kalau ada yang perlu Bapak lakukan, muncul di sini.</p>
            </>)}
        </section>
    );
}

function TabHari({ x, jalankan, kartu, setTab }: P) {
    const minggu = Array.from({ length: 7 }, (_, i) => tambah(x.hari, i));
    const per = (t: string) => x.semua.filter((k) => k.tgl === t);
    const perluAksi = x.semua.filter((k) => k.tgl <= tambah(x.hari, 1) && ['prompt', 'aset', 'gagal'].includes(k.status)).length;
    const perluPilih = x.semua.filter((k) => k.tgl >= x.hari && k.status === 'sketsa').length;
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
            <div className="sd-h"><h3>Hari ini <small>{tglId(x.hari)} · unggah ±{x.strategi?.jam || '19:00'} WIB</small></h3><button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('harian')}><Ikon e="↻" /> Siapkan sekarang</button></div>
            {perluAksi > 0 && <p className="sm-tugas"><Ikon e="👉" /> {perluAksi} konten menunggu Bapak: salin prompt → buat videonya → unggah berkas → Setujui. Mau sekaligus banyak? <button className="btn small" onClick={() => setTab('antre')}>Buka Antrean unggah</button></p>}
            {perluPilih > 0 && <p className="sm-tugas"><Ikon e="✏" /> {perluPilih} konten punya 4 sketsa ide yang menunggu Bapak pilih. Buka kartunya, lihat storyboard-nya, lalu tekan "Pilih sketsa".</p>}
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
    const calon = [...butuh, ...siap];
    /** Dicocokkan HANYA lewat kode di nama berkas (mis. R1117-3.mp4). Selebihnya Bapak pilih sendiri supaya tidak tertukar. */
    const ambil = (files: File[]) => {
        const urut = calon.slice().sort((a, b) => label(b).length - label(a).length);
        setPasang(files.map((f) => { const n = normal(f.name); const k = urut.find((y) => y.kode && n.includes(normal(label(y))) && cocok(f, y)); return { f, id: k?.id || '' }; }));
    };
    const kembar = new Set(pasang.filter((p, i) => p.id && p.id !== '-' && calon.find((k) => k.id === p.id)?.format !== 'carousel' && pasang.findIndex((q) => q.id === p.id) !== i).map((p) => p.id));
    const belumDipilih = pasang.filter((p) => !p.id).length;
    const unggahSemua = async () => {
        const per = new Map<string, File[]>(); for (const p of pasang) if (p.id && p.id !== '-') per.set(p.id, [...(per.get(p.id) || []), p.f]);
        let i = 0, n = [...per.values()].reduce((a, b) => a + b.length, 0);
        try {
            for (const [id, files] of per) {
                const { folder } = await post<{ folder: string }>(`/api/kantor/sosmed/konten/${id}/folder`, {});
                for (let j = 0; j < files.length; j++) { i++; setJalan(`${i}/${n}`); const r = await unggahBerkas(folder, files[j], (q) => setJalan(`${i}/${n} · ${q}%`)); await post(`/api/kantor/sosmed/konten/${id}/aset`, { path: r.path, tambah: j > 0 }); }
            }
            setPasang([]); aksi(Promise.resolve(), `✓ ${n} berkas tersimpan di cloud VPS. Cek daftar "Siap disetujui", lalu tekan Setujui semua.`);
        } catch (e: any) { kabar(String(e.message || e)); } finally { setJalan(null); }
    };
    const dipilih = siap.filter((k) => pilih[k.id] !== false);
    const Baris = ({ k, kanan }: { k: Konten; kanan?: React.ReactNode }) => (
        <div className={`sm-ab f-${k.format}`}><span className="sm-kode">{label(k)}</span><span className="sm-ab-w">{kapan(k, x)}</span><Fmt f={k.format} /><b>{k.judul}{k.pilih ? <small> · sketsa #{k.pilih}</small> : null}</b>{kanan}</div>
    );
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>1 · Taruh banyak berkas sekaligus <small>{butuh.length} konten menunggu berkas</small></h3>
                <button className="btn primary" disabled={!butuh.length || !!jalan} onClick={() => ref.current?.click()}><Ikon e="⬆" /> Pilih berkas</button></div>
            <p className="sb-note" style={{ marginTop: 0 }}>Pilih semua video/gambar yang sudah jadi sekaligus, lalu tentukan <b>tiap berkas untuk konten yang mana</b>. Berkas yang namanya diawali kode konten (mis. <span className="mono">R1117-3.mp4</span> = Reel 17 Nov, sketsa #3) langsung dikenali; selebihnya Bapak pilih sendiri.</p>
            <input ref={ref} type="file" multiple hidden accept="video/mp4,video/quicktime,image/jpeg,image/png" onChange={(e) => { const f = Array.from<File>(e.target.files || []).slice(0, 30); if (f.length) ambil(f); e.target.value = ''; }} />
            {pasang.length > 0 && (<>
                <div className="sm-pasang">{pasang.map((p, i) => (
                    <div key={i} className={!p.id ? 'kurang' : kembar.has(p.id) ? 'kembar' : p.id === '-' ? 'lewat' : 'ok'}><span className="sm-pasang-f">{p.f.type.startsWith('video/') ? <Ikon e="🎞" /> : <Ikon e="🖼" />} {p.f.name}<small>{(p.f.size / 1048576).toFixed(1)} MB{p.id && p.id !== '-' && normal(p.f.name).includes(normal(label(calon.find((k) => k.id === p.id)!))) ? ' · dikenali dari nama berkas' : ''}</small></span><span aria-hidden="true">→</span>
                        <select value={p.id} onChange={(e) => setPasang(pasang.map((y, j) => (j === i ? { ...y, id: e.target.value } : y)))} aria-label={`Konten untuk ${p.f.name}`}>
                            <option value="">— pilih untuk konten mana —</option>
                            {calon.filter((k) => cocok(p.f, k)).map((k) => <option key={k.id} value={k.id}>[{label(k)}] {FMT[k.format].label} · {kapan(k, x)} · {k.judul}{k.pilih ? ` · sketsa #${k.pilih}` : ''}</option>)}
                            <option value="-">Lewati berkas ini</option>
                        </select>{kembar.has(p.id) && <small className="sm-kembar">Dua berkas menuju konten yang sama</small>}</div>
                ))}</div>
                <div className="sm-aksi"><button className="btn primary" disabled={!!jalan || belumDipilih > 0 || kembar.size > 0 || !pasang.some((p) => p.id && p.id !== '-')} onClick={unggahSemua}>{jalan ? `Mengunggah ${jalan}…` : `Unggah semua (${pasang.filter((p) => p.id && p.id !== '-').length})`}</button>{belumDipilih > 0 && <small className="sb-note" style={{ margin: 0 }}>{belumDipilih} berkas belum ditentukan kontennya.</small>}<button className="btn small" disabled={!!jalan} onClick={() => setPasang([])}>Batal</button></div>
                <p className="sb-note">Carousel: beberapa gambar boleh dipasangkan ke carousel yang sama; urutannya mengikuti urutan di sini.</p>
            </>)}
            {!pasang.length && butuh.length > 0 && <div className="sm-ablist">{butuh.map((k) => <Baris key={k.id} k={k} kanan={<em className="sm-ab-s">{k.status === 'prompt' ? 'prompt siap' : 'belum ada berkas'}</em>} />)}</div>}
            {!butuh.length && <div className="fin-empty">Semua konten mendatang sudah punya berkas. {x.semua.some((k) => k.tgl >= x.hari && (k.status === 'rencana' || k.status === 'naskah')) ? 'Sebagian masih ide/naskah: buka Kalender untuk membuat promptnya.' : ''}</div>}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>2 · Siap disetujui <small>{siap.length}</small></h3>
                <button className="btn primary" disabled={!dipilih.length} onClick={async () => { if ((await konfirmasi(`Setujui ${dipilih.length} konten? Masing-masing ${x.ig ? 'terbit otomatis' : 'diingatkan lewat chat Maya'} pada tanggal & jamnya.`))) aksi(post<{ dijadwalkan: number; masalah: string[] }>('/api/kantor/sosmed/setujui-semua', { ids: dipilih.map((k) => k.id) }).then((r) => { if (r.masalah.length) kabar(`${r.dijadwalkan} dijadwalkan. Belum bisa: ${r.masalah.join(' · ')}`); return r; }), `✓ ${dipilih.length} konten dijadwalkan.`); }}>✓ Setujui semua ({dipilih.length})</button></div>
            {!siap.length && <div className="fin-empty">Belum ada konten yang berkasnya sudah masuk.</div>}
            <div className="sm-ablist">{siap.map((k) => <label key={k.id} className="sm-ab-c"><input type="checkbox" checked={pilih[k.id] !== false} onChange={(e) => setPilih({ ...pilih, [k.id]: e.target.checked })} /><Baris k={k} kanan={<em className="sm-ab-s"><Ikon e="📁" /> {k.aset?.nama}{k.asetLain?.length ? ` +${k.asetLain.length}` : ''}</em>} /></label>)}</div>
            {siap.length > 0 && <p className="sb-note">Caption ikut terunggah apa adanya; periksa dulu di tab Caption pada kartunya bila perlu. Jam bisa diubah di kartu konten.</p>}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>3 · Terjadwal <small>{jadwal.length}</small></h3></div>
            {!jadwal.length && <div className="fin-empty">Belum ada yang terjadwal.</div>}
            <div className="sm-ablist">{jadwal.map((k) => <Baris key={k.id} k={k} kanan={k.status === 'mengunggah' ? <span className="pk-jalan"><i /> mengunggah…</span> : k.status === 'manual' ? <em className="sm-ab-s">unggah manual</em> : <button className="btn small" onClick={() => aksi(post(`/api/kantor/sosmed/konten/${k.id}/batal`, {}), 'Jadwal dibatalkan.')}>Batalkan</button>} />)}</div>
            <p className="sb-note">{x.ig ? 'Kantor mengunggah tepat pada jamnya (dicek tiap menit) dan mengabari Bapak lewat chat Maya.' : `${PLAT_NAMA} belum tersambung: pada jamnya Bapak diingatkan lewat chat Maya untuk mengunggah manual. Sambungkan akun di Akun & tim supaya terbit otomatis.`} <button className="btn small" onClick={() => setTab('kalender')}>Lihat kalender</button></p>
        </section>
    </>);
}

function TabKalender({ x, aksi, jalankan, kartu }: P) {
    const [bulan, setBulan] = useState(x.hari.slice(0, 7));
    const [pilih, setPilih] = useState(x.hari);
    const [ubahJadwal, setUbahJadwal] = useState(false);
    const [arahan, setArahan] = useState('');
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
                <div className="sm-aksi"><button className="btn small" disabled={!!x.sibuk} onClick={() => { jalankan('rencana', 'Maya mengisi 7 hari ke depan sesuai jadwal.', arahan); setArahan(''); }}>Isi 7 hari</button><button className="btn small primary" disabled={!!x.sibuk} onClick={() => { jalankan('bulan', 'Maya mengisi 30 hari ke depan (bertahap, ±5–10 menit).', arahan); setArahan(''); }}>Isi 30 hari</button></div>
            </div>
            <Arahan nilai={arahan} set={setArahan} ph="Arahan untuk Maya sebelum mengisi kalender (opsional), mis. 'minggu depan Harbolnas 12.12, banyakin konten promo', 'coba seri bersambung 3 bagian'" />
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
            <button className="btn primary" disabled={!x.strategi} onClick={() => { aksi(post('/api/kantor/sosmed/jadwal', { jadwal: j, jam }), 'Jadwal disimpan. Slot baru akan diisi saat kalender diisi berikutnya.'); selesai(); }}>Simpan jadwal</button>
            {!x.strategi && <small className="sb-note">Susun strategi dulu.</small>}</div>
    </>);
}
function IdeBaru({ x, tgl, aksi }: { x: Data; tgl: string; aksi: Aksi }) {
    const [f, setF] = useState({ judul: '', format: 'reel' as Format, pilar: x.strategi?.pilar[0]?.nama || '', gayaId: '' });
    if (tgl < x.hari) return null;
    return (
        <form className="sm-ide" onSubmit={(e) => { e.preventDefault(); if (!f.judul.trim()) return; aksi(post('/api/kantor/sosmed/konten', { ...f, tgl }), 'Ide ditambahkan. Buka kartunya lalu tekan "Buat naskah & prompt".'); setF({ ...f, judul: '' }); }}>
            <input placeholder={`Ide sendiri untuk ${tglId(tgl, { day: 'numeric', month: 'short' })}…`} value={f.judul} maxLength={90} onChange={(e) => setF({ ...f, judul: e.target.value })} />
            <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as Format })} aria-label="Format">{FORMAT_URUT.map((y) => <option key={y} value={y}>{FMT[y].label}</option>)}</select>
            {VIDEO(f.format) && <select value={f.gayaId} onChange={(e) => setF({ ...f, gayaId: e.target.value })} aria-label="Gaya"><option value="">Gaya: otomatis</option>{x.gaya.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}</select>}
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

/** Rencana pertumbuhan mingguan (di luar posting): tren, kolaborasi, giveaway, iklan. */
function KartuTumbuh({ x, jalankan }: P) {
    const t = x.tumbuh;
    return (
        <section className="sb-card sm-tumbuh">
            <div className="sd-h"><h3><Ikon e="🌱" /> Rencana pertumbuhan minggu ini <small>{t ? `diperbarui ${new Date(t.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · otomatis tiap Senin` : 'otomatis tiap Senin'}</small></h3>
                <button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('tumbuh', 'Maya menyusun rencana pertumbuhan (±1–3 menit).')}>{t ? <><Ikon e="↻" /> Susun ulang</> : 'Susun sekarang'}</button></div>
            {!t ? <div className="fin-empty">Di luar posting: rutinitas interaksi harian, tren yang sedang naik, ide kolaborasi, giveaway, dan kapan layak pasang iklan.</div> : (<>
                {t.ringkas && <p className="sm-p">{t.ringkas}</p>}
                {t.tren.length > 0 && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="📈" /> Tren yang bisa dipakai</b></div><ul>{t.tren.map((y) => <li key={y.topik}><b>{y.topik}</b> — {y.kenapa}<br /><small className="sb-note">Ide: {y.ide}</small></li>)}</ul></div>}
                {t.kolaborasi.length > 0 && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="🤝" /> Kolaborasi</b></div><ul>{t.kolaborasi.map((y) => <li key={y}>{y}</li>)}</ul></div>}
                {t.giveaway && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="🎁" /> Giveaway / kuis</b></div><p className="sm-p">{t.giveaway}</p></div>}
                {t.iklan && <div className="sm-blok"><div className="sm-blok-h"><b><Ikon e="📣" /> Iklan (boost)</b></div><p className="sm-p">{t.iklan}</p></div>}
                {t.sumber && <small className="sb-note">Sumber: {t.sumber}</small>}
            </>)}
        </section>
    );
}
/** Daftar interaksi harian (Dea): dicentang per hari di HP ini. */
function RutinitasHari({ x }: P) {
    const t = x.tumbuh?.rutinitas || [];
    const kunci = `kantor:sosmed-rutin:${x.akunAktif}:${x.hari}`;
    const [ok, setOk] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem(kunci) || '[]'); } catch { return []; } });
    useEffect(() => { try { setOk(JSON.parse(localStorage.getItem(kunci) || '[]')); } catch { setOk([]); } }, [kunci]);
    if (!t.length) return null;
    const togel = (i: number) => { const b = ok.includes(i) ? ok.filter((y) => y !== i) : [...ok, i]; setOk(b); try { localStorage.setItem(kunci, JSON.stringify(b)); } catch { /* */ } };
    const menit = t.reduce((a, y) => a + y.menit, 0);
    return (
        <section className="sb-card sm-rutin" aria-label="Rutinitas interaksi hari ini">
            <div className="sd-h"><h3><Ikon e="💬" /> Rutinitas interaksi hari ini <small>{ok.length}/{t.length} beres · ±{menit} menit</small></h3></div>
            <ul>{t.map((y, i) => <li key={i}><label className="st-cek"><input type="checkbox" checked={ok.includes(i)} onChange={() => togel(i)} /> <span className={ok.includes(i) ? 'coret' : ''}>{y.tugas}</span> <small className="sb-note">{y.menit} mnt</small></label></li>)}</ul>
        </section>
    );
}
/** Laporan bulanan ala agency. */
function KartuLaporan({ x, jalankan }: P) {
    const l = x.laporan, [buka, setBuka] = useState(false);
    return (
        <section className="sb-card sm-laporan">
            <div className="sd-h"><h3><Ikon e="📊" /> Laporan bulanan <small>{l ? `terakhir: ${l.bulan}` : 'otomatis tiap awal bulan'} · juga dikirim ke chat Maya</small></h3>
                <button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('laporan', 'Maya menulis laporan bulan ini (±1–2 menit).')}>Buat laporan bulan ini</button></div>
            {l ? (<><button className="btn-link" onClick={() => setBuka(!buka)} aria-expanded={buka}>{buka ? 'Sembunyikan' : `Baca laporan ${l.bulan}`}</button>{buka && <pre className="sm-pre sm-laporan-isi">{l.teks}</pre>}</>)
                : <div className="fin-empty">Ringkasan angka, konten terbaik & terlemah, dan rencana bulan depan — seperti laporan agency ke klien.</div>}
        </section>
    );
}
function TabStrategi({ x, jalankan }: P) {
    const [arahan, setArahan] = useState('');
    const s = x.strategi;
    return (
        <section className="sb-card sm-strategi">
            <div className="sd-h"><h3>Niche & pilar konten</h3><button className="btn small primary" disabled={!!x.sibuk} onClick={() => { jalankan('strategi', undefined, arahan); setArahan(''); }}>{s ? 'Susun ulang strategi' : 'Susun strategi'}</button></div>
            <Arahan nilai={arahan} set={setArahan} ph="Arahan untuk strategi (opsional), mis. 'fokus jualan kelas bulan ini', 'kurangi carousel, perbanyak video'" />
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

function TabGaya({ x, aksi, kabar, gambarGaya }: P) {
    const [lihat, setLihat] = useState<'grade' | 'efek' | ''>('');
    const [f, setF] = useState({ nama: '', jenis: 'animasi', deskripsi: '' });
    const [naik, setNaik] = useState<string | null>(null);
    const ref = useRef<HTMLInputElement>(null); const target = useRef('');
    const pasangContoh = async (file: File) => {
        const id = target.current;
        try { const { folder } = await post<{ folder: string }>(`/api/kantor/sosmed/gaya/${id}/folder`, {}); setNaik(id); const r = await unggahBerkas(folder, file, () => undefined); aksi(post(`/api/kantor/sosmed/gaya/${id}/ubah`, { contoh: { path: r.path } }), 'Gambar acuan tersimpan. Vino akan menyebutnya di setiap prompt gaya ini.'); }
        catch (e: any) { kabar(String(e.message || e)); } finally { setNaik(null); }
    };
    const real = x.gaya.filter((g) => g.jenis === 'real'), anim = x.gaya.filter((g) => g.jenis === 'animasi');
    const Kartu = ({ g }: { g: Gaya }) => (
        <div className={`sm-gaya ${x.profil.gayaVideo === g.id ? 'on' : ''}`}>
            <PratinjauGaya id={g.id} gambar={gambarGaya[g.id]} />
            <div className="sm-gaya-h"><b>{g.nama}</b>{x.profil.gayaVideo === g.id && <em>utama</em>}</div>
            <p>{g.deskripsi}</p>
            {g.contoh && <small><Ikon e="🖼" /> Acuan: {g.contoh.nama}</small>}
            <div className="sm-aksi kecil">
                {x.profil.gayaVideo !== g.id && <button className="btn small" onClick={() => aksi(post('/api/kantor/sosmed/profil', { gayaVideo: g.id }), `${g.nama} jadi gaya utama.`)}>Jadikan utama</button>}
                {!g.bawaan && <><button className="btn small" disabled={naik === g.id} onClick={() => { target.current = g.id; ref.current?.click(); }}>{naik === g.id ? 'Mengunggah…' : g.contoh ? 'Ganti gambar acuan' : <><Ikon e="⬆" /> {'Gambar acuan'}</>}</button>
                    <button className="btn small" onClick={async () => { if ((await konfirmasi(`Hapus gaya "${g.nama}"?`))) aksi(post(`/api/kantor/sosmed/gaya/${g.id}/hapus`, {}), 'Gaya dihapus.'); }}><Ikon e="🗑" /></button></>}
            </div>
        </div>
    );
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>Gaya video <small>dipakai Vino saat menulis prompt reel & story</small></h3>
                {x.profil.gayaVideo !== 'otomatis' && <button className="btn small" onClick={() => aksi(post('/api/kantor/sosmed/profil', { gayaVideo: 'otomatis' }), 'Gaya kembali otomatis: Maya memilih yang cocok untuk tiap konten.')}>Kembali ke otomatis</button>}</div>
            <p className="sb-note" style={{ marginTop: 0 }}>{x.profil.gayaVideo === 'otomatis' ? <><Ikon e="✨" /> {'Saat ini otomatis: Maya memilih gaya yang paling cocok untuk tiap konten. Bapak tetap bisa mengganti gaya per konten.'}</> : `Gaya utama: ${x.gaya.find((g) => g.id === x.profil.gayaVideo)?.nama}. Bisa diganti per konten di kartunya.`}</p>
            <h4 className="sm-sub"><Ikon e="🎥" /> Real</h4>
            <p className="sb-note">Bapak merekam mentahan dengan HP, lalu memberikannya ke Claude bersama <b>prompt edit</b> dari Vino. Kartu konten juga berisi daftar apa saja yang perlu direkam.</p>
            <div className="sm-gaya-grid">{real.map((g) => <Kartu key={g.id} g={g} />)}</div>
            <h4 className="sm-sub"><Ikon e="✏" /> Animasi</h4>
            <p className="sb-note">Prompt video ditulis lengkap dengan ciri gaya, tokoh yang konsisten, dan adegan per detik, siap ditempel ke pembuat video AI.</p>
            <div className="sm-gaya-grid">{anim.map((g) => <Kartu key={g.id} g={g} />)}</div>
            <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const fl = e.target.files?.[0]; if (fl) pasangContoh(fl); e.target.value = ''; }} />
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Color grade <small>{x.profil.grade === 'otomatis' ? 'dipilih AI per konten' : x.profil.grade === 'tanpa' ? 'tanpa color grade' : `utama: ${x.katalog.grade.find((y) => y.id === x.profil.grade)?.nama}`}</small></h3>
                <div className="sm-aksi">{x.profil.grade !== 'otomatis' && <button className="btn small" onClick={() => aksi(post('/api/kantor/sosmed/profil', { grade: 'otomatis' }), 'Color grade kembali dipilih AI.')}>Otomatis</button>}<button className="btn small" onClick={() => setLihat(lihat === 'grade' ? '' : 'grade')}>{lihat === 'grade' ? 'Tutup contoh' : 'Lihat contoh'}</button></div></div>
            <p className="sb-note" style={{ marginTop: 0 }}>Contoh di bawah adalah perkiraan suasana warna pada satu adegan yang sama (gambar buatan kantor, bukan cuplikan film). Ketuk untuk menjadikannya warna utama akun ini.</p>
            {lihat === 'grade' && <GaleriPilih jenis="grade" daftar={x.katalog.grade} pilih={[x.profil.grade]} onPilih={(id) => aksi(post('/api/kantor/sosmed/profil', { grade: id }), `${x.katalog.grade.find((y) => y.id === id)?.nama} jadi color grade utama.`)} />}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Efek video <small>{x.katalog.efek.length} efek · skill video-edit</small></h3><button className="btn small" onClick={() => setLihat(lihat === 'efek' ? '' : 'efek')}>{lihat === 'efek' ? 'Tutup contoh' : 'Lihat contoh'}</button></div>
            <p className="sb-note" style={{ marginTop: 0 }}>Gambaran gerak tiap efek. Efek dipilih per sketsa di editor (<Ikon e="✏" /> Edit / revisi). <Ikon e="⭐" /> = sudah ada di skill publik; yang lain dibuat ulang Claude dari deskripsinya, jadi hasilnya bisa sedikit berbeda.</p>
            {lihat === 'efek' && <GaleriPilih jenis="efek" daftar={x.katalog.efek} pilih={[]} onPilih={() => undefined} />}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Tambah gaya sendiri</h3></div>
            <p className="sb-note" style={{ marginTop: 0 }}>Tulis ciri-cirinya (warna, garis, tekstur, gerakan, suasana). Setelah tersimpan, tekan "Gambar acuan" untuk menaruh contoh gambarnya.</p>
            <form className="sm-form" onSubmit={(e) => { e.preventDefault(); aksi(post('/api/kantor/sosmed/gaya', f), 'Gaya baru tersimpan.'); setF({ nama: '', jenis: 'animasi', deskripsi: '' }); }}>
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
                <div className="sm-aksi">{x.ig && <button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('hasil')}><Ikon e="↻" /> Ambil angka dari {PLAT_NAMA}</button>}<button className="btn small primary" disabled={!!x.sibuk || r.n < 2} onClick={() => jalankan('pelajaran')}>Tarik pelajaran</button></div></div>
            <div className="sm-metrik">{([['Tayang', r.tayang], ['Jangkauan', r.jangkauan], ['Suka', r.suka], ['Komentar', r.komentar], ['Simpan', r.simpan], ['Bagikan', r.bagikan]] as Array<[string, number | undefined]>).map(([l, v]) => <div key={l}><small>{l}</small><b>{angka(v)}</b></div>)}</div>
            <p className="sb-note">{x.ig ? 'Angka diambil otomatis ±24 jam dan ±7 hari setelah terbit (story sebelum 24 jam), lalu Maya menilai tiap postingan.' : `${PLAT_NAMA} belum tersambung: isi angka dari Insight statistik postingan di tab "Hasil" pada kartu tiap konten, lalu Maya menilainya.`}</p>
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
            <div className="sd-h"><h3>Komentar masuk <small>draf balasan oleh Dea</small></h3>{x.ig && <button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('komentar')}><Ikon e="↻" /> Ambil komentar baru</button>}</div>
            {x.ig ? <p className="sb-note" style={{ marginTop: 0 }}>Komentar dari postingan 14 hari terakhir diambil otomatis tiap ±30 menit. Balasan hanya terkirim saat Bapak menekan <b>Kirim</b>.</p>
                : <p className="sb-note" style={{ marginTop: 0 }}>{x.bisaKomentar ? `${PLAT_NAMA} belum tersambung, jadi` : `Komentar ${PLAT_NAMA} belum bisa diambil lewat API, jadi`} komentar belum bisa diambil otomatis. Tempel komentar atau DM di kotak bawah untuk dibuatkan draf balasan.</p>}
            {!x.komentar.length && x.ig && <div className="fin-empty">Tidak ada komentar yang menunggu balasan.</div>}
            {x.komentar.map((c) => <KartuKomentar key={c.id} c={c} ig={x.ig} aksi={aksi} />)}
        </section>
        <Balas kabar={kabar} />
        <section className="sb-card"><p className="sb-note" style={{ margin: 0 }}>DM belum bisa ditarik otomatis: platform mewajibkan aplikasi yang sudah ditinjau untuk akses pesan. Sementara itu, tempel DM di kotak atas untuk dibuatkan draf.</p></section>
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
            {c.status === 'baru' && !c.draf ? <div className="sm-aksi"><button className="btn small" onClick={() => aksi(post(url('draf'), {}), 'Draf balasan dibuat.')}>Buatkan draf</button><button className="btn small" onClick={() => aksi(post(url('abaikan'), {}))}>Abaikan</button></div> : (<>
                <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} aria-label="Draf balasan" />
                {c.galat && <div className="error">{c.galat}</div>}
                <div className="sm-aksi">{ig ? <button className="btn small primary" disabled={!v.trim()} onClick={async () => { if ((await konfirmasi(`Kirim balasan ke @${c.user}?`))) aksi(post(url('kirim'), { draf: v }), '✓ Balasan terkirim.'); }}>Kirim balasan</button> : <Salin teks={v} label="Salin balasan" />}
                    {v !== (c.draf || '') && <button className="btn small" onClick={() => aksi(post(url('ubah'), { draf: v }), 'Draf disimpan.')}>Simpan draf</button>}
                    <button className="btn small" onClick={() => aksi(post(url('abaikan'), {}))}>Abaikan</button></div>
            </>)}
        </div>
    );
}
function Balas({ kabar }: { kabar: (m: string) => void }) {
    const [t, setT] = useState(''); const [draf, setDraf] = useState(''); const [tunggu, setTunggu] = useState(false);
    return (
        <section className="sb-card">
            <div className="sd-h"><h3>Tempel komentar / DM</h3></div>
            <div className="sm-edit"><textarea rows={3} placeholder={`Tempel komentar atau DM dari ${PLAT_NAMA} di sini…`} value={t} onChange={(e) => setT(e.target.value)} />
                <button className="btn" disabled={!t.trim() || tunggu} onClick={() => { setTunggu(true); post<{ draf: string }>('/api/kantor/sosmed/balas', { komentar: t }).then((r) => setDraf(r.draf)).catch((e) => kabar(String(e.message || e))).finally(() => setTunggu(false)); }}>{tunggu ? 'Dea sedang menulis…' : 'Buatkan draf balasan'}</button></div>
            {draf && <div className="sm-blok" style={{ marginTop: 10 }}><div className="sm-blok-h"><b>Draf balasan</b><Salin teks={draf} /></div><pre>{draf}</pre></div>}
        </section>
    );
}

const SKILL: Record<string, string> = { sosmed: '/ig-plan · /ig-profile · /ig-audit', 'sosmed-riset': '/ig-viral · /ig-audit', 'sosmed-penulis': '/reels-cepat · /ig-reel · /ig-caption · /ig-carousel · /ig-story · /ig-repurpose · /ig-human', 'sosmed-produksi': '/video-edit · /ig-human + prompt per gaya', 'sosmed-komunitas': '/ig-reply · /ig-comment · /ig-dm' };
const TUGAS: Record<string, string> = { sosmed: 'Strategi, jadwal format, kalender, evaluasi hasil & pelajaran', 'sosmed-riset': 'Analisa niche: masalah penonton, pola yang berhasil, celah, akun acuan', 'sosmed-penulis': '3 sudut + skor, hook, naskah, voiceover, shot list, subtitle, caption per platform', 'sosmed-produksi': 'Prompt video/gambar sesuai gaya, daftar rekam & prompt edit (real), prompt suara ElevenLabs, unggah', 'sosmed-komunitas': 'Draf balasan komentar & DM' };
/** R9 Autopilot: posting & DM otomatis untuk akun ini (API resmi), dengan rem pengaman. */
interface Autopilot { aktif: boolean; jedaJam: number; balas: boolean; dm: { aktif: boolean; kata: string[]; pesan: string; perJam: number }; log: Array<{ at: number; jenis: string; teks: string }> }
function KartuAutopilot() {
    const r = useApi<{ autopilot: Autopilot; tersambung: boolean; platform: string }>(`/api/kantor/sosmed/autopilot?akun=${encodeURIComponent(AKUN)}`, 60_000);
    const [ubah, setUbah] = useState<Partial<Autopilot> & { kata?: string } | null>(null);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
    const a = r.data?.autopilot;
    if (!a) return null;
    const v = { ...a, ...(ubah || {}), dm: { ...a.dm, ...((ubah as any)?.dm || {}) } } as Autopilot;
    const kata = ubah?.kata ?? a.dm.kata.join(', ');
    const simpan = async (patch: any) => {
        setBusy(true); setErr('');
        try { await post('/api/kantor/sosmed/autopilot', patch); setUbah(null); r.reload(); } catch (e: any) { setErr(String(e.message || e)); }
        setBusy(false);
    };
    const set = (patch: any) => setUbah((u) => ({ ...(u || {}), ...patch, dm: { ...((u as any)?.dm || {}), ...(patch.dm || {}) } }));
    return (
        <section className={`sb-card ap ${a.aktif ? 'on' : ''}`}>
            <div className="ap-kepala">
                <div><h3>Autopilot</h3><p className="sb-note">{a.aktif ? 'Menyala. Konten yang medianya siap terbit sendiri; balasan & DM berjalan sesuai aturan di bawah.' : 'Mati. Semua posting & balasan menunggu Bapak menekan Setujui/Kirim.'}</p></div>
                <button role="switch" aria-checked={a.aktif} className={`ap-saklar ${a.aktif ? 'on' : ''}`} disabled={busy || (!a.aktif && !r.data?.tersambung)} onClick={() => simpan({ aktif: !a.aktif })}><span /></button>
            </div>
            {!r.data?.tersambung && <p className="fin-alert">Sambungkan akun Instagram Profesional di bawah dulu. Autopilot hanya memakai API resmi Meta.</p>}
            <div className="ap-grid">
                <label>Jeda sebelum terbit<select className="select" value={v.jedaJam} onChange={(e) => set({ jedaJam: Number(e.target.value) })}>{[0.5, 1, 2, 4, 8, 12, 24].map((j) => <option key={j} value={j}>{j < 1 ? '30 menit' : `${j} jam`}</option>)}</select><small>Waktu Bapak untuk membatalkan dari menu Konten.</small></label>
                <label className="ap-cek"><input type="checkbox" checked={v.balas} onChange={(e) => set({ balas: e.target.checked })} /> Kirim balasan komentar yang sudah didraf Dea</label>
                <label className="ap-cek"><input type="checkbox" checked={v.dm.aktif} onChange={(e) => set({ dm: { aktif: e.target.checked } })} /> DM otomatis untuk komentar berkata kunci</label>
                {v.dm.aktif && (<>
                    <label>Kata kunci (pisahkan dengan koma)<input className="input" value={kata} placeholder="mis. AGENCY, LINK, MAU" onChange={(e) => set({ kata: e.target.value })} /></label>
                    <label>Isi DM<textarea className="textarea" rows={3} value={v.dm.pesan} maxLength={1000} placeholder="Hai {nama}! Ini link yang kamu minta: …" onChange={(e) => set({ dm: { pesan: e.target.value } })} /><small>{'{nama}'} diganti username yang berkomentar.</small></label>
                    <label>Maksimal DM per jam<input className="input" type="number" min={1} max={60} value={v.dm.perJam} onChange={(e) => set({ dm: { perJam: Number(e.target.value) } })} /></label>
                </>)}
            </div>
            <p className="sb-note">Rem pengaman: komentar soal janji untung, harga pasti, rekening, kata sandi, KTP, atau keluhan serius tidak pernah dibalas otomatis. Satu komentar maksimal satu DM. DM butuh izin pesan Instagram pada token akun.</p>
            {err && <div className="error">{err}</div>}
            {ubah && <div className="sm-aksi"><button className="btn primary" disabled={busy} onClick={() => simpan({ jedaJam: v.jedaJam, balas: v.balas, dm: { aktif: v.dm.aktif, kata: kata.split(','), pesan: v.dm.pesan, perJam: v.dm.perJam } })}>{busy ? 'Menyimpan…' : 'Simpan aturan'}</button><button className="btn" onClick={() => setUbah(null)}>Batal</button></div>}
            {!!a.log.length && (
                <details className="ap-log"><summary>Aktivitas autopilot ({a.log.length})</summary>
                    {a.log.slice(0, 30).map((l, i) => <div key={i}><small>{new Date(l.at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small><b>{l.jenis === 'terbit' ? 'Jadwal' : l.jenis === 'balas' ? 'Balas' : l.jenis === 'dm' ? 'DM' : 'Dilewati'}</b><span>{l.teks}</span></div>)}
                </details>
            )}
        </section>
    );
}

function TabAkun({ x, aksi, kabar, muat, keBeranda, bukaKuis }: P & { muat: () => void; keBeranda: () => void; bukaKuis: () => void }) {
    const [p, setP] = useState<Profil>(x.profil);
    const [pasang, setPasang] = useState(false);
    const set = (k: keyof Profil) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });
    const kurang = x.tim.filter((t) => !t.ada);
    const a = x.akun.find((y) => y.id === x.akunAktif)!, pi = x.platformInfo[x.platform];
    const [nama, setNama] = useState(a?.nama || ''), [handle, setHandle] = useState(a?.handle || '');
    const [kunci, setKunci] = useState<Record<string, string>>({}), [uji, setUji] = useState(false);
    const [pk, setPk] = useState('');
    const pkAkhir = x.pengikut.length ? x.pengikut[x.pengikut.length - 1] : null;
    return (<>
        <KartuAutopilot />
        <section className="sb-card">
            <div className="sd-h"><h3><Ikon e={pi?.ikon} /> Akun ini <small>{pi?.nama}</small></h3></div>
            <div className="sm-form">
                <label>Nama akun (untuk Bapak)<input value={nama} maxLength={40} onChange={(e) => setNama(e.target.value)} /></label>
                <label>Username / nama channel<input value={handle} maxLength={60} placeholder="@username" onChange={(e) => setHandle(e.target.value)} /></label>
            </div>
            <div className="sm-aksi">
                <button className="btn" disabled={nama === a.nama && handle === a.handle} onClick={() => aksi(apiPost(`/api/kantor/sosmed/akun/${a.id}/ubah`, { nama, handle }), 'Akun diperbarui.')}>Simpan nama</button>
                {a.id !== 'utama' && <button className="btn small" onClick={async () => { if ((await konfirmasi(`Hapus akun "${a.nama}" dari kantor? Kalender & konten akun ini disimpan sebagai cadangan di VPS, kunci sambungannya dihapus.`))) apiPost(`/api/kantor/sosmed/akun/${a.id}/hapus`, {}).then(() => { kabar('Akun dihapus.'); keBeranda(); }).catch((e) => kabar(String(e.message || e))); }}><Ikon e="🗑" /> Hapus akun</button>}
            </div>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Sambungan {pi?.nama} <small>{x.ig ? <><Ikon e="✅" /> {'tersambung'}</> : 'belum tersambung'}</small></h3></div>
            <p className="sb-note" style={{ marginTop: 0 }}>{x.ig ? `Kantor bisa mengunggah setelah Bapak menekan Setujui, mengambil angka hasil & pengikut tiap hari${x.bisaKomentar ? ', dan menarik komentar' : ''}. Tidak ada yang diunggah atau dibalas tanpa persetujuan Bapak.` : 'Tanpa sambungan, alurnya tetap jalan sampai "siap diunggah": Bapak unggah manual, lalu isi angka hasil & pengikut sendiri.'}</p>
            <p className="sb-note">{pi?.catatan}</p>
            <form className="sm-form" onSubmit={(e) => { e.preventDefault(); setUji(true); apiPost<{ tersambung: boolean; uji?: boolean; pengikut?: number; pesan?: string }>(`/api/kantor/sosmed/akun/${a.id}/sambung`, kunci).then((r) => { setKunci({}); kabar(r.pengikut != null ? `✅ Tersambung. Pengikut saat ini: ${r.pengikut.toLocaleString('id-ID')}.` : r.pesan || 'Tersimpan.'); muat(); }).catch((er) => kabar(String(er.message || er))).finally(() => setUji(false)); }}>
                {pi?.kunci.map((f) => (
                    <label key={f.k} className="lebar">{f.label}{x.kunciTerisi.includes(f.k) && <small>sudah tersimpan — isi lagi hanya kalau mau mengganti</small>}
                        <input type={f.rahasia ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={kunci[f.k] || ''} placeholder={x.kunciTerisi.includes(f.k) ? '••••••••' : ''} onChange={(e) => setKunci({ ...kunci, [f.k]: e.target.value })} /></label>
                ))}
                <div className="lebar sm-aksi"><button className="btn primary" disabled={uji || !Object.values(kunci).some((v) => String(v).trim())}>{uji ? 'Menguji…' : 'Simpan & uji sambungan'}</button>
                    {x.ig && <button type="button" className="btn small" onClick={async () => { if ((await konfirmasi('Putuskan sambungan akun ini? Kunci di VPS dihapus.'))) aksi(apiPost(`/api/kantor/sosmed/akun/${a.id}/putus`, {}), 'Sambungan diputus.'); }}>Putuskan</button>}</div>
                <small className="sb-note lebar" style={{ margin: 0 }}><Ikon e="🔒" /> Kunci disimpan hanya di VPS Bapak (berkas khusus, izin terbatas), tidak pernah ditampilkan lagi, dan tidak pernah dibaca AI. Jangan kirim kunci lewat chat.{a.id === 'utama' && a.platform === 'instagram' ? ' Akun utama juga tetap bisa memakai INSTAGRAM_USER_ID / INSTAGRAM_TOKEN di .env.' : ''}</small>
            </form>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Pengikut <small>{pkAkhir ? `${pkAkhir.n.toLocaleString('id-ID')} · ${pkAkhir.tgl}${pkAkhir.sumber === 'api' ? ' (otomatis)' : ' (manual)'}` : 'belum ada catatan'}</small></h3></div>
            <form className="sm-ide" onSubmit={(e) => { e.preventDefault(); aksi(post('/api/kantor/sosmed/pengikut', { n: +pk }), 'Jumlah pengikut hari ini dicatat.'); setPk(''); }}>
                <input inputMode="numeric" placeholder={x.ig ? 'Tercatat otomatis tiap hari; boleh dikoreksi di sini' : 'Jumlah pengikut/subscriber hari ini'} value={pk} onChange={(e) => setPk(e.target.value.replace(/\D/g, ''))} />
                <button className="btn" disabled={!pk}>Catat</button>
            </form>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Tim social media <small>{x.tim.length - kurang.length}/5 anggota · dipakai semua akun</small></h3>
                <button className="btn small primary" disabled={pasang} onClick={() => { setPasang(true); post('/api/kantor/sosmed/pasang', {}).then(() => { kabar('✓ Divisi Social Media terbentuk/diperbarui beserta skill-nya. Anggotanya muncul di kantor dalam ±1 menit.'); setTimeout(muat, 1500); }).catch((e) => kabar(String(e.message || e))).finally(() => setPasang(false)); }}>{pasang ? 'Sedang memasang…' : kurang.length ? 'Bentuk Divisi Social Media' : <><Ikon e="↻" /> {'Perbarui skill tim'}</>}</button></div>
            <div className="sm-tim-l">{x.tim.map((t) => <div key={t.id} className={t.ada ? 'ada' : ''}><b>{t.ada ? '●' : '○'} {t.nama}</b><p>{TUGAS[t.id]}</p><small>{SKILL[t.id]}</small></div>)}</div>
            <p className="sb-note">Skill: <b>instagram-agent-skill</b> (13 skill), <b>reels-cepat</b> dari Bapak, dan <b>video-edit</b> (tenfoldmarc) untuk look, efek & zona aman di prompt edit. {kurang.length ? 'Sebelum tim dibentuk, pekerjaan mereka dikerjakan otak AI kantor dengan format yang sama.' : ''}</p>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Profil akun <small>dibaca semua anggota tim</small></h3><button className="btn small" onClick={bukaKuis}><Ikon e="📝" /> {x.starter ? 'Ulangi kuis awal' : 'Isi lewat kuis awal'}</button></div>
            {x.starter && <details className="sm-tren"><summary>Brief dari kuis awal ({new Date(x.starter.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})</summary><p>{x.starter.ringkas}</p></details>}
            <div className="sm-form">
                <label className="lebar">Topik / niche <small>kosongkan kalau mau tim yang mengusulkan</small><input value={p.topik} placeholder="mis. AI praktis untuk pemilik usaha kecil" onChange={set('topik')} /></label>
                <label className="lebar">Siapa penontonnya<input value={p.audiens} placeholder="mis. pemilik UMKM 25–40 tahun yang gaptek" onChange={set('audiens')} /></label>
                <label className="lebar">Tujuan akun<input value={p.tujuan} placeholder="mis. bangun kepercayaan lalu jual kelas / jasa" onChange={set('tujuan')} /></label>
                <label className="lebar">Gaya bicara<textarea rows={2} value={p.gaya} placeholder="mis. santai lu/gua, to the point, sedikit humor" onChange={set('gaya')} /></label>
                <label className="lebar">Karakter suara narasi (untuk prompt ElevenLabs)<input value={p.suara} placeholder="mis. pria 30-an, hangat, tempo sedang, logat Jakarta" onChange={set('suara')} /></label>
                <label>Bahasa konten<input value={p.bahasa} onChange={set('bahasa')} /></label>
                <label>Konten utama per minggu <small>selain story</small><input type="number" min={1} max={14} value={p.perMinggu} onChange={(e) => setP({ ...p, perMinggu: +e.target.value })} /></label>
                <label>Durasi video pendek (detik)<input type="number" min={10} max={180} value={p.durasi} onChange={(e) => setP({ ...p, durasi: +e.target.value })} /></label>
                {FORMAT_URUT.includes('video') && <label>Durasi video panjang (menit)<input type="number" min={1} max={60} value={Math.round(p.durasiPanjang / 60)} onChange={(e) => setP({ ...p, durasiPanjang: +e.target.value * 60 })} /></label>}
                <label>Look editing (real) <small>skill /video-edit</small><select value={p.look} onChange={set('look')}><option value="otomatis">Otomatis (dipilih AI)</option>{x.katalog.look.map((l) => <option key={l.id} value={l.id}>{l.nama}</option>)}</select></label>
                <label>Color grade<select value={p.grade} onChange={set('grade')}><option value="otomatis">Otomatis (dipilih AI)</option><option value="tanpa">Tanpa color grade</option>{x.katalog.grade.map((l) => <option key={l.id} value={l.id}>{l.nama}</option>)}</select></label>
                <div className="lebar sm-cek"><small>Format yang dipakai di {pi?.nama}</small>{FORMAT_URUT.map((f) => <label key={f}><input type="checkbox" checked={p.format.includes(f)} onChange={(e) => setP({ ...p, format: e.target.checked ? [...p.format, f] : p.format.filter((y) => y !== f) })} /> <Ikon e={FMT[f].ico} /> {FMT[f].label} <small>({RASIO(f)})</small></label>)}</div>
                <label className="lebar">Catatan lain untuk tim<textarea rows={2} value={p.catatan} placeholder="hal yang harus dihindari, produk yang dijual, contoh akun panutan, dll." onChange={set('catatan')} /></label>
            </div>
            <button className="btn primary" onClick={() => aksi(post('/api/kantor/sosmed/profil', { ...p, akun: handle || p.akun }), '✓ Profil akun disimpan. Lanjut: tab Strategi → Susun strategi.')}>Simpan profil</button>
        </section>
    </>);
}

/* ── Kartu satu konten ── */
function KartuKonten({ k, x, buka, onBuka, aksi, kabar, gambarGaya }: { k: Konten; x: Data; buka: boolean; onBuka: () => void; aksi: Aksi; kabar: (m: string) => void; gambarGaya: Record<string, string> }) {
    const [arahan, setArahan] = useState(k.arahan || '');
    const [ulang, setUlang] = useState(false);
    const langkah = Math.max(0, LANGKAH.findIndex((l) => l.s.includes(k.status)));
    const gaya = x.gaya.find((g) => g.id === (k.gayaId || (x.profil.gayaVideo !== 'otomatis' ? x.profil.gayaVideo : '')));
    const [sub, setSub] = useState(k.status === 'terbit' ? 'hasil' : 'produksi');
    const [ganti, setGanti] = useState(false);
    const sibuk = !!x.sibuk;
    const url = (a: string) => `/api/kantor/sosmed/konten/${k.id}/${a}`;
    return (
        <article className={`sm-k ${buka ? 'buka' : ''} st-${k.status} f-${k.format}`}>
            <button className="sm-k-h" onClick={onBuka} aria-expanded={buka}>
                <div className="sm-k-atas">{k.kode && <span className="sm-kode" title="Kode konten: pakai di nama berkas supaya tidak tertukar">{label(k)}</span>}<Fmt f={k.format} />{k.status === 'sketsa' && <span className="sm-pilihkan"><Ikon e="✏" /> {k.varian?.length || 4} sketsa, pilih satu</span>}{k.pilih && <span className="sm-pil"><Ikon e="✏" /> sketsa #{k.pilih}</span>}{(k.format === 'reel' || k.format === 'story') && <span className="sm-pil">{gaya ? <><Ikon e="🎨" /> {`${gaya.nama}`}</> : <><Ikon e="🎨" /> {'gaya otomatis'}</>}</span>}<span className="sm-pil">{k.pilar}</span><small>{tglId(k.tgl, { weekday: 'short', day: 'numeric', month: 'short' })}</small></div>
                <b>{k.judul}</b>
                {k.hook ? <em>"{k.hook}"</em> : k.sudut ? <em>{k.sudut}</em> : null}
                {k.dasar && <span className="sm-dasar"><Ikon e="🎯" /> {k.dasar}</span>}
                <div className="sm-langkah">{LANGKAH.map((l, i) => <span key={l.label} className={i < langkah ? 'lewat' : i === langkah ? 'kini' : ''}>{l.label}</span>)}</div>
            </button>
            {k.galat && <div className="error">Terkendala: {k.galat}</div>}
            {buka && (
                <div className="sm-isi">
                    {k.varian?.length && (k.status === 'sketsa' || ganti) ? <PilihSketsa k={k} x={x} aksi={aksi} tutup={k.pilih ? () => setGanti(false) : undefined} /> : k.status === 'rencana' ? (<>
                        {k.tujuan && <p className="sm-sudut"><b>Tujuan:</b> {k.tujuan}</p>}
                        <PilihGaya k={k} x={x} aksi={aksi} />
                        <Arahan nilai={arahan} set={setArahan} ph="Saran / arahan Bapak sebelum tim membuat ide (opsional), mis. 'pakai contoh warung kopi', 'jangan pakai wajah, animasi saja', 'tonjolkan harga'" />
                        <div className="sm-aksi"><button className="btn primary" disabled={sibuk} onClick={() => aksi(post(url('kembangkan'), { arahan }), VIDEO(k.format) ? 'Lala menulis 4 sketsa ide, lalu Vino menyiapkan prompt video & voiceover untuk tiap sketsa (±5–10 menit).' : 'Lala menulis naskah, lalu Vino menyiapkan prompt (±2–5 menit).')}>{VIDEO(k.format) ? 'Buat 4 sketsa ide sekarang' : 'Buat naskah & prompt sekarang'}</button></div>
                    </>) : (<>
                        {k.pilih && k.varian?.length ? <p className="sm-dipilih"><Ikon e="✏" /> Paket dari <b>sketsa #{k.pilih}</b> · kode berkas <b className="mono">{label(k)}</b> {!['terjadwal', 'mengunggah', 'terbit'].includes(k.status) && <button className="btn small" onClick={() => setGanti(true)}>Lihat / ganti sketsa</button>}</p> : null}
                        <div className="sm-sub-tab" role="tablist">{[['produksi', '🎬 Produksi'], ['naskah', '📝 Naskah'], ['caption', '✍️ Caption'], ['hasil', '📈 Hasil']].map(([kk, l]) => <button key={kk} role="tab" aria-selected={sub === kk} className={sub === kk ? 'on' : ''} onClick={() => setSub(kk)}>{l}</button>)}</div>
                        {sub === 'produksi' && <><StudioKonten akun={x.akunAktif} k={k} kabar={kabar} muat={() => aksi(Promise.resolve())} sibuk={sibuk} /><Produksi k={k} x={x} aksi={aksi} kabar={kabar} /></>}
                        {sub === 'naskah' && <Naskah k={k} durasi={x.profil.durasi} />}
                        {sub === 'caption' && <Caption k={k} aksi={aksi} />}
                        {sub === 'hasil' && <HasilKonten k={k} x={x} aksi={aksi} />}
                    </>)}
                    {ulang && <div className="sm-blok"><Arahan nilai={arahan} set={setArahan} ph="Apa yang mau diubah di versi baru? mis. 'lebih lucu', 'sudut cerita pribadi', 'buat untuk pemula'" />
                        <div className="sm-aksi"><button className="btn primary" disabled={sibuk} onClick={() => { aksi(post(url('kembangkan'), { ulang: true, arahan }), 'Sedang ditulis ulang dengan arahan Bapak.'); setUlang(false); }}>Tulis ulang semua sketsa/naskah</button><button className="btn small" onClick={() => setUlang(false)}>Batal</button></div></div>}
                    <div className="sm-aksi kecil">
                        {k.status !== 'rencana' && k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn small" disabled={sibuk} onClick={() => setUlang(!ulang)} aria-expanded={ulang}><Ikon e="↻" /> Tulis ulang…</button>}
                        {k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn small" onClick={async () => { if ((await konfirmasi(`Hapus "${k.judul}" dari kalender?`))) aksi(post(url('hapus'), {}), 'Dihapus dari kalender.'); }}><Ikon e="🗑" /> Hapus</button>}
                    </div>
                </div>
            )}
        </article>
    );
}
/** 4 sketsa ide untuk satu konten video: storyboard, hook, prompt video & voiceover per sketsa. Pak Rico memilih satu. */
function PilihSketsa({ k, x, aksi, tutup }: { k: Konten; x: Data; aksi: Aksi; tutup?: () => void }) {
    const [edit, setEdit] = useState<number | null>(null);
    const v = k.varian || [], top = Math.max(...v.map((y) => y.skor));
    const belum = v.filter((y) => !y.promptVideo && !y.promptEdit).length;
    return (<>
        <div className="sm-psk-h"><p className="sm-sudut" style={{ margin: 0 }}>Pilih satu dari {v.length} sketsa. Setelah dipilih, paketnya (prompt video + voiceover + caption) jadi milik konten <b className="mono">{k.kode}</b> dan kolom unggahnya terbuka.</p>{tutup && <button className="btn small" onClick={tutup}>Tutup</button>}</div>
        {belum > 0 && <div className="hz-bukti ok"><span className="pk-jalan"><i /></span><span>{x.sibuk ? `Vino masih menyiapkan prompt untuk ${belum} sketsa…` : `${belum} sketsa belum punya prompt.`} Bapak sudah bisa memilih; prompt sketsa yang dipilih bisa dibuat setelahnya.</span></div>}
        <div className="sm-psk">{v.map((y) => (
            <div key={y.no} className={`sm-sk ${k.pilih === y.no ? 'on' : ''}`}>
                <div className="sm-sk-h"><b>Sketsa #{y.no}</b><span className="sm-skor" title={`Daya tahan scroll ${y.scroll}% · relevansi ${y.relevansi}% (perkiraan, bukan data performa)`}>{y.skor === top ? <Ikon e="⭐" /> : ''}{y.skor}%</span>{k.pilih === y.no && <em>dipilih</em>}</div>
                <small className="sm-sk-sudut">{y.sudut}</small>
                <p className="sm-sk-hook">"{y.hook}"</p>
                <p className="sm-sk-ring">{y.ringkas}</p>
                <InfoGaya v={y} x={x} k={k} />
                <StoryboardSketsa adegan={y.storyboard} musik={y.musik} kecil />
                <details className="sm-sk-d"><summary><Ikon e="🎬" /> Prompt video {y.promptVideo || y.promptEdit ? '' : '(belum ada)'}</summary>{(y.promptVideo || y.promptEdit) && <><pre>{y.promptVideo || y.promptEdit}</pre><Salin teks={y.promptVideo || y.promptEdit || ''} /></>}</details>
                <details className="sm-sk-d"><summary><Ikon e="🎙" /> Prompt voiceover {y.jumlahKata ? `· ${y.jumlahKata} kata` : ''}</summary><pre>{y.promptSuara?.teks || y.voiceover || '–'}</pre>{y.promptSuara && <small className="sb-note">{y.promptSuara.gaya} · {y.promptSuara.pengaturan}</small>}</details>
                {y.galat && <div className="error">Prompt sketsa ini terkendala: {y.galat}</div>}
                <button className="btn small" onClick={() => setEdit(edit === y.no ? null : y.no)} aria-expanded={edit === y.no}>{edit === y.no ? 'Tutup editor' : <><Ikon e="✏" /> {'Edit / revisi sketsa ini'}</>}</button>
                <button className={`btn ${k.pilih === y.no ? '' : 'primary'}`} disabled={k.pilih === y.no} onClick={async () => { if (!k.aset || (await konfirmasi('Berkas yang sudah diunggah untuk sketsa sebelumnya akan dilepas. Lanjut?'))) { aksi(post(`/api/kantor/sosmed/konten/${k.id}/pilih`, { no: y.no }), `Sketsa #${y.no} dipilih. Kode berkasnya ${k.kode}-${y.no}.`); tutup?.(); } }}>{k.pilih === y.no ? '✓ Sketsa ini dipakai' : `Pilih sketsa #${y.no}`}</button>
            </div>
        ))}</div>
        {edit != null && <EditPaket key={edit} k={k} x={x} no={edit} aksi={aksi} tutup={() => setEdit(null)} />}
    </>);
}
/** Ringkasan gaya satu sketsa/paket: real atau animasi, style, look editing, color grade, rasio, niche, efek video. */
function InfoGaya({ v, x, k }: { v: { gayaId?: string; look?: string; grade?: string; efek?: string[] }; x: Data; k: Konten }) {
    const g = x.gaya.find((y) => y.id === (v.gayaId || k.gayaId || (x.profil.gayaVideo !== 'otomatis' ? x.profil.gayaVideo : '')));
    const cari = (arr: ItemK[], id?: string) => arr.find((i) => i.id === id);
    const lk = cari(x.katalog.look, v.look), gr = cari(x.katalog.grade, v.grade);
    return (
        <div className="sm-info">
            <span className={`sm-jenis ${g?.jenis || ''}`}>{g ? (g.jenis === 'real' ? <><Ikon e="🎥" /> {'Real'}</> : <><Ikon e="✏" /> {'Animasi'}</>) : <><Ikon e="🎨" /> {'Gaya dipilih AI'}</>}{g && <b> · {g.nama}</b>}</span>
            {lk && <span title={lk.ket}><Ikon e="✂" /> Look {lk.nama}</span>}
            {gr && <span title={gr.ket}><Ikon e="🎨" /> Grade {gr.nama}</span>}
            <span><Ikon e="📐" /> {RASIO(k.format)}</span>
            <span title="Niche akun"><Ikon e="🎯" /> {x.strategi?.niche || x.profil.topik || 'niche belum ditentukan'}</span>
            {!!v.efek?.length && <span className="sm-efek"><Ikon e="✨" /> {v.efek.map((e) => { const it = cari(x.katalog.efek, e); return <i key={e} title={it?.ket}>{it?.nama || e}</i>; })}</span>}
        </div>
    );
}
/** Revisi kecil: ubah langsung (adegan, voiceover, prompt, gaya, efek, caption) atau minta AI merevisi dengan catatan singkat. */
function EditPaket({ k, x, no, aksi, tutup, gambarGaya = GAMBAR }: { k: Konten; x: Data; no: number | null; aksi: Aksi; tutup: () => void; gambarGaya?: Record<string, string> }) {
    const [galeri, setGaleri] = useState('');
    const v: any = no ? k.varian?.find((y) => y.no === no) || {} : k;
    const awal = useMemo(() => ({ hook: v.hook || '', ringkas: v.ringkas || '', gayaId: v.gayaId || '', look: v.look || '', grade: v.grade || '', efek: (v.efek || []) as string[], voiceover: v.voiceover || '', musik: v.musik || '', caption: v.caption || '',
        promptVideo: v.promptVideo || '', promptEdit: v.promptEdit || '', rekam: v.rekam || '', promptGambar: v.promptGambar || '', suara: v.promptSuara?.teks || '', storyboard: ((v.storyboard || []) as Adegan[]).map((a) => ({ ...a })) }), [v]);
    const [f, setF] = useState(awal);
    const [ins, setIns] = useState('');
    const g = x.gaya.find((y) => y.id === (f.gayaId || k.gayaId)), real = g?.jenis === 'real';
    const efekCocok = x.katalog.efek.filter((e) => !g || e.cocok === 'semua' || e.cocok === g.jenis);
    const url = (a: string) => `/api/kantor/sosmed/konten/${k.id}/${a}`;
    const ubahAd = (i: number, kk: keyof Adegan, val: string) => setF({ ...f, storyboard: f.storyboard.map((a, j) => (j === i ? { ...a, [kk]: val } : a)) });
    const simpan = () => {
        const b: any = { no };
        for (const kk of ['hook', 'ringkas', 'gayaId', 'look', 'grade', 'voiceover', 'musik', 'caption', 'promptVideo', 'promptEdit', 'rekam', 'promptGambar'] as const) if (f[kk] !== awal[kk]) b[kk] = f[kk];
        if (f.efek.join() !== awal.efek.join()) b.efek = f.efek;
        if (f.suara !== awal.suara) b.promptSuara = { teks: f.suara };
        if (JSON.stringify(f.storyboard) !== JSON.stringify(awal.storyboard)) b.storyboard = f.storyboard;
        if (Object.keys(b).length === 1) { tutup(); return; }
        aksi(post(url('varian'), b), 'Revisi disimpan.'); tutup();
    };
    const TA = ({ kk, judul, baris = 4, ket }: { kk: 'voiceover' | 'promptVideo' | 'promptEdit' | 'rekam' | 'promptGambar' | 'suara' | 'caption'; judul: string; baris?: number; ket?: string }) => (
        <label className="lebar">{judul}{ket && <small>{ket}</small>}<textarea rows={baris} value={f[kk]} onChange={(e) => setF({ ...f, [kk]: e.target.value })} /></label>
    );
    return (
        <section className="sm-blok utama sm-editor">
            <div className="sm-blok-h"><b><Ikon e="✏" /> Revisi {no ? `sketsa #${no}` : 'paket'}</b><button className="btn small" onClick={tutup}>Tutup</button></div>
            <div className="sm-revisi">
                <label><Ikon e="🤖" /> Minta AI merevisi<small>tulis singkat, mis. "adegan 2 jadi close-up tangan, voiceover lebih santai, efeknya ganti spotlight"</small>
                    <textarea rows={2} value={ins} onChange={(e) => setIns(e.target.value)} /></label>
                <button className="btn primary" disabled={ins.trim().length < 3 || !!x.sibuk} onClick={() => { aksi(post(url('revisi'), { no, instruksi: ins }), 'Vino sedang merevisi sesuai catatan Bapak (±1–2 menit).'); setIns(''); tutup(); }}>Revisi dengan AI</button>
            </div>
            <p className="sb-note">Atau ubah langsung di bawah, lalu Simpan. Bagian yang tidak diubah tetap sama.</p>
            <div className="sm-form">
                <label className="lebar">Hook<input value={f.hook} onChange={(e) => setF({ ...f, hook: e.target.value })} /></label>
                {no && <label className="lebar">Alur singkat<input value={f.ringkas} onChange={(e) => setF({ ...f, ringkas: e.target.value })} /></label>}
                {VIDEO(k.format) && <>
                    <details className="lebar sm-galeri-d" open={galeri === 'gaya'} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setGaleri('gaya')}><summary><b>Gaya video</b> <span>{g ? `${g.jenis === 'real' ? '🎥 Real' : '✏️ Animasi'} · ${g.nama}` : 'tetap'}</span></summary>
                        <GaleriPilih jenis="gaya" daftar={x.gaya.map((y) => ({ ...y, ket: y.deskripsi, jenisGaya: y.jenis === 'real' ? 'Real' : 'Animasi' }))} pilih={[f.gayaId || k.gayaId || '']} onPilih={(id) => setF({ ...f, gayaId: id })} gambar={gambarGaya} /></details>
                    {real && <label className="lebar">Look editing (video real)<select value={f.look} onChange={(e) => setF({ ...f, look: e.target.value })}><option value="">–</option>{x.katalog.look.map((l) => <option key={l.id} value={l.id}>{l.nama} — {l.ket}</option>)}</select></label>}
                    <details className="lebar sm-galeri-d" open={galeri === 'grade'} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setGaleri('grade')}><summary><b>Color grade</b> <span>{x.katalog.grade.find((y) => y.id === f.grade)?.nama || 'tanpa'}</span></summary>
                        <div className="sm-aksi"><button type="button" className={`btn small ${!f.grade ? 'primary' : ''}`} onClick={() => setF({ ...f, grade: '' })}>Tanpa color grade</button></div>
                        <GaleriPilih jenis="grade" daftar={x.katalog.grade} pilih={[f.grade]} onPilih={(id) => setF({ ...f, grade: id })} /></details>
                    <details className="lebar sm-galeri-d" open={galeri === 'efek'} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setGaleri('efek')}><summary><b>Efek video</b> <span>{f.efek.length ? f.efek.map((e) => x.katalog.efek.find((y) => y.id === e)?.nama || e).join(', ') : 'belum ada'}</span></summary>
                        <small className="sb-note">Ketuk untuk memilih (maks. 6). <Ikon e="⭐" /> = sudah ada di skill publik video-edit; yang lain dibuat ulang Claude dari deskripsinya. Animasi di sini hanya contoh gambaran.</small>
                        <GaleriPilih jenis="efek" banyak maks={6} daftar={efekCocok} pilih={f.efek} onPilih={(id) => setF({ ...f, efek: f.efek.includes(id) ? f.efek.filter((y) => y !== id) : [...f.efek, id] })} /></details>
                </>}
            </div>
            {f.storyboard.length > 0 && (
                <div className="sm-tabel"><table className="um-t sm-sb sm-sb-edit"><thead><tr><th>#</th><th>Detik</th><th>Visual</th><th>Teks layar</th><th>SFX</th>{VIDEO(k.format) && <th>Efek</th>}<th aria-label="Hapus" /></tr></thead>
                    <tbody>{f.storyboard.map((a, i) => (
                        <tr key={i}><td>{i + 1}</td><td><input value={a.detik} onChange={(e) => ubahAd(i, 'detik', e.target.value)} aria-label={`Detik adegan ${i + 1}`} /></td>
                            <td><textarea rows={2} value={a.visual} onChange={(e) => ubahAd(i, 'visual', e.target.value)} aria-label={`Visual adegan ${i + 1}`} /></td>
                            <td><input value={a.teksLayar} onChange={(e) => ubahAd(i, 'teksLayar', e.target.value)} aria-label={`Teks layar adegan ${i + 1}`} /></td>
                            <td><input value={a.sfx || ''} onChange={(e) => ubahAd(i, 'sfx', e.target.value)} aria-label={`SFX adegan ${i + 1}`} /></td>
                            {VIDEO(k.format) && <td><select value={(a as any).efek || ''} onChange={(e) => ubahAd(i, 'efek' as any, e.target.value)} aria-label={`Efek adegan ${i + 1}`}><option value="">–</option>{efekCocok.map((e2) => <option key={e2.id} value={e2.id}>{e2.nama}</option>)}</select></td>}
                            <td><button className="icon-btn" onClick={() => setF({ ...f, storyboard: f.storyboard.filter((_, j) => j !== i) })} aria-label={`Hapus adegan ${i + 1}`}>✕</button></td></tr>
                    ))}</tbody></table>
                    <button className="btn small" onClick={() => setF({ ...f, storyboard: [...f.storyboard, { no: f.storyboard.length + 1, detik: '', visual: '', teksLayar: '', narasi: '', sfx: '' }] })}>＋ Adegan</button></div>
            )}
            <div className="sm-form">
                {VIDEO(k.format) && <TA kk="voiceover" judul="Voiceover (naskah ucapan)" baris={5} ket='"/" jeda pendek · "//" jeda panjang · KAPITAL = ditekan' />}
                {VIDEO(k.format) && <label className="lebar">Musik & suasana latar<input value={f.musik} onChange={(e) => setF({ ...f, musik: e.target.value })} /></label>}
                {(awal.promptVideo || f.promptVideo) && <TA kk="promptVideo" judul="Prompt video" baris={6} />}
                {(awal.rekam || f.rekam) && <TA kk="rekam" judul="Daftar rekam" baris={4} />}
                {(awal.promptEdit || f.promptEdit) && <TA kk="promptEdit" judul="Prompt edit untuk Claude" baris={6} />}
                {(awal.promptGambar || f.promptGambar) && <TA kk="promptGambar" judul="Prompt gambar" baris={6} />}
                {(awal.suara || f.suara) && <TA kk="suara" judul="Prompt suara ElevenLabs (khusus narasi)" baris={5} />}
                <TA kk="caption" judul="Caption" baris={4} />
            </div>
            <div className="sm-aksi"><button className="btn primary" onClick={simpan}>Simpan revisi</button><button className="btn small" onClick={tutup}>Batal</button>
                <small className="sb-note" style={{ margin: 0 }}>Ubah adegan/voiceover tanpa memperbarui prompt? Pakai "Revisi dengan AI" supaya semuanya ikut sinkron.</small></div>
        </section>
    );
}
function PilihGaya({ k, x, aksi, onGanti }: { k: Konten; x: Data; aksi: Aksi; onGanti?: () => void }) {
    if (!VIDEO(k.format)) return null;
    return (
        <label className="sm-pilih-gaya"><Ikon e="🎨" /> Gaya video
            <select value={k.gayaId || ''} onChange={(e) => { aksi(post(`/api/kantor/sosmed/konten/${k.id}/ubah`, { gayaId: e.target.value || null }), 'Gaya diganti.'); onGanti?.(); }}>
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
    const [edit, setEdit] = useState(false);
    const url = (a: string) => `/api/kantor/sosmed/konten/${k.id}/${a}`;
    const gaya = x.gaya.find((g) => g.id === (k.gayaId || (x.profil.gayaVideo !== 'otomatis' ? x.profil.gayaVideo : '')));
    const banyak = k.format === 'carousel';
    const unggah = async (files: File[]) => {
        try {
            const { folder } = await post<{ folder: string }>(url('folder'), {});
            for (let i = 0; i < files.length; i++) {
                setNaik(files.length > 1 ? `${i + 1}/${files.length}` : '0%');
                const r = await unggahBerkas(folder, files[i], (n) => setNaik(files.length > 1 ? `${i + 1}/${files.length} · ${n}%` : `${n}%`));
                await post(url('aset'), { path: r.path, tambah: banyak && i > 0 });
            }
            aksi(Promise.resolve(), '✓ Berkas tersimpan di cloud VPS (Berkas → Sosmed). Periksa caption, lalu tekan Setujui.');
        } catch (e: any) { kabar(String(e.message || e)); } finally { setNaik(null); }
    };
    const n = 1 + (k.asetLain?.length || 0);
    const nanti = waktuK(k, x) > Date.now();
    let langkah = 1;
    return (<>
        {VIDEO(k.format) && <InfoGaya v={k} x={x} k={k} />}
        {!k.varian?.length && <PilihGaya k={k} x={x} aksi={aksi} onGanti={() => setGayaBaru(true)} />}
        {k.status !== 'terbit' && k.status !== 'mengunggah' && (k.naskah || k.promptVideo || k.promptGambar || k.promptEdit) && <div className="sm-aksi"><button className="btn small" onClick={() => setEdit(!edit)} aria-expanded={edit}>{edit ? 'Tutup editor' : <><Ikon e="✏" /> {'Edit / revisi paket'}</>}</button></div>}
        {edit && <EditPaket k={k} x={x} no={k.pilih ?? null} aksi={aksi} tutup={() => setEdit(false)} />}
        {gayaBaru && <div className="hz-bukti warn"><span>Gaya diganti. Buat ulang prompt supaya sesuai gaya baru? <button className="btn small" disabled={!!x.sibuk} onClick={() => { setGayaBaru(false); aksi(post(url('kembangkan'), { produksiSaja: true }), 'Vino menulis ulang prompt sesuai gaya baru.'); }}>Buat ulang prompt</button></span></div>}
        {!!k.storyboard?.length && <section className="sm-blok"><div className="sm-blok-h"><b>Storyboard sketsa</b><small className="sb-note" style={{ margin: 0 }}>gambaran kasar urutan adegan di prompt</small></div><StoryboardSketsa adegan={k.storyboard} musik={k.musik} /></section>}
        {k.status === 'naskah' && !k.promptVideo && !k.promptGambar && !k.promptEdit && <div className="sm-aksi"><button className="btn primary" disabled={!!x.sibuk} onClick={() => aksi(post(url('kembangkan'), {}), 'Vino menyiapkan prompt.')}>Buat prompt produksi</button></div>}
        {k.rekam && <Blok utama judul={`${langkah++} · Yang perlu direkam`} teks={k.rekam} salin="Salin daftar rekam" />}
        {k.promptEdit && <Blok utama judul={`${langkah++} · Prompt edit untuk Claude`} teks={k.promptEdit} salin="Salin prompt edit"><small className="sb-note">Tempel ke Claude bersama video mentahan Bapak.</small></Blok>}
        {k.promptVideo && <Blok utama judul={`${langkah++} · Prompt video${gaya ? ` (${gaya.nama})` : ''}`} teks={k.promptVideo} salin="Salin prompt video">{gaya?.contoh && <small className="sb-note"><Ikon e="🖼" /> Lampirkan juga gambar acuan "{gaya.contoh.nama}" (menu Berkas → Sosmed → Gaya).</small>}</Blok>}
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
                {k.kode && <p className="sm-namaf">Beri nama berkas diawali <b className="mono">{label(k)}</b> (mis. <span className="mono">{label(k)}{VIDEO(k.format) && k.format !== 'story' ? '.mp4' : k.format === 'carousel' ? '_1.png' : '.png'}</span>) supaya otomatis dikenali saat unggah banyak sekaligus. <Salin teks={label(k)} label="Salin kode" /></p>}
                {k.aset ? <p className="sm-aset"><Ikon e="📁" /> {k.aset.nama}{banyak && n > 1 ? ` + ${n - 1} berkas lain` : ''} <small>{k.aset.dihapus ? `sudah dihapus dari VPS ${new Date(k.aset.dihapus).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} (sudah terbit, aturan maks. 10 video)` : 'tersimpan di Berkas → Sosmed'}</small></p> : <p className="sb-note" style={{ marginTop: 0 }}>Setelah {k.format === 'reel' ? 'video' : banyak ? 'semua slide' : k.format === 'story' ? 'gambar/video story' : 'gambar'} jadi, unggah di sini. Berkasnya tersimpan di cloud VPS Bapak.</p>}
                <input ref={input} type="file" multiple={banyak} accept={k.format === 'reel' || k.format === 'video' ? 'video/mp4,video/quicktime' : k.format === 'story' ? 'video/mp4,video/quicktime,image/jpeg,image/png' : banyak ? 'image/jpeg,image/png,video/mp4' : 'image/jpeg,image/png'} hidden onChange={(e) => { const f = Array.from<File>(e.target.files || []).slice(0, 10); if (f.length) unggah(f); e.target.value = ''; }} />
                <div className="sm-aksi">
                    {k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn" disabled={naik != null} onClick={() => input.current?.click()}>{naik != null ? `Mengunggah ${naik}…` : k.aset ? <><Ikon e="↻" /> {'Ganti berkas'}</> : banyak ? <><Ikon e="⬆" /> {'Unggah semua slide (urut)'}</> : <><Ikon e="⬆" /> {'Unggah berkas'}</>}</button>}
                    {['aset', 'gagal'].includes(k.status) && k.aset && (nanti
                        ? <button className="btn primary" onClick={() => aksi(post(url('setujui'), {}), `Disetujui — ${x.ig ? 'terbit otomatis' : 'Bapak diingatkan lewat chat Maya'} ${kapan(k, x)} WIB.`)}>✓ Setujui · terbit {kapan(k, x)}</button>
                        : <button className="btn primary" onClick={async () => { if ((await konfirmasi(x.ig ? `Unggah "${k.judul}" (${FMT[k.format].label}) ke ${PLAT_NAMA} sekarang, beserta captionnya?` : `${PLAT_NAMA} belum tersambung. Tandai "${k.judul}" siap diunggah manual?`))) aksi(post(url('setujui'), { sekarang: true }), x.ig ? `Disetujui — sedang diunggah ke ${PLAT_NAMA}.` : 'Siap diunggah manual: salin caption di tab Caption.'); }}>✓ Setujui{x.ig ? ' & unggah sekarang' : ''}</button>)}
                    {['aset', 'gagal'].includes(k.status) && k.aset && nanti && <button className="btn small" onClick={async () => { if ((await konfirmasi(`Unggah "${k.judul}" sekarang, tidak menunggu jadwal?`))) aksi(post(url('setujui'), { sekarang: true }), 'Disetujui — diunggah sekarang.'); }}>Unggah sekarang</button>}
                    {k.status === 'terjadwal' && <><span className="sm-terjadwal"><Ikon e="⏰" /> Terjadwal {kapan(k, x)} WIB{x.ig ? '' : ' (pengingat)'}</span><button className="btn small" onClick={async () => { if ((await konfirmasi(`Unggah "${k.judul}" sekarang?`))) aksi(post(url('setujui'), { sekarang: true }), 'Diunggah sekarang.'); }}>Unggah sekarang</button><button className="btn small" onClick={() => aksi(post(url('batal'), {}), 'Jadwal dibatalkan.')}>Batalkan jadwal</button></>}
                    {k.status === 'mengunggah' && <span className="pk-jalan"><i /> sedang diunggah ke {PLAT_NAMA}…</span>}
                    {k.status === 'terbit' && <span className="sm-terbit"><Ikon e="✅" /> Terbit{k.ig?.tautan && <> · <a href={k.ig.tautan} target="_blank" rel="noreferrer">lihat di {PLAT_NAMA}</a></>}</span>}
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
            <label>Tanggal<TanggalInput bisaKosong={false} value={k.tgl} min={x.hari} onChange={(v) => v && aksi(post(`/api/kantor/sosmed/konten/${k.id}/ubah`, { tgl: v }), 'Tanggal diubah.')} /></label>
            <label>Jam (WIB)<input type="time" value={jamK(k, x)} onChange={(e) => e.target.value && aksi(post(`/api/kantor/sosmed/konten/${k.id}/ubah`, { jam: e.target.value }))} /></label>
            {k.jam && <button className="btn small" onClick={() => aksi(post(`/api/kantor/sosmed/konten/${k.id}/ubah`, { jam: '' }), `Kembali ke jam umum ${x.strategi?.jam || '19:00'}.`)}>Pakai jam umum</button>}
        </div>
    );
}
function TerbitManual({ k, aksi }: { k: Konten; aksi: Aksi }) {
    const [t, setT] = useState('');
    return (<>
        <p className="sb-note">Unggah manual: unduh berkas dari menu Berkas → Sosmed, tempel caption dari tab Caption. Setelah terbit, tandai di sini supaya hasilnya bisa dianalisa.</p>
        <div className="sm-ide"><input placeholder={`Tautan postingan ${PLAT_NAMA} (opsional)`} value={t} onChange={(e) => setT(e.target.value)} /><button className="btn" onClick={() => aksi(post(`/api/kantor/sosmed/konten/${k.id}/terbit-manual`, { tautan: t }), 'Ditandai terbit. Isi angka hasilnya besok di tab Hasil.')}>Tandai sudah terbit</button></div>
    </>);
}
function Naskah({ k, durasi }: { k: Konten; durasi: number }) {
    return (<>
        {!!k.sudutPilihan?.length && (
            <section className="sm-blok"><div className="sm-blok-h"><b>3 sudut & skornya</b><small className="sb-note" style={{ margin: 0 }}>perkiraan dari pola konten, bukan data performa</small></div>
                <div className="sm-tabel"><table className="um-t"><thead><tr><th>Sudut</th><th>Hook</th><th>Scroll</th><th>Relevansi</th><th>Skor</th></tr></thead>
                    <tbody>{k.sudutPilihan.map((s, i) => <tr key={i} className={i === 0 ? 'on' : ''}><td>{i === 0 ? <Ikon e="⭐" /> : ''}{s.sudut}</td><td>{s.hook}</td><td className="mono">{s.scroll}%</td><td className="mono">{s.relevansi}%</td><td className="mono"><b>{s.skor}%</b></td></tr>)}</tbody></table></div>
            </section>
        )}
        {k.hook && <section className="sm-blok"><div className="sm-blok-h"><b>Hook</b><Salin teks={k.hook} /></div><p className="sm-hook-utama">{k.hook}</p>{!!k.hookLain?.length && <ul className="sm-hook">{k.hookLain.map((h) => <li key={h}>{h}</li>)}</ul>}</section>}
        {k.naskah && <Blok judul="Naskah (Hook → Masalah → Solusi → CTA)" teks={k.naskah} />}
        {k.voiceover && <Blok judul={`Voiceover${k.jumlahKata ? ` · ${k.jumlahKata} kata ≈ ${Math.round(k.jumlahKata / 2.75)} dtk (target ${durasi} dtk)` : ''}`} teks={k.voiceover} salin="Salin voiceover"><small className="sb-note">"/" jeda pendek · "//" jeda panjang · KAPITAL = ditekan</small></Blok>}
        {!!k.slide?.length && (
            <section className="sm-blok"><div className="sm-blok-h"><b>{k.format === 'feed' ? 'Isi gambar' : `Slide (${k.slide.length})`}</b></div>
                <div className="sm-slide">{k.slide.map((s) => <div key={s.no}><small>{s.no}{s.tata && s.tata !== 'klasik' ? ` · ${s.tata}` : ''}</small><b>{s.judul.replace(/\*\*/g, '')}</b><p>{s.isi}{s.poin?.length ? ` ${s.poin.map((x) => `✓ ${x}`).join(' ')}` : ''}{s.kiri ? ` ✗ ${s.kiri} ✓ ${s.kanan || ''}` : ''}</p><em>{s.visual}{s.elemen?.length ? ` · elemen: ${s.elemen.map((e) => e.jenis).join(', ')}` : ''}{s.gambarElemen ? ` · ilustrasi: ${s.gambarElemen}` : ''}</em></div>)}</div></section>
        )}
        {!!k.storyboard?.length && (
            <section className="sm-blok"><div className="sm-blok-h"><b>Storyboard sketsa</b></div><StoryboardSketsa adegan={k.storyboard} musik={k.musik} kecil /></section>
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
        <section className="sm-blok utama"><div className="sm-blok-h"><b>{PLAT_NAMA}</b><Salin teks={ig} label="Salin caption + hashtag" /></div>
            <EditTeks nilai={k.caption || ''} baris={5} onSimpan={(v) => aksi(post(`/api/kantor/sosmed/konten/${k.id}/ubah`, { caption: v }), 'Caption disimpan.')} />
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
            <section className="sm-blok utama"><div className="sm-blok-h"><b>Hasil setelah ±{h.umurJam >= 48 ? `${Math.round(h.umurJam / 24)} hari` : `${h.umurJam} jam`}</b><small className="sb-note" style={{ margin: 0 }}>{h.sumber === 'ig' ? `dari ${PLAT_NAMA}` : 'diisi manual'}</small></div>
                <div className="sm-metrik">{KOL.map(([kk, l]) => { const v = h[kk] as number | undefined, rv = (r as any)[kk] as number | undefined; return <div key={kk}><small>{l}</small><b>{angka(v)}</b>{v != null && rv ? <em className={v >= rv ? 'naik' : 'turun'}>{v >= rv ? '▲' : '▼'} {Math.round((v / rv - 1) * 100)}% vs rata-rata</em> : null}</div>; })}</div>
            </section>
        ) : <p className="sb-note" style={{ marginTop: 0 }}>{x.ig && k.ig?.at ? 'Angka diambil otomatis ±24 jam setelah terbit.' : 'Isi angka dari statistik postingan (buka postingan → Lihat insight).'}</p>}
        {k.evaluasi && <section className="sm-blok"><div className="sm-blok-h"><b>Analisa Maya</b><span className={`sm-nilai ${k.evaluasi.nilai}`}>{k.evaluasi.nilai}</span></div><p className="sm-p">{k.evaluasi.teks}</p></section>}
        <section className="sm-blok">
            <div className="sm-blok-h"><b>Isi angka manual</b>{h && <button className="btn small" disabled={!!x.sibuk} onClick={() => aksi(post(`/api/kantor/sosmed/konten/${k.id}/evaluasi`, {}), 'Maya sedang menganalisa hasilnya.')}>{k.evaluasi ? <><Ikon e="↻" /> {'Analisa ulang'}</> : 'Analisa hasil'}</button>}</div>
            <form className="sm-hasil-f" onSubmit={(e) => { e.preventDefault(); aksi(post(`/api/kantor/sosmed/konten/${k.id}/hasil`, f), 'Angka tersimpan. Maya sedang menganalisanya.'); }}>
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

/** U20 · empat angka utama akun ini di atas tab: yang perlu Bapak lakukan dulu, lalu yang sudah jalan. */
function AngkaUtama({ x, setTab }: { x: Data; setTab: (k: string) => void }) {
    const minggu = Date.now() - 7 * 86400_000;
    const setuju = x.semua.filter((k) => k.status === 'aset').length;
    const buat = x.semua.filter((k) => k.tgl >= x.hari && ['prompt', 'manual'].includes(k.status)).length;
    const komentar = (x.komentar || []).filter((c) => c.status === 'draf' || c.status === 'baru').length;
    const terbit = x.terbit.filter((k) => (k.ig?.at || 0) >= minggu);
    const tayang = terbit.reduce((s, k) => s + (k.hasil?.[k.hasil.length - 1]?.tayang || 0), 0);
    const kotak: Array<[string, string | number, string, string]> = [
        ['Perlu disetujui', setuju, 'antre', setuju ? 'perlu' : ''],
        ['Perlu Bapak buat', buat, 'hari', buat ? 'perlu' : ''],
        ['Komentar menunggu', komentar, 'komentar', ''],
        ['Tayang 7 hari', tayang ? tayang.toLocaleString('id-ID') : terbit.length ? `${terbit.length} post` : '0', 'kinerja', '']
    ];
    return (
        <div className="sm-angka" role="list">
            {kotak.map(([l, v, t, k]) => <button key={l} role="listitem" className={k} onClick={() => setTab(t)}><b className="mono">{v}</b><small>{l}</small></button>)}
        </div>
    );
}
