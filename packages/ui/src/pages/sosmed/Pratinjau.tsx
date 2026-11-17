import React from 'react';

/**
 * Pratinjau visual untuk memilih color grade, efek video, dan gaya video tanpa harus hafal namanya.
 * Semua gambar & animasi di sini buatan kantor sendiri (bukan cuplikan film/video orang lain),
 * jadi hanya PERKIRAAN tampilan, bukan hasil persis.
 */
export interface ItemPilih { id: string; nama: string; ket: string; diSkill?: boolean; cocok?: string }

/* ── Adegan dasar: ruangan, jendela, tanaman, orang, mug merah ── */
function Ruangan({ merah = true }: { merah?: boolean }) {
    return (
        <svg viewBox="0 0 160 100" className="pv-scene" aria-hidden="true">
            <defs>
                <linearGradient id="pv-dinding" x1="0" x2="1"><stop offset="0" stopColor="#d9cbb3" /><stop offset="1" stopColor="#b9a88e" /></linearGradient>
                <linearGradient id="pv-jendela" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#bfe0f5" /><stop offset="1" stopColor="#f3e9cf" /></linearGradient>
                <radialGradient id="pv-cahaya" cx=".2" cy=".2" r=".9"><stop offset="0" stopColor="#fff6dc" stopOpacity=".7" /><stop offset="1" stopColor="#fff6dc" stopOpacity="0" /></radialGradient>
                <linearGradient id="pv-kulit" x1="0" x2="1"><stop offset="0" stopColor="#e9b48f" /><stop offset="1" stopColor="#c98c66" /></linearGradient>
            </defs>
            <rect width="160" height="100" fill="url(#pv-dinding)" />
            <rect x="12" y="10" width="40" height="46" rx="2" fill="url(#pv-jendela)" stroke="#8a7a62" strokeWidth="2" />
            <path d="M32 10 V56 M12 33 H52" stroke="#8a7a62" strokeWidth="1.5" />
            <rect width="160" height="100" fill="url(#pv-cahaya)" />
            <rect x="0" y="76" width="160" height="24" fill="#7a5537" />
            <rect x="0" y="76" width="160" height="3" fill="#94694a" />
            <path d="M128 76 q-4 -18 2 -30 q6 12 2 30 Z M134 76 q4 -22 14 -26 q-4 16 -8 26 Z M124 76 q-10 -12 -6 -24 q8 10 10 24 Z" fill="#4f8a3c" />
            <rect x="124" y="70" width="20" height="10" rx="2" fill="#a86b45" />
            <path d="M66 100 q0 -26 22 -28 q22 2 22 28 Z" fill="#3b5f8f" />
            <rect x="83" y="62" width="10" height="11" fill="#c98c66" />
            <ellipse cx="88" cy="50" rx="13" ry="15" fill="url(#pv-kulit)" />
            <path d="M75 47 q1 -15 13 -15 q13 0 13 15 q-3 -8 -13 -8 q-10 0 -13 8 Z" fill="#2b2119" />
            <circle cx="83" cy="51" r="1.3" fill="#2b2119" /><circle cx="93" cy="51" r="1.3" fill="#2b2119" />
            <path d="M84 58 q4 3 8 0" stroke="#8a4a35" strokeWidth="1.2" fill="none" />
            {merah && <g><rect x="42" y="66" width="10" height="11" rx="1.5" fill="#d42c2c" /><path d="M52 69 q5 0 5 3.5 q0 3.5 -5 3.5" stroke="#d42c2c" strokeWidth="1.6" fill="none" /></g>}
        </svg>
    );
}

