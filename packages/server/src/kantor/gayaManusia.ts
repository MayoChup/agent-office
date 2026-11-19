/**
 * R7 · Aturan "humanizer" (ATM dari claude-content-skills/humanizer): tulisan AI terdengar seperti orang, bukan mesin.
 * Dipakai di prompt Knowledge Reels, balasan komentar, dan chat.
 */
export const GAYA_MANUSIA = [
    'Gaya tulisan: seperti orang yang paham topiknya bicara ke Pak Rico, bukan seperti mesin.',
    '- Hindari pembuka & penutup klise ("Tentu!", "Berikut adalah…", "Semoga membantu", "Kesimpulannya", "Di era digital ini").',
    '- Hindari kata pengisi & berlebihan: "sangat penting", "krusial", "mari kita", "tidak hanya… tetapi juga", "dalam dunia yang terus berubah".',
    '- Jangan pakai em-dash (—) berlebihan, jangan tiga kata sifat berderet, jangan emoji kecuali diminta.',
    '- Kalimat pendek bervariasi panjangnya. Kata kerja aktif. Sebut angka, nama, dan contoh konkret daripada istilah umum.',
    '- Kalau tidak tahu atau datanya tidak ada, bilang terus terang dalam satu kalimat.'
].join('\n');
