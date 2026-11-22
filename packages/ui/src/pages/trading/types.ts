export type Label = 'Jual kuat' | 'Jual' | 'Tahan' | 'Beli' | 'Beli kuat';
export type FaktorKey = 'semua' | 'teknikal' | 'fundamental' | 'berita' | 'whales';
export interface SkorRingkas { skor: number; label: Label; /** data yang belum siap (hanya skor gabungan) */ kurang?: string[]; /** label sebelum ditahan */ asli?: Label; /** skor sebelum ditahan */ skorAsli?: number; /** skor dinaikkan karena pantul terbukti */ pantul?: boolean }
/** "Fundamental kuat · lagi diskon" (lihat server kantor/diskon.ts). */
export type Tahap = 'pantau' | 'zona' | 'balik';
export interface DiskonB { tahap: Tahap; jenis?: 'koreksi' | 'diskon'; dariPuncak: number; alasan: string[] }
export interface AmbilUntungB { tahap: Tahap; diAtasMa50: number; alasan: string[] }
export interface RaporTanding { bulan: number; berisi: number; total: number; perBulan: number; winrate: number; pf: number | null; ddMaks: number; vsSpyPerBulan: number; unggulTerbukti: boolean }
export interface UjiAkum { n: number; rataEx: number | null; menang: number | null; galatStd: number | null }
export interface Target { nama: 'Konservatif' | 'Moderat' | 'Agresif'; harga: number; pct: number; peluang: number; nilai: number }
export interface Proyeksi { horizon: number; target: Target[]; stop: { harga: number; pct: number; peluang: number }; peluangNaik: number; terbaik: Target['nama']; rr: number }
export interface Ekstra { spark: number[]; mom: { w1: number; m1: number; m3: number }; atr: number; cmf: number; obv: number; trenLabel: string; proyeksi: Proyeksi | null }
export interface F { roe: number | null; roa: number | null; pbv: number | null; per: number | null; der: number | null; npm: number | null; revGrowth: number | null; mcap: number | null; tahun: string }
export interface Sinyal {
    goldenCross: number | null; deathCross: number | null; doubleTop: string | null; doubleBottom: string | null;
    breakout52: boolean; dekat52Low: boolean; rsiOversold: boolean; rsiOverbought: boolean; macdBullish: number | null; macdBearish: number | null;
    diAtasMa200: boolean; volumeSpike: boolean; tren: 'naik' | 'turun' | 'datar';
    macdAtas?: boolean | null; macdHari?: number | null; hi52?: number | null; lo52?: number | null;
}
export interface Baris {
    s: string; nama: string; sektor: string; harga: number; chg1d: number; chg1m: number; chg3m: number; chg1y: number;
    rsi: number | null; ma50: number | null; ma200: number | null; volX: number; vol?: number; sinyal: Sinyal; f: F | null; x?: Ekstra;
    industri?: string; mcap?: number | null;
    skor?: Record<FaktorKey, SkorRingkas | null>;
    diskon?: DiskonB | null;
    ambilUntung?: AmbilUntungB | null;
    luar?: string;
}
export const kapOf = (b: { mcap?: number | null; f: { mcap: number | null } | null }) => b.mcap ?? b.f?.mcap ?? null;
export interface Pasar { naik: number; turun: number; tetap: number; mcap: number; sektor: Array<{ nama: string; n: number; chg: number }>; tape: Array<{ s: string; nama: string; harga: number; chg: number }> }
export interface ScreenerData { diskonUji?: { at: number; H: Record<string, Record<string, UjiAkum>>; tanding?: Record<'arusNaik' | 'arusTurun' | 'pantulNaik' | 'pantulTurun' | 'spy', RaporTanding | null> | null; fundInfo?: { ada: boolean; sampel: number; catatan: string } | null } | null; ditahan?: { n: number; per: Record<string, number> }; baris: Baris[]; pasar: Pasar; teknikalAt: number; teknikalSesi: string; fundamentalAt: number; beritaAt: number; sibuk: string; progres: string; gagal: number; galat?: string; sumber?: string }

export const LABELS: Label[] = ['Beli kuat', 'Beli', 'Tahan', 'Jual', 'Jual kuat'];
export const FAKTOR: Array<{ k: FaktorKey; label: string; ico: string; info: string }> = [
    { k: 'semua', label: 'Semua', ico: '◎', info: 'Gabungan semua faktor — bobotnya mengikuti rencana pegang posisi di atas.' },
    { k: 'teknikal', label: 'Teknikal', ico: '📈', info: 'Tren, MA50/MA200, golden/death cross, MACD, RSI, double top/bottom, breakout.' },
    { k: 'fundamental', label: 'Fundamental', ico: '🏦', info: 'ROE, PER, PBV, utang, margin, pertumbuhan pendapatan (laporan SEC).' },
    { k: 'berita', label: 'Berita', ico: '📰', info: 'Sentimen judul berita 7 hari terakhir.' },
    { k: 'whales', label: 'Whales', ico: '🐋', info: 'Aliran dana besar (CMF, OBV, volume), pembelian orang dalam (Form 4), laporan Smart Money Sari.' }
];
export const kelas = (l?: Label | string | null) => (l ? `lb-${l.toLowerCase().replace(' ', '-')}` : 'lb-none');
export const usd = (n: number | null | undefined, d = 2) => (n == null ? '–' : `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const persen = (n: number | null | undefined, d = 2) => (n == null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`);
export const kap = (jt: number | null | undefined) => (jt == null ? '–' : jt >= 1e6 ? `$${(jt / 1e6).toFixed(2)} T` : jt >= 1e3 ? `$${(jt / 1e3).toFixed(1)} M` : `$${jt} jt`);
export const vol = (v?: number) => (v == null ? '–' : v >= 1e9 ? `${(v / 1e9).toFixed(1)} M` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} jt` : v >= 1e3 ? `${(v / 1e3).toFixed(0)} rb` : String(v));
export const skorBar = (s: number) => Math.round((s + 1) * 50); // −1..1 → 0..100