/* ── Color grade: perkiraan lewat filter + lapisan warna ── */
const GRADE: Record<string, { f: string; ov?: string; b?: string; vig?: number }> = {
    'blade-runner-2049': { f: 'sepia(.45) saturate(1.5) contrast(.95) brightness(.95)', ov: 'linear-gradient(180deg, rgba(255,140,40,.55), rgba(180,70,10,.45))', b: 'multiply', vig: .35 },
    'la-la-land': { f: 'saturate(1.3) contrast(1.05)', ov: 'linear-gradient(160deg, rgba(170,70,230,.65), rgba(30,40,150,.6))', b: 'overlay', vig: .3 },
    'the-godfather': { f: 'sepia(.55) contrast(1.25) brightness(.7) saturate(.9)', ov: 'rgba(120,80,20,.3)', b: 'multiply', vig: .6 },
    'the-revenant': { f: 'saturate(.45) contrast(1.05) brightness(1.02)', ov: 'rgba(80,130,190,.45)', b: 'soft-light', vig: .2 },
    'the-matrix': { f: 'saturate(.8) contrast(1.2)', ov: 'rgba(0,255,90,.4)', b: 'soft-light', vig: .35 },
    dune: { f: 'sepia(.35) saturate(.7) contrast(.85) brightness(1.08)', ov: 'rgba(235,205,150,.4)', b: 'soft-light', vig: .15 },
    traffic: { f: 'sepia(.6) saturate(1.8) contrast(1.15)', ov: 'rgba(255,200,0,.35)', b: 'multiply', vig: .3 },
    joker: { f: 'saturate(.85) contrast(1.1)', ov: 'linear-gradient(rgba(120,170,60,.5), rgba(230,120,30,.4))', b: 'soft-light', vig: .35 },
    'mad-max': { f: 'saturate(1.9) contrast(1.2)', ov: 'linear-gradient(90deg, rgba(0,160,180,.5), rgba(255,120,0,.55))', b: 'overlay', vig: .3 },
    amelie: { f: 'saturate(1.5) contrast(1.05)', ov: 'linear-gradient(rgba(60,170,60,.45), rgba(220,50,40,.4))', b: 'soft-light', vig: .35 },
    her: { f: 'saturate(1.1) contrast(.9) brightness(1.08)', ov: 'rgba(255,120,110,.5)', b: 'soft-light', vig: .1 },
    moonlight: { f: 'saturate(1.3) contrast(1.1)', ov: 'linear-gradient(rgba(0,130,150,.6), rgba(0,40,120,.6))', b: 'soft-light', vig: .35 },
    barbie: { f: 'saturate(1.6) brightness(1.1)', ov: 'rgba(255,80,180,.55)', b: 'soft-light', vig: 0 },
    'grand-budapest': { f: 'saturate(.9) contrast(.9) brightness(1.1)', ov: 'rgba(255,170,195,.55)', b: 'soft-light', vig: .1 },
    'wizard-of-oz': { f: 'saturate(2.3) contrast(1.15)', vig: .15 },
    'saving-private-ryan': { f: 'saturate(.25) contrast(1.3)', ov: 'rgba(70,90,110,.35)', b: 'soft-light', vig: .4 },
    drive: { f: 'saturate(1.4) contrast(1.15) brightness(.8)', ov: 'linear-gradient(90deg, rgba(255,40,170,.6), rgba(40,90,255,.6))', b: 'overlay', vig: .45 },
    'the-lighthouse': { f: 'grayscale(1) contrast(1.6) brightness(.9)', vig: .55 },
    'sin-city': { f: 'grayscale(1) contrast(1.9) brightness(.85)', vig: .5 },
    'chungking-express': { f: 'saturate(1.5) contrast(1.1) blur(.4px)', ov: 'linear-gradient(rgba(120,230,60,.45), rgba(255,220,0,.35))', b: 'soft-light', vig: .3 }
};
export function PratinjauGrade({ id }: { id: string }) {
    const g = GRADE[id];
    return (
        <div className="pv-grade" aria-hidden="true">
            <div style={{ filter: g?.f || 'none' }}><Ruangan merah={id !== 'sin-city'} /></div>
            {g?.ov && <i className="pv-ov" style={{ background: g.ov, mixBlendMode: (g.b || 'normal') as any }} />}
            {!!g?.vig && <i className="pv-vig" style={{ opacity: g.vig }} />}
            {id === 'sin-city' && <svg viewBox="0 0 160 100" className="pv-scene pv-atas"><rect x="42" y="66" width="10" height="11" rx="1.5" fill="#e01e1e" /><path d="M52 69 q5 0 5 3.5 q0 3.5 -5 3.5" stroke="#e01e1e" strokeWidth="1.6" fill="none" /></svg>}
        </div>
    );
}

