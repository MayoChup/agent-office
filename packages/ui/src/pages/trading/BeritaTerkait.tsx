import React, { useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { useInterval } from '../../kantor/aktif';

type Dampak = { jenis: 'sektor' | 'industri' | 'saham'; nama: string; arah: number; alasan: string };
type Tema = { judul: string; ringkas: string; bukti: string[]; dampak: Dampak[] };
interface Data { data: { at: number; oleh: string; tema: Tema[]; berita: Array<{ id: string; t: string; sumber: string; tgl: string; url: string; topik: string }>; galat?: string } | null; atur: { aktif: boolean; porsi: number }; sibuk: boolean }
const waktu = (t: number) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const ARAH: Record<string, string> = { '2': '▲▲', '1': '▲', '-1': '▼', '-2': '▼▼' };

/** Berita terkait: berita dunia yang tidak menyebut sahamnya tapi bisa berefek domino. Dipetakan Nina; bisa dimatikan & diatur porsinya. */
export function BeritaTerkaitKartu({ onUbah }: { onUbah?: () => void }) {
    const d = useApi<Data>('/api/kantor/berita-terkait', 0);
    const [buka, setBuka] = useState<number | null>(0);
    const [msg, setMsg] = useState('');
    useInterval(() => d.reload(), d.data?.sibuk ? 5000 : null);
    const atur = d.data?.atur, x = d.data?.data;
    const set = (v: Partial<{ aktif: boolean; porsi: number }>) => apiPost('/api/kantor/berita-terkait/atur', v).then(() => { d.reload(); onUbah?.(); }).catch((e) => setMsg(String(e.message || e)));
    if (!d.data) return null;
    const bk = new Map((x?.berita || []).map((b) => [b.id, b]));
    return (
        <section className="sb-card bt">
            <div className="bt-h">
                <div>
                    <h3>🌍 Berita terkait <small>efek domino dari berita dunia</small></h3>
                    <p className="sb-note">Bukan berita yang menyebut sahamnya, tapi kejadian global (suku bunga, minyak, tarif, perang, aturan) yang bisa merembet. Dipisah dari <b>berita langsung</b>; keduanya digabung jadi faktor Berita.</p>
                </div>
                <label className="bt-saklar"><input type="checkbox" checked={!!atur?.aktif} onChange={(e) => set({ aktif: e.target.checked })} /><span>{atur?.aktif ? 'Aktif' : 'Mati'}</span></label>
            </div>
            {atur?.aktif && (
                <div className="bt-porsi">
                    <span>Porsi di faktor Berita</span>
                    <input type="range" min={0} max={70} step={5} defaultValue={Math.round(atur.porsi * 100)} key={atur.porsi} onPointerUp={(e) => set({ porsi: +(e.target as HTMLInputElement).value / 100 })} onKeyUp={(e) => set({ porsi: +(e.target as HTMLInputElement).value / 100 })} aria-label="Porsi berita terkait" />
                    <b className="mono">langsung {100 - Math.round(atur.porsi * 100)}% · terkait {Math.round(atur.porsi * 100)}%</b>
                </div>
            )}
            <div className="bt-meta">
                {x ? <span>Dipetakan <b>{x.oleh}</b> · {waktu(x.at)} · dari {x.berita.length} judul berita dunia</span> : <span>Belum pernah dipetakan.</span>}
                <button className="btn small" disabled={d.data.sibuk} onClick={() => apiPost('/api/kantor/berita-terkait/perbarui', {}).then(() => { setMsg('Sedang dikerjakan — lihat Kantor → Papan kerja.'); d.reload(); }).catch((e) => setMsg(String(e.message || e)))}>{d.data.sibuk ? 'Sedang memetakan…' : '↻ Petakan ulang'}</button>
            </div>
            {msg && <div className="fin-alert">{msg}</div>}
            {x?.galat && <div className="error">Pembaruan terakhir gagal: {x.galat}</div>}
            {atur?.aktif && x?.tema.map((t, i) => (
                <div key={i} className={`bt-tema ${buka === i ? 'buka' : ''}`}>
                    <button className="bt-tema-h" onClick={() => setBuka(buka === i ? null : i)} aria-expanded={buka === i}>
                        <b>{t.judul}</b>
                        <span className="bt-chip-baris">{t.dampak.slice(0, 4).map((dm, k) => <i key={k} className={dm.arah > 0 ? 'up' : 'down'}>{ARAH[String(dm.arah)]} {dm.nama}</i>)}{t.dampak.length > 4 && <i>+{t.dampak.length - 4}</i>}</span>
                    </button>
                    {buka === i && (
                        <div className="bt-isi">
                            {t.ringkas && <p>{t.ringkas}</p>}
                            <table className="um-t"><thead><tr><th>Terdampak</th><th>Arah</th><th>Rantai sebab-akibat</th></tr></thead>
                                <tbody>{t.dampak.map((dm, k) => <tr key={k}><td><b>{dm.nama}</b> <small>{dm.jenis}</small></td><td className={`mono ${dm.arah > 0 ? 'up' : 'down'}`}>{ARAH[String(dm.arah)]}</td><td>{dm.alasan}</td></tr>)}</tbody></table>
                            <div className="bt-bukti"><small>Judul berita yang jadi dasar:</small>{t.bukti.map((id) => { const b = bk.get(id); return b ? <a key={id} href={b.url} target="_blank" rel="noreferrer">{b.t} <em>{b.sumber} · {b.tgl}</em></a> : null; })}</div>
                        </div>
                    )}
                </div>
            ))}
            <p className="sb-note">Peta dampak adalah <b>penilaian AI atas judul berita</b>: bisa salah, dan belum bisa diuji mundur. Diperbarui otomatis ±sekali sehari. Kalau ragu, matikan saklarnya — skor Berita kembali hanya dari berita langsung.</p>
        </section>
    );
}
