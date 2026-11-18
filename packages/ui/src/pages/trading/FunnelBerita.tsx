import React, { useMemo, useState } from 'react';

/* Data News related dari server (screener.petaRelated). */
export interface Artikel { id: string; t: string; sumber: string; tgl: string; url: string; topik: string }
export interface DampakR { jenis: 'sektor' | 'industri' | 'saham'; nama: string; arah: number; alasan: string; saham: string[] }
export interface Info { id: string; judul: string; ringkas: string; bukti: string[]; dampak: DampakR[] }
export interface Related { at: number; oleh: string; artikel: Artikel[]; info: Info[]; meta: Record<string, { nama: string; chg: number; sektor: string; industri: string }> }
/** Fokus funnel: satu saham/sektor/industri + arah (1 = positif, -1 = negatif). */
export interface Fokus { nama: string; arah: 1 | -1 }

export const cocok = (d: DampakR, f: Fokus) => Math.sign(d.arah) === f.arah && (d.nama === f.nama || d.saham.includes(f.nama));
const ARAH: Record<string, string> = { '2': '▲▲', '1': '▲', '-1': '▼', '-2': '▼▼' };
const tanggal = (s: string) => { const d = new Date(s); return Number.isNaN(+d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };

/** Bagian-bagian funnel: tiap saham/sektor/industri yang kena dampak, dipisah positif & negatif. */
export function bagian(r: Related, pantau: string[]) {
    const m = new Map<string, { f: Fokus; jenis: string; info: Set<string>; artikel: Set<string> }>();
    const tambah = (nama: string, jenis: string, arah: number, i: Info) => {
        const f: Fokus = { nama, arah: arah > 0 ? 1 : -1 }; const k = `${nama}|${f.arah}`;
        const e = m.get(k) || { f, jenis, info: new Set(), artikel: new Set() };
        e.info.add(i.id); i.bukti.forEach((b) => e.artikel.add(b)); m.set(k, e);
    };
    for (const i of r.info) for (const d of i.dampak) {
        tambah(d.nama, d.jenis, d.arah, i);
        if (d.jenis !== 'saham') for (const s of d.saham) if (pantau.includes(s)) tambah(s, 'saham', d.arah, i);
    }
    return [...m.values()].sort((a, b) => b.info.size - a.info.size || b.artikel.size - a.artikel.size);
}

type Pilih = { jenis: 'artikel' | 'info' | 'dampak'; id: string } | null;

/** Funnel horizontal bertema luar angkasa: semua berita dipindai → info unik → dampak. Tidak bisa digeser; titik bisa diklik. */
export function FunnelBerita({ r, fokus }: { r: Related; fokus?: Fokus | null }) {
    const [pilih, setPilih] = useState<Pilih>(null);
    const susun = useMemo(() => {
        const infoRel = r.info.filter((i) => !fokus || i.dampak.some((d) => cocok(d, fokus)));
        const relInfo = new Set(infoRel.map((i) => i.id));
        const relArt = new Set(infoRel.flatMap((i) => i.bukti));
        // Dampak: digabung per nama+arah. Dengan fokus: hanya dampak yang cocok (plus dampak lain dari info yang sama, diredupkan).
        const dm = new Map<string, { id: string; nama: string; jenis: string; arah: number; alasan: string[]; info: string[]; utama: boolean }>();
        for (const i of infoRel) for (const d of i.dampak) {
            const k = `${d.nama}|${Math.sign(d.arah)}`;
            const e = dm.get(k) || { id: k, nama: d.nama, jenis: d.jenis, arah: d.arah, alasan: [], info: [], utama: !fokus };
            e.info.push(i.id); e.alasan.push(d.alasan); if (Math.abs(d.arah) > Math.abs(e.arah)) e.arah = d.arah;
            if (fokus && cocok(d, fokus)) e.utama = true;
            dm.set(k, e);
        }
        const dampak = [...dm.values()].sort((a, b) => Number(b.utama) - Number(a.utama) || b.info.length - a.info.length).slice(0, fokus ? 10 : 16);
        const lebih = dm.size - dampak.length;
        return { infoRel, relInfo, relArt, dampak, lebih };
    }, [r, fokus]);

    // Tata letak (viewBox 1000 × 360)
    const H = 360, art = r.artikel, kol = 9, baris = Math.ceil(art.length / kol) || 1;
    const posArt = new Map<string, { x: number; y: number }>(art.map((a, i) => { const c = i % kol, b = Math.floor(i / kol); return [a.id, { x: 40 + c * 30 + (b % 2) * 12, y: H / 2 - ((baris - 1) * 24) / 2 + b * 24 }] as [string, { x: number; y: number }]; }));
    const info = r.info;
    const posInfo = new Map<string, { x: number; y: number }>(info.map((x, i): [string, { x: number; y: number }] => [x.id, { x: 500, y: H / 2 - ((info.length - 1) * Math.min(26, 260 / Math.max(1, info.length))) / 2 + i * Math.min(26, 260 / Math.max(1, info.length)) }]));
    const dmp = susun.dampak, langkah = Math.min(30, 290 / Math.max(1, dmp.length));
    const posDmp = new Map<string, { x: number; y: number }>(dmp.map((d, i): [string, { x: number; y: number }] => [d.id, { x: 760, y: H / 2 - ((dmp.length - 1) * langkah) / 2 + i * langkah }]));
    const bintang = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ x: (i * 137.5) % 1000, y: (i * 89.3) % H, r: (i % 5) * 0.25 + 0.4 })), []);
    const fokusPilih = pilih?.jenis === 'artikel' ? new Set(info.filter((i) => i.bukti.includes(pilih.id)).map((i) => i.id)) : pilih?.jenis === 'info' ? new Set([pilih.id]) : pilih?.jenis === 'dampak' ? new Set(dmp.find((d) => d.id === pilih.id)?.info || []) : null;
    const terang = (infoId: string) => susun.relInfo.has(infoId) && (!fokusPilih || fokusPilih.has(infoId));
    const kurva = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
    const tombol = (jenis: 'artikel' | 'info' | 'dampak', id: string, label: string) => ({ role: 'button', tabIndex: 0, 'aria-label': label, onClick: () => setPilih(pilih?.id === id ? null : { jenis, id }), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPilih({ jenis, id }); } } });

    const artPilih = pilih?.jenis === 'artikel' ? art.find((a) => a.id === pilih.id) : null;
    const infoPilih = pilih?.jenis === 'info' ? info.find((i) => i.id === pilih.id) : null;
    const dmpPilih = pilih?.jenis === 'dampak' ? dmp.find((d) => d.id === pilih.id) : null;
    const artMap = new Map(art.map((a) => [a.id, a]));

    return (
        <div className="fb">
            <div className="fb-tahap">
                <span><b>{art.length}</b> berita dipindai</span>
                <span><b>{susun.infoRel.length}</b> info unik{fokus ? ` soal ${fokus.nama}` : ''} <small>(dari {susun.relArt.size} berita)</small></span>
                <span><b>{dmp.length}</b> dampak{susun.lebih > 0 ? ` (+${susun.lebih})` : ''}</span>
            </div>
            <svg viewBox={`0 0 1000 ${H}`} className="fb-svg" role="img" aria-label="Funnel berita: berita dipindai, info unik, dampak ke saham">
                <defs>
                    <linearGradient id="fb-neb" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#7c3aed" stopOpacity="0.32" /><stop offset="0.55" stopColor="#2563eb" stopOpacity="0.22" /><stop offset="1" stopColor="#0ea5e9" stopOpacity="0.16" /></linearGradient>
                    <radialGradient id="fb-glow"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
                </defs>
                <rect width="1000" height={H} fill="#070a14" />
                {bintang.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#fff" opacity={0.35} />)}
                <path d={`M0,8 C250,20 380,70 560,110 C700,140 820,150 1000,152 L1000,${H - 152} C820,${H - 150} 700,${H - 140} 560,${H - 110} C380,${H - 70} 250,${H - 20} 0,${H - 8} Z`} fill="url(#fb-neb)" />
                {/* Garis artikel → info */}
                {info.map((i) => i.bukti.map((b) => { const a = posArt.get(b), z = posInfo.get(i.id); if (!a || !z) return null; const on = terang(i.id);
                    return <path key={`${b}-${i.id}`} d={kurva(a, z)} fill="none" stroke={on ? '#facc15' : '#64748b'} strokeOpacity={on ? 0.55 : 0.08} strokeWidth={on ? 1.1 : 0.6} />; }))}
                {/* Garis info → dampak */}
                {dmp.map((d) => d.info.map((iid) => { const a = posInfo.get(iid), z = posDmp.get(d.id); if (!a || !z) return null; const on = terang(iid) && d.utama;
                    return <path key={`${iid}-${d.id}`} d={kurva(a, z)} fill="none" stroke={d.arah > 0 ? '#4ade80' : '#f87171'} strokeOpacity={on ? 0.7 : 0.12} strokeWidth={on ? 1.4 : 0.7} />; }))}
                {/* Titik artikel */}
                {art.map((a) => { const p = posArt.get(a.id)!; const rel = susun.relArt.has(a.id); const on = pilih?.id === a.id;
                    return (
                        <g key={a.id} className="fb-titik" {...tombol('artikel', a.id, a.t)}>
                            {rel && <circle cx={p.x} cy={p.y} r={9} fill="url(#fb-glow)" opacity={0.35} />}
                            <circle cx={p.x} cy={p.y} r={on ? 6 : rel ? 4.2 : 2.6} fill={rel ? '#facc15' : '#475569'} stroke={on ? '#fff' : 'none'} strokeWidth={1.5} />
                            <title>{a.t} — {a.sumber}</title>
                        </g>
                    );
                })}
                {/* Titik info */}
                {info.map((i) => { const p = posInfo.get(i.id)!; const rel = susun.relInfo.has(i.id); const on = pilih?.id === i.id;
                    return (
                        <g key={i.id} className="fb-titik" {...tombol('info', i.id, i.judul)}>
                            {rel && <circle cx={p.x} cy={p.y} r={16} fill="url(#fb-glow)" opacity={0.3} />}
                            <circle cx={p.x} cy={p.y} r={on ? 9 : rel ? 7 : 4} fill={rel ? '#38bdf8' : '#334155'} stroke={on ? '#fff' : 'none'} strokeWidth={1.5} />
                            {rel && <text x={p.x + 14} y={p.y + 4} className="fb-lbl">{i.judul.length > 26 ? `${i.judul.slice(0, 25)}…` : i.judul}</text>}
                            <title>{i.judul} · {i.bukti.length} berita</title>
                        </g>
                    );
                })}
                {/* Titik dampak */}
                {dmp.map((d) => { const p = posDmp.get(d.id)!; const on = pilih?.id === d.id;
                    return (
                        <g key={d.id} className="fb-titik" {...tombol('dampak', d.id, `${d.nama} ${d.arah > 0 ? 'positif' : 'negatif'}`)} opacity={d.utama ? 1 : 0.4}>
                            <circle cx={p.x} cy={p.y} r={on ? 8 : 6} fill={d.arah > 0 ? '#4ade80' : '#f87171'} stroke={on ? '#fff' : 'none'} strokeWidth={1.5} />
                            <text x={p.x + 13} y={p.y + 4} className="fb-lbl kuat">{ARAH[String(d.arah)]} {d.nama.length > 22 ? `${d.nama.slice(0, 21)}…` : d.nama}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="fb-detail">
                {!pilih && <p className="fb-petunjuk">Ketuk titik kuning (berita), biru (info unik), atau hijau/merah (dampak) untuk melihat isinya. Berita yang sama dari beberapa media digabung jadi satu info.</p>}
                {artPilih && (
                    <div>
                        <small>Berita · {artPilih.sumber || 'sumber tidak diketahui'} · {tanggal(artPilih.tgl)} · {artPilih.topik}</small>
                        <b>{artPilih.t}</b>
                        {artPilih.url && <a className="btn small" href={artPilih.url} target="_blank" rel="noopener noreferrer">Buka berita ↗</a>}
                        {!susun.relArt.has(artPilih.id) && <small>Berita ini dipindai tapi tidak dipakai{fokus ? ` untuk ${fokus.nama}` : ''} (tidak dianggap berdampak).</small>}
                    </div>
                )}
                {infoPilih && (
                    <div>
                        <small>Info unik · dirangkum dari {infoPilih.bukti.length} berita</small>
                        <b>{infoPilih.judul}</b>
                        {infoPilih.ringkas && <p>{infoPilih.ringkas}</p>}
                        <ul className="fb-daftar">{infoPilih.bukti.map((id) => { const a = artMap.get(id); return a ? <li key={id}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.t}</a> <em>{a.sumber} · {tanggal(a.tgl)}</em></li> : null; })}</ul>
                        <ul className="fb-daftar">{infoPilih.dampak.map((d, k) => <li key={k} className={d.arah > 0 ? 'up' : 'down'}><b>{ARAH[String(d.arah)]} {d.nama}</b> <small>{d.jenis}</small> — {d.alasan}</li>)}</ul>
                    </div>
                )}
                {dmpPilih && (
                    <div>
                        <small>Dampak ke {dmpPilih.jenis} · {dmpPilih.arah > 0 ? 'positif' : 'negatif'} · dari {dmpPilih.info.length} info</small>
                        <b>{ARAH[String(dmpPilih.arah)]} {dmpPilih.nama}</b>
                        <ul className="fb-daftar">{dmpPilih.info.map((iid, k) => { const i = info.find((x) => x.id === iid); return i ? <li key={iid}><b>{i.judul}</b> — {dmpPilih.alasan[k]}</li> : null; })}</ul>
                    </div>
                )}
            </div>
        </div>
    );
}