/* ── Gaya video: ilustrasi kecil per gaya bawaan ── */
export function PratinjauGaya({ id, gambar }: { id: string; gambar?: string }) {
    if (gambar) return <div className="pv-gaya"><img src={gambar} alt="" loading="lazy" /></div>;
    const isi: Record<string, React.ReactNode> = {
        real: <div className="pv-real"><Ruangan /><span className="pv-rec">● REC</span></div>,
        kartun3d: (
            <svg viewBox="0 0 160 100"><defs><radialGradient id="k3-a" cx=".35" cy=".3"><stop offset="0" stopColor="#ffe3c9" /><stop offset="1" stopColor="#f0a77c" /></radialGradient><linearGradient id="k3-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c7e9ff" /><stop offset="1" stopColor="#ffe9f3" /></linearGradient><radialGradient id="k3-c" cx=".35" cy=".3"><stop offset="0" stopColor="#8fd3ff" /><stop offset="1" stopColor="#3f8fd8" /></radialGradient></defs>
                <rect width="160" height="100" fill="url(#k3-b)" /><ellipse cx="80" cy="96" rx="44" ry="8" fill="#000" opacity=".08" /><ellipse cx="80" cy="84" rx="26" ry="18" fill="url(#k3-c)" /><circle cx="80" cy="48" r="24" fill="url(#k3-a)" />
                <ellipse cx="71" cy="47" rx="4" ry="5.5" fill="#2a2a3a" /><ellipse cx="89" cy="47" rx="4" ry="5.5" fill="#2a2a3a" /><circle cx="72.5" cy="45" r="1.4" fill="#fff" /><circle cx="90.5" cy="45" r="1.4" fill="#fff" /><path d="M73 58 q7 6 14 0" stroke="#a5523a" strokeWidth="2.2" fill="none" strokeLinecap="round" /><circle cx="64" cy="56" r="3.5" fill="#ff9aa8" opacity=".6" /><circle cx="96" cy="56" r="3.5" fill="#ff9aa8" opacity=".6" /></svg>
        ),
        motion2d: (
            <svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#1e2a4a" /><circle cx="44" cy="44" r="20" fill="#ffcb47" /><rect x="74" y="26" width="58" height="10" rx="5" fill="#fff" /><rect x="74" y="42" width="40" height="8" rx="4" fill="#5ad1c5" /><rect x="74" y="56" width="50" height="8" rx="4" fill="#5ad1c5" opacity=".6" /><path d="M30 82 h100" stroke="#5ad1c5" strokeWidth="3" strokeLinecap="round" /><path d="M38 44 l5 5 l9 -11" stroke="#1e2a4a" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><rect x="118" y="72" width="16" height="16" rx="3" fill="#ff6b6b" transform="rotate(15 126 80)" /></svg>
        ),
        kinetik: (
            <svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#111" /><text x="14" y="38" fontSize="26" fontWeight="900" fill="#fff" fontFamily="system-ui">STOK</text><text x="14" y="66" fontSize="30" fontWeight="900" fill="#ffd23f" fontFamily="system-ui">HABIS?</text><text x="14" y="88" fontSize="14" fontWeight="700" fill="#fff" opacity=".7" fontFamily="system-ui">tanya AI dulu</text></svg>
        ),
        papantulis: (
            <svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#fbfbf7" /><g stroke="#222" strokeWidth="2" fill="none" strokeLinecap="round"><circle cx="40" cy="38" r="10" /><path d="M40 48 v22 M40 56 l-12 8 M40 56 l12 6 M40 70 l-9 16 M40 70 l9 16" /><rect x="76" y="24" width="56" height="34" rx="3" /><path d="M84 50 l10 -10 l8 6 l14 -14" stroke="#e8432e" /><path d="M64 44 q6 -6 10 0" /></g><text x="78" y="78" fontSize="11" fill="#222" fontFamily="'Comic Sans MS', cursive">naik 2x!</text></svg>
        ),
        clay: (
            <svg viewBox="0 0 160 100"><defs><radialGradient id="cl-a" cx=".35" cy=".3"><stop offset="0" stopColor="#ffd08a" /><stop offset="1" stopColor="#e08a3c" /></radialGradient><radialGradient id="cl-b" cx=".35" cy=".3"><stop offset="0" stopColor="#9be07a" /><stop offset="1" stopColor="#4f9a3a" /></radialGradient></defs>
                <rect width="160" height="100" fill="#cfc3b0" /><rect y="74" width="160" height="26" fill="#a99474" /><path d="M58 76 q-6 -30 22 -34 q28 4 22 34 Z" fill="url(#cl-b)" /><circle cx="80" cy="34" r="17" fill="url(#cl-a)" /><circle cx="74" cy="32" r="2.6" fill="#2b2118" /><circle cx="86" cy="32" r="2.6" fill="#2b2118" /><path d="M74 41 q6 4 12 0" stroke="#2b2118" strokeWidth="2" fill="none" strokeLinecap="round" />
                <g opacity=".18" stroke="#000" fill="none"><path d="M70 26 q3 -2 6 0" /><path d="M84 46 q3 2 6 0" /><path d="M66 60 q4 -2 7 1" /></g><ellipse cx="128" cy="70" rx="12" ry="9" fill="#d65a5a" /></svg>
        ),
        anime: (
            <svg viewBox="0 0 160 100"><defs><linearGradient id="an-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4aa3ff" /><stop offset="1" stopColor="#ffd6e8" /></linearGradient></defs>
                <rect width="160" height="100" fill="url(#an-a)" /><g stroke="#fff" strokeWidth="1.2" opacity=".75"><path d="M0 20 L60 46 M0 40 L58 52 M160 18 L104 46 M160 44 L106 54 M0 70 L56 62 M160 74 L108 62" /></g>
                <path d="M62 100 q2 -26 18 -28 q16 2 18 28 Z" fill="#2f3b66" /><path d="M66 46 q0 -22 14 -22 q14 0 14 22 q-2 14 -14 18 q-12 -4 -14 -18 Z" fill="#ffe1cc" /><path d="M62 46 q-2 -26 18 -28 q22 0 20 28 q-4 -14 -10 -16 l-6 8 l-4 -8 q-12 2 -18 16 Z" fill="#3a2a5a" />
                <ellipse cx="73" cy="48" rx="3" ry="4.5" fill="#3a6ad8" /><ellipse cx="87" cy="48" rx="3" ry="4.5" fill="#3a6ad8" /><circle cx="74" cy="46.5" r="1.1" fill="#fff" /><circle cx="88" cy="46.5" r="1.1" fill="#fff" /></svg>
        ),
        kolase: (
            <svg viewBox="0 0 160 100"><defs><pattern id="ko-h" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#000" opacity=".35" /></pattern></defs>
                <rect width="160" height="100" fill="#f1e6cf" /><path d="M8 14 L70 8 L74 62 L12 68 Z" fill="#e8574a" transform="rotate(-3 40 38)" filter="drop-shadow(1px 2px 0 rgba(0,0,0,.25))" /><rect x="20" y="20" width="40" height="40" fill="url(#ko-h)" transform="rotate(-3 40 38)" />
                <path d="M84 20 L150 26 L146 80 L80 74 Z" fill="#2f6fb5" filter="drop-shadow(1px 2px 0 rgba(0,0,0,.25))" /><rect x="96" y="40" width="44" height="14" fill="#ffe35a" transform="rotate(4 118 47)" /><text x="100" y="51" fontSize="9" fontWeight="900" fontFamily="system-ui" fill="#111" transform="rotate(4 118 47)">HEMAT!</text><rect x="34" y="72" width="56" height="16" fill="#fff" transform="rotate(-6 60 80)" /></svg>
        )
    };
    return <div className="pv-gaya" aria-hidden="true">{isi[id] || <div className="pv-kosong">🎨</div>}</div>;
}

