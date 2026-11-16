/**
 * Katalog penyuntingan video untuk prompt edit (dipakai dengan skill Claude /video-edit dari tenfoldmarc).
 * - LOOK: 3 tampilan yang memang ada di skill publik (references/looks.md).
 * - EFEK: daftar dari video tenfoldmarc ("16 new video effects", "17 video effects claude can create").
 *   Di repo publik saat ini hanya "orbit" (+ sisipan UI, punch-in, kata di belakang kepala) yang sudah jadi;
 *   efek lain dari koleksi "Studio"-nya. Deskripsi di bawah adalah tafsiran kantor dari nama & cuplikannya,
 *   supaya Claude bisa membuatnya ulang dengan HyperFrames.
 * - GRADE: 20 color grade film dari video "20 movie color grades claude can create".
 */
export interface ItemKatalog { id: string; nama: string; ket: string; diSkill?: boolean; cocok?: 'real' | 'animasi' | 'semua' }

export const LOOK: ItemKatalog[] = [
    { id: 'bold', nama: 'Bold', ket: 'Kata-kata kinetik huruf kecil di sekitar pembicara, kata besar terselip di belakang kepala; grade natural sedikit kontras.', diSkill: true, cocok: 'real' },
    { id: 'cool-girl', nama: 'Cool girl', ket: 'Grade hangat, teks kecil tenang + satu baris serif miring kuning, kilau ✦, reel milik sendiri mengorbit.', diSkill: true, cocok: 'real' },
    { id: 'cool-dude', nama: 'Cool dude', ket: 'Editorial gelap ala studio interview: huruf kapital kecil berjarak lebar + kata serif besar, push-in pelan.', diSkill: true, cocok: 'real' }
];

