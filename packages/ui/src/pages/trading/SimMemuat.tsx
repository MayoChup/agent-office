import React, { useEffect, useState } from 'react';

const TAHAP = ['Mengambil riwayat harga…', 'Membaca pola candlestick…', 'Kronos menebak hari demi hari…', 'Menggambar jalur-jalur kemungkinan…', 'Merangkum peluang naik dan turun…'];
// Riwayat tiruan (hanya hiasan saat menunggu) + kipas jalur prediksi yang digambar berulang.
const RIWAYAT = 'M0,118 L14,112 28,121 42,104 56,109 70,92 84,99 98,84 112,90 126,73 140,80 154,66 168,74 182,61 196,68 210,58';
const JALUR = [
    'M210,58 C240,50 262,30 292,34 S340,14 380,10', 'M210,58 C236,56 258,44 290,48 S342,34 380,30', 'M210,58 C238,62 262,52 292,60 S344,50 380,52',
    'M210,58 C240,66 264,70 294,74 S342,72 380,78', 'M210,58 C236,72 262,84 292,90 S344,98 380,104', 'M210,58 C240,78 260,98 292,108 S344,120 380,128'
];

/** Kerangka grafik beranimasi saat prediksi dihitung. Tanpa animasi bila perangkat meminta gerak dikurangi. */
export function SimMemuat({ simbol }: { simbol: string }) {
    const [i, setI] = useState(0);
    const [detik, setDetik] = useState(0);
    useEffect(() => { const a = setInterval(() => setI((n) => Math.min(TAHAP.length - 1, n + 1)), 6000); const b = setInterval(() => setDetik((n) => n + 1), 1000); return () => { clearInterval(a); clearInterval(b); }; }, []);
    return (
        <div className="simm" role="status" aria-live="polite">
            <svg viewBox="0 0 390 140" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <linearGradient id="simm-g" x1="0" x2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
                    <linearGradient id="simm-a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".22" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient>
                </defs>
                {[28, 56, 84, 112].map((y) => <line key={y} x1="0" x2="390" y1={y} y2={y} className="simm-grid" />)}
                <line x1="210" x2="210" y1="4" y2="136" className="simm-kini" />
                <path d={`${RIWAYAT} L210,140 L0,140 Z`} fill="url(#simm-a)" />
                <path d={RIWAYAT} className="simm-riwayat" pathLength={1} />
                {JALUR.map((d, n) => <path key={n} d={d} className="simm-jalur" pathLength={1} style={{ animationDelay: `${n * 0.28}s` }} />)}
                <circle cx="210" cy="58" r="4" className="simm-titik" />
                <circle cx="210" cy="58" r="4" className="simm-denyut" />
            </svg>
            <div className="simm-ket"><b>{TAHAP[i]}</b><small>{simbol} · {detik} dtk{detik > 20 ? ' · pertama kali dibuka bisa ½–2 menit' : ''}</small></div>
        </div>
    );
}