/* ── Efek video: animasi mini 9:16 buatan sendiri ── */
function Orang({ kelas = '' }: { kelas?: string }) {
    return <svg viewBox="0 0 60 60" className={`pv-orang ${kelas}`}><path d="M10 60 q0 -20 20 -22 q20 2 20 22 Z" fill="#4a6b9a" /><rect x="26" y="30" width="8" height="9" fill="#d9a07a" /><ellipse cx="30" cy="22" rx="10" ry="12" fill="#e2ad87" /><path d="M20 20 q1 -12 10 -12 q10 0 10 12 q-2 -6 -10 -6 q-8 0 -10 6 Z" fill="#2b2119" /></svg>;
}
const kata = (t: string, k = '') => <span className={`pv-k ${k}`}>{t}</span>;
const EFEK: Record<string, (latar: React.ReactNode) => React.ReactNode> = {
    'punch-in': (L) => <div className="pv-a-punch">{L}<Orang /></div>,
    'behind-head': (L) => <>{L}<span className="pv-besar pv-belakang">skill</span><Orang /></>,
    'ui-insert': (L) => <>{L}<div className="pv-jendela pv-a-masuk"><i /><i /><i /></div><Orang /></>,
    'ig-follow': (L) => <>{L}<Orang /><div className="pv-ig"><b /><span className="pv-a-follow" /></div></>,
    'file-scroll': (L) => <>{L}<Orang /><div className="pv-file"><div className="pv-a-gulir">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ width: `${40 + ((i * 37) % 50)}%` }} />)}</div></div></>,
    orbit: (L) => <>{L}<div className="pv-orbit belakang"><i /><i /></div><Orang /><div className="pv-orbit depan"><i /><i /></div></>,
    'type-wall': (L) => <><div className="pv-latar pv-typewall">{Array.from({ length: 7 }, (_, i) => <span key={i}>tips konten tips</span>)}</div><Orang /></>,
    'the-stack': (L) => <><div className="pv-latar pv-polos" /><div className="pv-stack"><i /><i /><i /></div></>,
    'depth-scatter': (L) => <>{L}{kata('cepat', 'pv-s1 pv-belakang')}<Orang />{kata('mudah', 'pv-s2')}{kata('hemat', 'pv-s3')}</>,
    'rack-focus': (L) => <><div className="pv-a-rack-bg">{L}</div><Orang kelas="pv-a-rack-fg" /></>,
    'spatial-glass': (L) => <>{L}<Orang /><div className="pv-kaca pv-a-melayang">3 tips<br />hemat</div></>,
    'scene-text': (L) => <>{L}<span className="pv-dinding-teks">ATUR STOK</span><Orang /></>,
    'freeze-sticker': () => <><div className="pv-latar pv-a-freeze" /><Orang kelas="pv-stiker" /><span className="pv-tulis">beku!</span></>,
    'sticky-text': (L) => <>{L}<div className="pv-a-goyang"><Orang /><span className="pv-label">owner toko</span></div></>,
    clone: (L) => <>{L}<Orang kelas="pv-kiri" /><Orang kelas="pv-kanan" /></>,
    blackout: (L) => <><div className="pv-a-gelap">{L}</div><Orang /></>,
    'freeze-label': (L) => <><div className="pv-a-jeda">{L}<Orang /></div><span className="pv-panah">← ini kuncinya</span></>,
    'shatter-3d': (L) => <>{L}<Orang /><div className="pv-pecah">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div></>,
    'chip-row': (L) => <>{L}<Orang /><div className="pv-chip">{['ChatGPT', 'Canva', 'CapCut'].map((t) => <span key={t}>{t}</span>)}</div></>,
    'serif-flow': () => <><div className="pv-latar pv-gelap" /><span className="pv-serif">mulai <em>hari ini</em></span></>,
    spotlight: (L) => <>{L}<Orang /><i className="pv-sorot" /></>,
    'prompt-box': () => <><div className="pv-latar pv-polos" /><div className="pv-prompt"><span className="pv-a-ketik">buat caption jualan…</span><i /></div></>,
    'couch-wall': (L) => <>{L}<div className="pv-kertas">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div><Orang /></>,
    'ui-world': () => <><div className="pv-latar pv-polos" /><div className="pv-uiw"><i /><i /><i /><i /></div><Orang /></>,
    'frame-break': (L) => <><div className="pv-bingkai">{L}</div><Orang kelas="pv-keluar" /></>,
    'digital-zoom': (L) => <div className="pv-a-dzoom">{L}<Orang /></div>,
    'phone-mockup': (L) => <div className="pv-hp pv-a-miring"><div>{L}<Orang /></div></div>,
    checklist: (L) => <>{L}<Orang /><div className="pv-cek">{[1, 2, 3].map((i) => <span key={i} style={{ animationDelay: `${i * 0.5}s` }}>✓ langkah {i}</span>)}</div></>,
    'headline-wall': () => <><div className="pv-latar pv-headline">{['AI MENGUBAH TOKO', 'UMKM NAIK 2X', 'CARA BARU JUALAN'].map((t) => <span key={t}>{t}</span>)}</div><Orang /></>,
    'zoom-through': (L) => <div className="pv-a-tembus">{L}<Orang /><i className="pv-titik" /></div>,
    'chart-grow': (L) => <>{L}<Orang /><div className="pv-grafik">{[30, 55, 80].map((h, i) => <i key={i} style={{ ['--h' as any]: `${h}%`, animationDelay: `${i * 0.25}s` }} />)}</div></>,
    'pull-back': (L) => <div className="pv-a-mundur">{L}<Orang /></div>,
    'green-screen': () => <><div className="pv-latar pv-a-ganti" /><Orang /></>,
    'paper-cut': () => <><div className="pv-latar pv-kertas-lapis"><i /><i /><i /></div><Orang /></>,
    'doodle-boil': (L) => <>{L}<Orang /><svg viewBox="0 0 60 107" className="pv-coret pv-a-didih"><path d="M10 40 q-6 -14 6 -22 M50 40 q6 -14 -6 -22 M14 70 l-6 4 M46 70 l6 4 M30 8 l0 -6" stroke="#ffd23f" strokeWidth="2" fill="none" strokeLinecap="round" /></svg></>,
    vertigo: (L) => <><div className="pv-a-vertigo">{L}</div><Orang /></>,
    'cover-story': (L) => <>{L}<Orang /><div className="pv-majalah"><b>KONTEN</b><span>edisi spesial</span></div></>,
    'glass-type': (L) => <>{L}<Orang /><span className="pv-kaca-teks">AI</span></>
};
export function PratinjauEfek({ id }: { id: string }) {
    const L = <div className="pv-latar"><Ruangan merah={false} /></div>;
    const f = EFEK[id];
    return <div className="pv-efek" aria-hidden="true">{f ? f(L) : <>{L}<Orang /></>}</div>;
}

