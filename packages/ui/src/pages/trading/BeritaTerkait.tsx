import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { useInterval } from '../../kantor/aktif';
import { FunnelBerita, bagian, type Related, type Fokus } from './FunnelBerita';
import { Info as InfoI } from './InfoI';
import { DaftarRelated } from './DaftarRelated';

type Dampak = { jenis: 'sektor' | 'industri' | 'saham'; nama: string; arah: number; alasan: string };
type Tema = { judul: string; ringkas: string; bukti: string[]; dampak: Dampak[] };
interface Data { data: { at: number; oleh: string; tema: Tema[]; berita: Array<{ id: string; t: string; sumber: string; tgl: string; url: string; topik: string }>; galat?: string } | null; atur: { aktif: boolean; porsi: number }; sibuk: boolean }
const waktu = (t: number) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/** Berita terkait: berita dunia yang tidak menyebut sahamnya tapi bisa berefek domino. Dipetakan Nina; bisa dimatikan & diatur porsinya. */
export function BeritaTerkaitKartu({ onUbah }: { onUbah?: () => void }) {
    const d = useApi<Data>('/api/kantor/berita-terkait', 0);
    const peta = useApi<{ related: Related | null; pantau: string[] }>('/api/kantor/peta-berita', 600_000);
    const [fokus, setFokus] = useState<Fokus | null>(null);
    const [semuaBagian, setSemuaBagian] = useState(false);
    const [msg, setMsg] = useState('');
    useInterval(() => { d.reload(); if (!d.data?.sibuk) peta.reload(); }, d.data?.sibuk ? 5000 : null);
    const atur = d.data?.atur, x = d.data?.data, r = peta.data?.related;
    const set = (v: Partial<{ aktif: boolean; porsi: number }>) => apiPost('/api/kantor/berita-terkait/atur', v).then(() => { d.reload(); peta.reload(); onUbah?.(); }).catch((e) => setMsg(String(e.message || e)));
    if (!d.data) return null;
    const sek = r ? bagian(r, peta.data?.pantau || []) : [];
    const tampil = semuaBagian ? sek : sek.slice(0, 12);
    return (
        <section className="sb-card bt">
            <div className="bt-h">
                <div>
                    <h3>🌍 News related <InfoI teks="Berita dunia yang TIDAK menyebut sahamnya langsung (suku bunga, minyak, tarif, perang, aturan chip, dll.), tapi diperkirakan merembet ke sektor/industri/saham lewat efek domino. Dipetakan oleh Nina. Kebalikannya: News direct = berita yang memang menyebut saham itu." /></h3>
                    <p className="sb-note">Alurnya seperti corong: semua berita dunia dipindai → berita yang sama dari banyak media digabung jadi satu info → info itu dipetakan dampaknya. Ketuk sebuah bagian (mis. <b>AMZN positif</b>) untuk melihat alasannya.</p>
                </div>
                <label className="bt-saklar"><input type="checkbox" checked={!!atur?.aktif} onChange={(e) => set({ aktif: e.target.checked })} /><span>{atur?.aktif ? 'Aktif' : 'Mati'}</span></label>
            </div>
            {atur?.aktif && (
                <div className="bt-porsi">
                    <span>Porsi di faktor Berita</span>
                    <input type="range" min={0} max={70} step={5} defaultValue={Math.round(atur.porsi * 100)} key={atur.porsi} onPointerUp={(e) => set({ porsi: +(e.target as HTMLInputElement).value / 100 })} onKeyUp={(e) => set({ porsi: +(e.target as HTMLInputElement).value / 100 })} aria-label="Porsi news related" />
                    <b className="mono">direct {100 - Math.round(atur.porsi * 100)}% · related {Math.round(atur.porsi * 100)}%</b>
                </div>
            )}
            <div className="bt-meta">
                {x ? <span>Dipetakan <b>{x.oleh}</b> · {waktu(x.at)} · dari {x.berita.length} judul berita dunia</span> : <span>Belum pernah dipetakan.</span>}
                <button className="btn small" disabled={d.data.sibuk} onClick={() => apiPost('/api/kantor/berita-terkait/perbarui', {}).then(() => { setMsg('Nina sedang memetakan — lihat Kantor → Papan kerja.'); d.reload(); }).catch((e) => setMsg(String(e.message || e)))}>{d.data.sibuk ? 'Sedang memetakan…' : '↻ Petakan ulang'}</button>
            </div>
            {msg && <div className="fin-alert">{msg}</div>}
            {x?.galat && <div className="error">Pembaruan terakhir gagal: {x.galat}</div>}
            {atur?.aktif && r && (
                <>
                    <div className="fb-bagian">
                        <button className={!fokus ? 'on' : ''} onClick={() => setFokus(null)}>Semua</button>
                        {tampil.map((b) => (
                            <button key={`${b.f.nama}|${b.f.arah}`} className={`${b.f.arah > 0 ? 'pos' : 'neg'} ${fokus?.nama === b.f.nama && fokus.arah === b.f.arah ? 'on' : ''}`} onClick={() => setFokus(b.f)}>
                                <b>{b.f.arah > 0 ? '▲' : '▼'} {b.f.nama}</b><small>{b.f.arah > 0 ? 'positif' : 'negatif'} · {b.info.size} info · {b.artikel.size} berita</small>
                            </button>
                        ))}
                        {sek.length > 12 && <button onClick={() => setSemuaBagian(!semuaBagian)}>{semuaBagian ? 'Ringkas' : `+${sek.length - 12} lainnya`}</button>}
                    </div>
                    <FunnelBerita key={fokus ? `${fokus.nama}|${fokus.arah}` : 'semua'} r={r} fokus={fokus} />
                </>
            )}
            {atur?.aktif && <DaftarRelated />}
            <p className="sb-note">Peta dampak adalah <b>penilaian AI atas judul berita</b>: bisa salah, dan belum bisa diuji mundur. Diperbarui otomatis ±sekali sehari. Kalau ragu, matikan saklarnya — skor Berita kembali hanya dari news direct.</p>
        </section>
    );
}
