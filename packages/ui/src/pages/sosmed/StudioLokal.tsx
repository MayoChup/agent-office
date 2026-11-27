import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost, serverBase } from '../../kantor/connection';

/** Sinkron dengan Studio Video Rico (website lokal Remotion di PC Pak Rico). */
interface InfoStudio { ada: boolean; dibuat?: number; terlihat?: number; versi?: string; otomatis: boolean; tersambung: boolean; antrean: number }
interface Tahap { tahap: string; pesan?: string; at: number }
type Data = { studio: InfoStudio; status: Record<string, Tahap> };

const jam = (t?: number) => (t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const NAMA_TAHAP: Record<string, string> = { baru: 'menunggu diambil studio', diterima: 'diterima studio', disusun: 'video tersusun, menunggu dirender', dirender: 'sudah dirender', mengunggah: 'mengunggah hasil', selesai: 'video sudah masuk', gagal: 'gagal di studio', dilewati: 'tidak dikirim ke studio' };

export function KartuStudioLokal() {
    const r = useApi<Data>('/api/kantor/studio-lokal', 30_000);
    const [token, setToken] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [disalin, setDisalin] = useState(false);
    const s = r.data?.studio;
    if (!s) return null;
    const jalankan = async (url: string, body: unknown = {}) => {
        setBusy(true); setErr('');
        try { const x = await apiPost<{ token?: string }>(url, body); if (x?.token) setToken(x.token); r.reload(); } catch (e: any) { setErr(String(e.message || e)); }
        setBusy(false);
    };
    const alamat = serverBase() || (typeof location !== 'undefined' ? location.origin : '');
    const env = `KANTOR_URL=${alamat}\nKANTOR_STUDIO_TOKEN=${token}`;
    const salin = async () => { try { await navigator.clipboard.writeText(env); setDisalin(true); setTimeout(() => setDisalin(false), 2000); } catch { /* */ } };
    return (
        <section className="sb-card sl-kartu">
            <div className="ap-kepala">
                <div>
                    <h3>Studio Video lokal</h3>
                    <p className="sb-note">Studio Remotion di PC Bapak mengambil sendiri brief & aset konten video yang promptnya sudah siap, lalu mengunggah MP4 hasilnya ke sini. Video tetap menunggu Bapak menekan Setujui.</p>
                </div>
                {s.ada && <button role="switch" aria-checked={s.otomatis} aria-label="Kirim otomatis ke studio" className={`ap-saklar ${s.otomatis ? 'on' : ''}`} disabled={busy} onClick={() => jalankan('/api/kantor/studio-lokal/atur', { otomatis: !s.otomatis })}><span /></button>}
            </div>
            <div className="sl-status">
                <span className={`sl-titik ${s.tersambung ? 'on' : ''}`} aria-hidden />
                <span>{!s.ada ? 'Belum disambungkan' : s.tersambung ? `Tersambung · terakhir mengecek ${jam(s.terlihat)}` : s.terlihat ? `Tidak aktif · terakhir terlihat ${jam(s.terlihat)}` : 'Token sudah dibuat, studio belum pernah mengecek'}</span>
                {s.ada && <span className="sl-meta">{s.otomatis ? `${s.antrean} konten siap diambil` : 'Kirim otomatis dimatikan'}</span>}
            </div>
            {token && (
                <div className="sl-token">
                    <p><b>Tempel 2 baris ini ke file <code>.env</code> di folder studio</b>, lalu nyalakan ulang studio. Token hanya ditampilkan sekali ini.</p>
                    <pre>{env}</pre>
                    <div className="sm-aksi"><button className="btn small primary" onClick={salin}>{disalin ? 'Tersalin' : 'Salin'}</button><button className="btn small" onClick={() => setToken('')}>Sudah, tutup</button></div>
                </div>
            )}
            <div className="sm-aksi">
                <button className="btn small" disabled={busy} onClick={() => jalankan('/api/kantor/studio-lokal/token')}>{s.ada ? 'Buat token baru' : 'Sambungkan studio'}</button>
                {s.ada && <button className="btn small" disabled={busy} onClick={() => { if (confirm('Cabut token? Studio di PC tidak bisa mengambil konten lagi sampai diberi token baru.')) void jalankan('/api/kantor/studio-lokal/cabut'); }}>Cabut token</button>}
            </div>
            {err && <p className="fin-alert">{err}</p>}
        </section>
    );
}

/** Baris kecil di detail konten video: posisinya di studio lokal. */
export function StatusStudioLokal({ akun, kontenId, siap }: { akun: string; kontenId: string; siap: boolean }) {
    const r = useApi<Data>('/api/kantor/studio-lokal', 30_000);
    const [busy, setBusy] = useState(false);
    const s = r.data?.studio; if (!s?.ada) return null;
    const id = `${akun}:${kontenId}`, t = r.data!.status[id];
    if (!t && !siap) return null;
    const tahap = t?.tahap || 'baru';
    const aksi = async (a: string) => { setBusy(true); try { await apiPost(`/api/kantor/studio-lokal/konten/${encodeURIComponent(id)}/${a}`, {}); r.reload(); } catch { /* */ } setBusy(false); };
    return (
        <div className={`sl-baris ${tahap}`}>
            <span className={`sl-titik ${tahap === 'gagal' ? 'gagal' : tahap === 'selesai' ? 'on' : ''}`} aria-hidden />
            <span>Studio lokal: {NAMA_TAHAP[tahap] || tahap}{t?.at ? ` · ${jam(t.at)}` : ''}{t?.pesan ? ` · ${t.pesan}` : ''}</span>
            {tahap === 'dilewati' || tahap === 'gagal'
                ? <button className="btn small" disabled={busy} onClick={() => aksi('kirim-ulang')}>Kirim ulang</button>
                : tahap === 'baru' && <button className="btn small" disabled={busy} onClick={() => aksi('lewati')}>Jangan kirim</button>}
        </div>
    );
}
