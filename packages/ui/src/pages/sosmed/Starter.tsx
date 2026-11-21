import React, { useState } from 'react';
import { GaleriPilih, type ItemPilih } from './Pratinjau';

import { Ikon } from '../../components/Ikon';
export interface JawabanStarter {
    tujuan: string[]; jual: string; target: string; topik: string; niche: string; nicheBantu: boolean; tema: string;
    umur: string[]; gender: string; lokasi: string; siapa: string; masalah: string;
    nada: string[]; sapaan: string; bahasa: string;
    wajah: string; perMinggu: number; format: string[]; durasi: number;
    gayaVideo: string; look: string; grade: string; suara: string;
    panutan: string; hindari: string; lain: string;
}
const AWAL: JawabanStarter = { tujuan: [], jual: '', target: '', topik: '', niche: '', nicheBantu: false, tema: '', umur: [], gender: 'Semua', lokasi: 'Indonesia', siapa: '', masalah: '', nada: [], sapaan: 'aku–kamu', bahasa: 'Indonesia', wajah: '', perMinggu: 4, format: [], durasi: 30, gayaVideo: 'otomatis', look: 'otomatis', grade: 'otomatis', suara: '', panutan: '', hindari: '', lain: '' };

function Chip({ pilihan, nilai, set, banyak }: { pilihan: Array<string | [string, string]>; nilai: string | string[]; set: (v: any) => void; banyak?: boolean }) {
    return (
        <div className="st-chip" role={banyak ? 'group' : 'radiogroup'}>
            {pilihan.map((p) => {
                const [v, l] = Array.isArray(p) ? p : [p, p];
                const on = banyak ? (nilai as string[]).includes(v) : nilai === v;
                return <button key={v} type="button" className={on ? 'on' : ''} aria-pressed={banyak ? on : undefined} role={banyak ? undefined : 'radio'} aria-checked={banyak ? undefined : on}
                    onClick={() => set(banyak ? (on ? (nilai as string[]).filter((x) => x !== v) : [...(nilai as string[]), v]) : v)}>{l}</button>;
            })}
        </div>
    );
}
function Tanya({ judul, ket, children }: { judul: string; ket?: string; children?: React.ReactNode }) {
    return <div className="st-q"><b>{judul}</b>{ket && <small>{ket}</small>}{children}</div>;
}

