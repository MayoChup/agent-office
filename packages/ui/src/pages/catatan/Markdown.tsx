import React, { useEffect, useState } from 'react';
import { apiBlob } from '../../kantor/connection';

import { Ikon } from '../../components/Ikon';
/** Gambar dari vault (butuh login) → URL blob. */
export function GambarVault({ path, alt, onClick }: { path: string; alt?: string; onClick?: () => void }) {
    const [url, setUrl] = useState('');
    const [err, setErr] = useState(false);
    useEffect(() => {
        let u = ''; let alive = true;
        apiBlob(`/api/kantor/catatan/berkas?p=${encodeURIComponent(path)}&t=${Date.now()}`).then((b) => { if (alive) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => alive && setErr(true));
        return () => { alive = false; if (u) URL.revokeObjectURL(u); };
    }, [path]);
    if (err) return <span className="md-imgerr"><Ikon e="🖼" /> {path.split('/').pop()} tidak ditemukan</span>;
    return url ? <img className={`md-img ${onClick ? 'can' : ''}`} src={url} alt={alt || ''} onClick={onClick} title={onClick ? 'Ketuk untuk mengedit gambar' : undefined} /> : <span className="md-imgload">memuat gambar…</span>;
}

interface Props { teks: string; folder: string; cariFile: (nama: string) => string | null; bukaHalaman: (path: string) => void; centang: (baris: number) => void; editGambar: (path: string) => void }

/** Markdown ala Obsidian (judul, daftar, ceklis, kutipan, kode, tautan, [[wikilink]], ![[gambar]]). */
export function Markdown({ teks, folder, cariFile, bukaHalaman, centang, editGambar }: Props) {
    const lines = teks.split('\n');
    const out: React.ReactNode[] = [];
    let i = 0;
    const gbr = (nama: string) => cariFile(nama) || [folder, nama].filter(Boolean).join('/');
    const inline = (s: string, key: string): React.ReactNode[] => {
        const res: React.ReactNode[] = [];
        const re = /(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)|\[\[[^\]]+\]\]|\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*|==[^=]+==|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|~~[^~]+~~|https?:\/\/[^\s)]+)/g;
        let last = 0, m: RegExpExecArray | null, n = 0;
        while ((m = re.exec(s))) {
            if (m.index > last) res.push(s.slice(last, m.index));
            const t = m[0], k = `${key}-${n++}`;
            if (t.startsWith('![[')) { const nama = t.slice(3, -2).split('|')[0]; const p = gbr(nama); res.push(<GambarVault key={k} path={p} onClick={/\.svg$/i.test(p) ? () => editGambar(p) : undefined} />); }
            else if (t.startsWith('![')) { const mm = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)!; res.push(/^https?:/.test(mm[2]) ? <img key={k} className="md-img" src={mm[2]} alt={mm[1]} /> : <GambarVault key={k} path={gbr(decodeURIComponent(mm[2]))} alt={mm[1]} />); }
            else if (t.startsWith('[[')) { const [target, label] = t.slice(2, -2).split('|'); const p = cariFile(`${target}.md`) || cariFile(target); res.push(<a key={k} className={`md-wiki ${p ? '' : 'kosong'}`} onClick={() => p && bukaHalaman(p)}>{label || target}</a>); }
            else if (t.startsWith('[')) { const mm = t.match(/^\[([^\]]+)\]\((.+)\)$/)!; res.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>); }
            else if (t.startsWith('**')) res.push(<b key={k}>{inline(t.slice(2, -2), k)}</b>);
            else if (t.startsWith('==')) res.push(<mark key={k}>{t.slice(2, -2)}</mark>);
            else if (t.startsWith('`')) res.push(<code key={k}>{t.slice(1, -1)}</code>);
            else if (t.startsWith('~~')) res.push(<s key={k}>{t.slice(2, -2)}</s>);
            else if (t.startsWith('*') || t.startsWith('_')) res.push(<i key={k}>{t.slice(1, -1)}</i>);
            else res.push(<a key={k} href={t} target="_blank" rel="noreferrer">{t.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50)}</a>);
            last = m.index + t.length;
        }
        if (last < s.length) res.push(s.slice(last));
        return res;
    };
    while (i < lines.length) {
        const l = lines[i];
        if (/^```/.test(l)) {
            const buf: string[] = []; i++;
            while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
            out.push(<pre key={i} className="md-code"><code>{buf.join('\n')}</code></pre>); i++; continue;
        }
        if (/^---+\s*$/.test(l) && i === 0) { // frontmatter
            let j = i + 1; while (j < lines.length && !/^---+\s*$/.test(lines[j])) j++;
            if (j < lines.length) { i = j + 1; continue; }
        }
        const h = l.match(/^(#{1,6})\s+(.*)$/);
        if (h) { const T = `h${Math.min(4, h[1].length)}` as 'h1'; out.push(<T key={i} className="md-h">{inline(h[2], `h${i}`)}</T>); i++; continue; }
        if (/^\s*(---|\*\*\*)\s*$/.test(l)) { out.push(<hr key={i} />); i++; continue; }
        if (/^>\s?/.test(l)) {
            const buf: Array<[number, string]> = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push([i, lines[i].replace(/^>\s?/, '')]); i++; }
            out.push(<blockquote key={`q${i}`} className="md-quote">{buf.map(([n, t]) => <div key={n}>{inline(t, `q${n}`)}</div>)}</blockquote>); continue;
        }
        const li = l.match(/^(\s*)([-*+]|\d+[.)])\s+(\[( |x|X)\]\s+)?(.*)$/);
        if (li) {
            const items: React.ReactNode[] = [];
            while (i < lines.length) {
                const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(\[( |x|X)\]\s+)?(.*)$/);
                if (!m) break;
                const n = i, done = m[4] && m[4] !== ' ';
                items.push(
                    <li key={n} style={{ marginLeft: Math.min(4, Math.floor(m[1].length / 2)) * 18 }} className={m[3] ? `md-task ${done ? 'done' : ''}` : ''}>
                        {m[3] && <input type="checkbox" checked={Boolean(done)} onChange={() => centang(n)} />}
                        {!m[3] && <span className="md-bullet">{/\d/.test(m[2]) ? m[2] : '•'}</span>}
                        <span>{inline(m[5], `l${n}`)}</span>
                    </li>
                );
                i++;
            }
            out.push(<ul key={`u${i}`} className="md-list">{items}</ul>); continue;
        }
        if (/^\|.*\|\s*$/.test(l)) {
            const rows: string[][] = [];
            while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { if (!/^\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim())); i++; }
            out.push(<div key={`t${i}`} className="md-table-wrap"><table className="md-table"><tbody>{rows.map((r, a) => <tr key={a}>{r.map((c, b) => a === 0 ? <th key={b}>{inline(c, `t${i}${a}${b}`)}</th> : <td key={b}>{inline(c, `t${i}${a}${b}`)}</td>)}</tr>)}</tbody></table></div>); continue;
        }
        if (!l.trim()) { out.push(<div key={i} className="md-gap" />); i++; continue; }
        out.push(<p key={i} className="md-p">{inline(l, `p${i}`)}</p>); i++;
    }
    return <div className="md">{out}</div>;
}