export const EFEK: ItemKatalog[] = [
    // bawaan skill publik
    { id: 'punch-in', nama: 'punch-in', ket: 'Potongan zoom tajam 1,3–1,9× dari rekaman 4K supaya variasi sudut.', diSkill: true, cocok: 'real' },
    { id: 'behind-head', nama: 'words behind head', ket: 'Kata besar di belakang kepala (pembicara dipotong dari latar).', diSkill: true, cocok: 'real' },
    { id: 'ui-insert', nama: 'UI insert', ket: 'Sisipan animasi layar aplikasi/website di dinding belakang pembicara.', diSkill: true, cocok: 'semua' },
    { id: 'ig-follow', nama: 'IG follow', ket: 'Animasi profil Instagram di-follow + kata kunci CTA diketik di komentar.', diSkill: true, cocok: 'semua' },
    { id: 'file-scroll', nama: 'file scroll', ket: 'Berkas/kode bergulir halus dengan sorotan baris.', diSkill: true, cocok: 'semua' },
    { id: 'orbit', nama: 'orbit', ket: 'Kartu reel/gambar mengorbit mengelilingi pembicara (depan & belakang badan).', diSkill: true, cocok: 'real' },
    // 16 efek
    { id: 'type-wall', nama: 'type wall', ket: 'Dinding penuh tulisan besar di belakang pembicara.', cocok: 'real' },
    { id: 'the-stack', nama: 'the stack', ket: 'Klip/kartu bertumpuk yang bergantian maju.', cocok: 'semua' },
    { id: 'depth-scatter', nama: 'depth scatter', ket: 'Kata-kata tersebar di beberapa lapis kedalaman, sebagian di depan, sebagian di belakang badan.', cocok: 'real' },
    { id: 'rack-focus', nama: 'rack focus', ket: 'Fokus berpindah: latar tajam lalu pembicara tajam (blur bergeser).', cocok: 'semua' },
    { id: 'spatial-glass', nama: 'spatial glass', ket: 'Panel kaca buram melayang berisi teks/ikon, terasa 3D.', cocok: 'semua' },
    { id: 'scene-text', nama: 'scene text', ket: 'Teks menyatu dengan ruangan (seolah tertulis di dinding/benda).', cocok: 'real' },
    { id: 'freeze-sticker', nama: 'freeze sticker', ket: 'Gambar membeku, pembicara jadi stiker berpinggir putih di latar warna polos + tulisan.', cocok: 'real' },
    { id: 'sticky-text', nama: 'sticky text', ket: 'Label teks menempel dan ikut bergerak bersama objek/pembicara.', cocok: 'semua' },
    { id: 'clone', nama: 'clone', ket: 'Pembicara digandakan dalam satu bingkai.', cocok: 'real' },
    { id: 'blackout', nama: 'blackout', ket: 'Latar menghitam, hanya pembicara yang terlihat.', cocok: 'real' },
    { id: 'freeze-label', nama: 'freeze + label', ket: 'Gambar berhenti sejenak dengan label/penunjuk keterangan.', cocok: 'semua' },
    { id: 'shatter-3d', nama: 'shatter 3d', ket: 'Bingkai pecah jadi kepingan 3D sebagai transisi.', cocok: 'semua' },
    { id: 'chip-row', nama: 'chip row', ket: 'Deretan chip/label kecil muncul berurutan (mis. daftar alat).', cocok: 'semua' },
    { id: 'serif-flow', nama: 'serif flow', ket: 'Tulisan serif besar mengalir elegan di layar kosong/gelap.', cocok: 'semua' },
    { id: 'spotlight', nama: 'spotlight', ket: 'Sorot cahaya bulat ke pembicara/benda, sekelilingnya gelap.', cocok: 'semua' },
    { id: 'prompt-box', nama: 'prompt box', ket: 'Kotak prompt AI yang mengetik sendiri lalu menampilkan hasil.', cocok: 'semua' },
    // 17 efek
    { id: 'couch-wall', nama: 'couch wall', ket: 'Dinding belakang penuh tempelan kertas/gambar yang muncul bergantian.', cocok: 'real' },
    { id: 'ui-world', nama: 'ui world', ket: 'Pembicara berada di tengah elemen UI aplikasi yang besar di sekelilingnya.', cocok: 'semua' },
    { id: 'frame-break', nama: 'frame break', ket: 'Pembicara/benda keluar menembus batas bingkai video.', cocok: 'semua' },
    { id: 'digital-zoom', nama: 'digital zoom', ket: 'Zoom digital cepat ke wajah atau detail penting.', cocok: 'semua' },
    { id: 'phone-mockup', nama: 'phone mockup', ket: 'Video tampil di dalam mockup HP yang bergerak.', cocok: 'semua' },
    { id: 'checklist', nama: 'checklist', ket: 'Daftar centang yang tercentang satu per satu sesuai ucapan.', cocok: 'semua' },
    { id: 'headline-wall', nama: 'headline wall', ket: 'Dinding judul berita/artikel di belakang pembicara.', cocok: 'semua' },
    { id: 'zoom-through', nama: 'zoom-through cut', ket: 'Transisi zoom menembus objek masuk ke adegan berikutnya.', cocok: 'semua' },
    { id: 'chart-grow', nama: 'chart grow', ket: 'Grafik batang/garis tumbuh mengikuti angka yang diucapkan.', cocok: 'semua' },
    { id: 'pull-back', nama: 'pull-back reveal', ket: 'Kamera mundur menampakkan konteks yang lebih luas.', cocok: 'semua' },
    { id: 'green-screen', nama: 'green screen', ket: 'Latar belakang diganti gambar/video lain.', cocok: 'real' },
    { id: 'paper-cut', nama: 'paper cut', ket: 'Tampilan potongan kertas berlapis dengan bayangan.', cocok: 'semua' },
    { id: 'doodle-boil', nama: 'doodle boil', ket: 'Coretan tangan yang "mendidih" (garis bergetar) di sekitar subjek.', cocok: 'semua' },
    { id: 'vertigo', nama: 'vertigo', ket: 'Dolly zoom: latar seolah menjauh/mendekat sementara subjek tetap.', cocok: 'semua' },
    { id: 'cover-story', nama: 'cover story', ket: 'Bingkai jadi sampul majalah dengan judul besar.', cocok: 'semua' },
    { id: 'glass-type', nama: 'glass type', ket: 'Tulisan besar dari kaca/transparan yang membiaskan latar.', cocok: 'semua' }
];