/** Kuis awal akun baru: seperti sesi brief dengan agency. Setelah selesai, tim mengerjakan semuanya otomatis. */
export function Starter({ platform, formatPlatform, labelFormat, gaya, katalog, kirim, batal, sibuk, gambarGaya }: {
    platform: { nama: string; ikon: string }; formatPlatform: string[]; labelFormat: Record<string, string>; gaya: Array<ItemPilih & { jenis: string }>; katalog: { look: ItemPilih[]; grade: ItemPilih[] };
    kirim: (j: JawabanStarter) => void; batal?: () => void; sibuk: boolean; gambarGaya?: Record<string, string>;
}) {
    const [j, setJ] = useState<JawabanStarter>({ ...AWAL, format: formatPlatform.slice(0, 2) });
    const [i, setI] = useState(0);
    const set = <K extends keyof JawabanStarter>(k: K) => (v: JawabanStarter[K]) => setJ((x) => ({ ...x, [k]: v }));
    const ti = (k: keyof JawabanStarter, ph: string, baris = 0) => baris
        ? <textarea rows={baris} value={j[k] as string} placeholder={ph} onChange={(e) => set(k)(e.target.value as any)} />
        : <input value={j[k] as string} placeholder={ph} onChange={(e) => set(k)(e.target.value as any)} />;
    const real = gaya.find((g) => g.id === j.gayaVideo)?.jenis === 'real';
    const LANGKAH: Array<{ judul: string; isi: React.ReactNode; ok: boolean }> = [
        { judul: 'Tujuan akun', ok: j.tujuan.length > 0, isi: (<>
            <Tanya judul={`Akun ${platform.nama} ini untuk apa?`} ket="Boleh pilih lebih dari satu."><Chip banyak pilihan={['Personal brand (dikenal sebagai ahli)', 'Jualan produk / jasa', 'Bangun komunitas', 'Edukasi', 'Hiburan', 'Dapat klien / leads']} nilai={j.tujuan} set={set('tujuan')} /></Tanya>
            {j.tujuan.some((t) => /Jualan|klien/.test(t)) && <Tanya judul="Apa yang dijual atau ditawarkan?">{ti('jual', 'mis. kelas online Rp99rb, jasa desain logo, kopi literan')}</Tanya>}
            <Tanya judul="Target 3–6 bulan ke depan?" ket="Opsional. Membantu tim menentukan prioritas.">{ti('target', 'mis. 5.000 pengikut, 30 pembeli/bulan, 10 klien')}</Tanya>
        </>) },
        { judul: 'Topik & niche', ok: !!j.topik.trim(), isi: (<>
            <Tanya judul="Akun ini mau membahas apa?" ket="Tulis dengan bahasa sendiri.">{ti('topik', 'mis. masak hemat untuk anak kos, tips pakai AI untuk UMKM', 2)}</Tanya>
            <Tanya judul="Niche spesifiknya?" ket="Semakin spesifik, semakin cepat tumbuh. Belum tahu? Biarkan tim yang memilihkan.">
                {!j.nicheBantu && ti('niche', 'mis. resep 15 menit di bawah Rp20 ribu')}
                <label className="st-cek"><input type="checkbox" checked={j.nicheBantu} onChange={(e) => setJ({ ...j, nicheBantu: e.target.checked, niche: e.target.checked ? '' : j.niche })} /> Belum tahu, tolong pilihkan niche terbaik</label>
            </Tanya>
            <Tanya judul="Tema / konsep / ciri khas?" ket="Opsional. Mis. karakter, slogan, seri tetap.">{ti('tema', 'mis. "dapur kos ala chef", selalu ada hitungan biaya di akhir')}</Tanya>
        </>) },
        { judul: 'Target penonton', ok: !!(j.siapa.trim() || j.umur.length), isi: (<>
            <Tanya judul="Umur penonton yang dituju"><Chip banyak pilihan={['13–17', '18–24', '25–34', '35–44', '45+']} nilai={j.umur} set={set('umur')} /></Tanya>
            <Tanya judul="Jenis kelamin"><Chip pilihan={['Semua', 'Lebih banyak pria', 'Lebih banyak wanita']} nilai={j.gender} set={set('gender')} /></Tanya>
            <Tanya judul="Lokasi">{ti('lokasi', 'mis. Indonesia, Jabodetabek, Surabaya')}</Tanya>
            <Tanya judul="Siapa mereka?" ket="Pekerjaan, kondisi, kebiasaan.">{ti('siapa', 'mis. mahasiswa rantau, ibu rumah tangga yang jualan online')}</Tanya>
            <Tanya judul="Masalah terbesar mereka yang bisa dibantu akun ini?">{ti('masalah', 'mis. uang bulanan cepat habis, bingung masak apa', 2)}</Tanya>
        </>) },
        { judul: 'Gaya bicara', ok: j.nada.length > 0, isi: (<>
            <Tanya judul="Nada konten" ket="Pilih 1–3."><Chip banyak pilihan={['Santai', 'Lucu', 'Edukatif', 'Inspiratif', 'Profesional', 'Tegas / to the point', 'Hangat']} nilai={j.nada} set={set('nada')} /></Tanya>
            <Tanya judul="Sapaan ke penonton"><Chip pilihan={['aku–kamu', 'gue–lo', 'saya–Anda', 'kak / kakak']} nilai={j.sapaan} set={set('sapaan')} /></Tanya>
            <Tanya judul="Bahasa"><Chip pilihan={['Indonesia', 'Inggris', 'Campur Indonesia–Inggris']} nilai={j.bahasa} set={set('bahasa')} /></Tanya>
            <Tanya judul="Karakter suara narasi (untuk ElevenLabs)" ket="Opsional.">{ti('suara', 'mis. wanita 20-an, ceria, tempo cepat')}</Tanya>
        </>) },
        { judul: 'Kemampuan produksi', ok: !!j.wajah && j.format.length > 0, isi: (<>
            <Tanya judul="Mau tampil di kamera?" ket="Menentukan porsi video real vs animasi."><Chip pilihan={['Ya, tampil wajah', 'Suara saja (wajah tidak tampil)', 'Tidak tampil sama sekali']} nilai={j.wajah} set={set('wajah')} /></Tanya>
            <Tanya judul="Sanggup berapa konten per minggu?" ket="Lebih baik konsisten daripada banyak tapi putus."><Chip pilihan={[['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['7', '7 (tiap hari)'], ['10', '10+']]} nilai={String(j.perMinggu)} set={(v: string) => set('perMinggu')(+v)} /></Tanya>
            <Tanya judul={`Format di ${platform.nama}`}><Chip banyak pilihan={formatPlatform.map((f) => [f, labelFormat[f] || f] as [string, string])} nilai={j.format} set={set('format')} /></Tanya>
            <Tanya judul="Durasi video pendek"><Chip pilihan={[['15', '15 dtk'], ['30', '30 dtk'], ['45', '45 dtk'], ['60', '60 dtk'], ['90', '90 dtk']]} nilai={String(j.durasi)} set={(v: string) => set('durasi')(+v)} /></Tanya>
        </>) },
        { judul: 'Gaya visual', ok: true, isi: (<>
            <Tanya judul="Gaya video yang Bapak suka" ket="Ketuk satu. Bisa diganti kapan saja, dan tiap konten tetap boleh beda gaya.">
                <Chip pilihan={[['otomatis', '✨ Pilihkan saja']]} nilai={j.gayaVideo} set={set('gayaVideo')} />
                <GaleriPilih jenis="gaya" daftar={gaya.map((g) => ({ ...g, jenisGaya: g.jenis === 'real' ? 'Real' : 'Animasi' }))} pilih={[j.gayaVideo]} onPilih={(id) => set('gayaVideo')(id)} gambar={gambarGaya} />
            </Tanya>
            {real && <Tanya judul="Look editing (video real)" ket="Dari skill video-edit."><Chip pilihan={[['otomatis', 'Pilihkan saja'], ...katalog.look.map((l) => [l.id, l.nama] as [string, string])]} nilai={j.look} set={set('look')} /></Tanya>}
            <Tanya judul="Warna / color grade" ket="Contoh di bawah adalah perkiraan suasana warnanya.">
                <Chip pilihan={[['otomatis', '✨ Pilihkan saja'], ['tanpa', 'Tanpa color grade']]} nilai={j.grade} set={set('grade')} />
                <GaleriPilih jenis="grade" daftar={katalog.grade} pilih={[j.grade]} onPilih={(id) => set('grade')(id)} />
            </Tanya>
        </>) },
        { judul: 'Referensi', ok: true, isi: (<>
            <Tanya judul="Akun panutan / pesaing" ket="Opsional. Tulis @username, pisahkan koma.">{ti('panutan', '@akun1, @akun2')}</Tanya>
            <Tanya judul="Hal yang harus dihindari" ket="Opsional.">{ti('hindari', 'mis. tidak bahas politik, tidak pakai kata kasar, tidak sebut merek pesaing', 2)}</Tanya>
            <Tanya judul="Ada lagi yang perlu tim tahu?" ket="Opsional.">{ti('lain', 'mis. jadwal promo, keunggulan produk, cerita pribadi yang boleh dibagikan', 3)}</Tanya>
        </>) }
    ];
    const n = LANGKAH.length, akhir = i === n;
    const ringkas: Array<[string, string]> = [['Tujuan', [j.tujuan.join(', '), j.jual].filter(Boolean).join(' · ')], ['Topik', j.topik], ['Niche', j.nicheBantu ? 'dipilihkan tim' : j.niche], ['Penonton', [j.umur.join(', '), j.gender !== 'Semua' ? j.gender : '', j.lokasi, j.siapa].filter(Boolean).join(' · ')], ['Masalah mereka', j.masalah],
        ['Gaya bicara', [j.nada.join(', '), j.sapaan, j.bahasa].filter(Boolean).join(' · ')], ['Produksi', [j.wajah, `${j.perMinggu}/minggu`, j.format.map((f) => labelFormat[f] || f).join(', '), `${j.durasi} dtk`].filter(Boolean).join(' · ')],
        ['Visual', [gaya.find((g) => g.id === j.gayaVideo)?.nama || 'gaya dipilihkan', j.grade === 'otomatis' ? 'grade dipilihkan' : j.grade === 'tanpa' ? 'tanpa grade' : katalog.grade.find((g) => g.id === j.grade)?.nama].filter(Boolean).join(' · ')]];
    return (
        <section className="sb-card st">
            <div className="st-h"><div><h3><Ikon e={platform.ikon} /> Kenalan dulu dengan akun ini</h3><p>Seperti brief di agency: Bapak cukup menjawab, sisanya tim yang kerjakan — riset niche, strategi, bio, kalender, sampai sketsa konten pertama.</p></div>{batal && <button className="btn small" onClick={batal}>Tutup</button>}</div>
            <ol className="st-prog">{LANGKAH.map((l, k) => <li key={l.judul} className={k < i ? 'lewat' : k === i ? 'kini' : ''}><button type="button" onClick={() => setI(k)} disabled={k > i && !LANGKAH.slice(0, k).every((x) => x.ok)}>{l.judul}</button></li>)}<li className={akhir ? 'kini' : ''}><span>Mulai</span></li></ol>
            {!akhir ? (
                <div className="st-isi">
                    <h4>{i + 1}. {LANGKAH[i].judul}</h4>
                    {LANGKAH[i].isi}
                    <div className="sm-aksi">{i > 0 && <button className="btn" onClick={() => setI(i - 1)}>← Kembali</button>}<button className="btn primary" disabled={!LANGKAH[i].ok} onClick={() => setI(i + 1)}>{i === n - 1 ? 'Lihat ringkasan' : 'Lanjut →'}</button>{!LANGKAH[i].ok && <small className="sb-note" style={{ margin: 0 }}>Isi bagian utama dulu.</small>}</div>
                </div>
            ) : (
                <div className="st-isi">
                    <h4>Ringkasan brief</h4>
                    <dl className="st-ring">{ringkas.filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
                    <div className="st-akan"><b>Setelah Bapak menekan Mulai, tim otomatis:</b><ol><li>Tara meriset niche: masalah penonton, pola yang berhasil, celah, akun acuan.</li><li>Maya menyusun strategi, pilar konten, dan jadwal unggah per hari.</li><li>Maya membuat paket profil: nama, username, 3 versi bio, link bio, highlight, foto profil, 3 postingan pertama.</li><li>Maya mengisi kalender 7 hari pertama.</li><li>Lala & Vino membuat sketsa + prompt untuk 2 konten pertama.</li></ol><small>Sekitar 10–20 menit. Progresnya terlihat di halaman akun ini; Maya mengabari Bapak lewat chat saat selesai.</small></div>
                    <div className="sm-aksi"><button className="btn" onClick={() => setI(n - 1)}>← Ubah jawaban</button><button className="btn primary" disabled={sibuk} onClick={() => kirim(j)}>{sibuk ? 'Tim sedang bekerja…' : <><Ikon e="🚀" /> {'Mulai, buatkan semuanya'}</>}</button></div>
                </div>
            )}
        </section>
    );
}