/* ── Galeri pemilih (dipakai di editor, tab Gaya, dan kuis) ── */
export function GaleriPilih({ jenis, daftar, pilih, onPilih, banyak, maks = 6, gambar }: { jenis: 'efek' | 'grade' | 'gaya'; daftar: Array<ItemPilih & { jenisGaya?: string }>; pilih: string[]; onPilih: (id: string) => void; banyak?: boolean; maks?: number; gambar?: Record<string, string> }) {
    return (
        <div className={`pv-galeri pv-g-${jenis}`} role={banyak ? 'group' : 'radiogroup'}>
            {daftar.map((it) => {
                const on = pilih.includes(it.id);
                return (
                    <button key={it.id} type="button" className={`pv-item ${on ? 'on' : ''}`} aria-pressed={banyak ? on : undefined} role={banyak ? undefined : 'radio'} aria-checked={banyak ? undefined : on}
                        disabled={banyak && !on && pilih.length >= maks} onClick={() => onPilih(it.id)} title={it.ket}>
                        {jenis === 'efek' ? <PratinjauEfek id={it.id} /> : jenis === 'grade' ? <PratinjauGrade id={it.id} /> : <PratinjauGaya id={it.id} gambar={gambar?.[it.id]} />}
                        <span className="pv-nama">{it.diSkill ? '⭐ ' : ''}{it.nama}{it.jenisGaya && <small>{it.jenisGaya}</small>}</span>
                        <span className="pv-ket">{it.ket}</span>
                        {on && <span className="pv-cek-on" aria-hidden="true">✓</span>}
                    </button>
                );
            })}
        </div>
    );
}