export const GRADE: ItemKatalog[] = [
    { id: 'blade-runner-2049', nama: 'Blade Runner 2049', ket: 'oranye-amber pekat, kabut, kontras lembut' },
    { id: 'la-la-land', nama: 'La La Land', ket: 'ungu-magenta senja, biru malam, romantis' },
    { id: 'the-godfather', nama: 'The Godfather', ket: 'kuning-cokelat hangat, bayangan sangat gelap' },
    { id: 'the-revenant', nama: 'The Revenant', ket: 'biru-abu dingin, cahaya alami, desaturasi' },
    { id: 'the-matrix', nama: 'The Matrix', ket: 'semburat hijau, kontras tinggi' },
    { id: 'dune', nama: 'Dune', ket: 'krem-pasir pucat, kontras rendah, luas' },
    { id: 'traffic', nama: 'Traffic', ket: 'kuning terbakar, berbutir, panas' },
    { id: 'joker', nama: 'Joker', ket: 'hijau-kekuningan kusam dengan aksen oranye' },
    { id: 'mad-max', nama: 'Mad Max: Fury Road', ket: 'oranye-teal sangat jenuh' },
    { id: 'amelie', nama: 'Amélie', ket: 'hijau-merah hangat, nostalgia' },
    { id: 'her', nama: 'Her', ket: 'merah muda-koral lembut, hangat pastel' },
    { id: 'moonlight', nama: 'Moonlight', ket: 'teal-biru dalam dengan kulit hangat' },
    { id: 'barbie', nama: 'Barbie', ket: 'pink cerah, jenuh, bersih' },
    { id: 'grand-budapest', nama: 'The Grand Budapest Hotel', ket: 'pastel pink-krem simetris' },
    { id: 'wizard-of-oz', nama: 'The Wizard of Oz', ket: 'technicolor sangat jenuh' },
    { id: 'saving-private-ryan', nama: 'Saving Private Ryan', ket: 'desaturasi berat, dingin, keras' },
    { id: 'drive', nama: 'Drive', ket: 'neon pink-biru malam' },
    { id: 'the-lighthouse', nama: 'The Lighthouse', ket: 'hitam-putih kontras tinggi' },
    { id: 'sin-city', nama: 'Sin City', ket: 'hitam-putih dengan satu warna merah' },
    { id: 'chungking-express', nama: 'Chungking Express', ket: 'hijau-kuning neon, gerak buram' }
];

const cariDi = (daftar: ItemKatalog[], x: any) => { const s = String(x || '').toLowerCase().trim(); return daftar.find((i) => i.id === s || i.nama.toLowerCase() === s) || null; };
export const cariLook = (x: any) => cariDi(LOOK, x);
export const cariGrade = (x: any) => cariDi(GRADE, x);
export const cariEfek = (x: any) => cariDi(EFEK, x);

/** Ringkasan katalog untuk prompt AI (singkat supaya hemat token). */
export function katalogUntukPrompt(jenis: 'real' | 'animasi' | 'semua' = 'semua') {
    const ef = EFEK.filter((e) => jenis === 'semua' || e.cocok === 'semua' || e.cocok === jenis);
    return [
        jenis !== 'animasi' ? `LOOK (skill /video-edit, khusus real): ${LOOK.map((l) => `${l.id} = ${l.ket}`).join(' | ')}` : '',
        `EFEK VIDEO (id = keterangan): ${ef.map((e) => `${e.id} = ${e.ket}`).join(' | ')}`,
        `COLOR GRADE (id = ciri): ${GRADE.map((g) => `${g.id} = ${g.ket}`).join(' | ')}`
    ].filter(Boolean).join('\n');
}
