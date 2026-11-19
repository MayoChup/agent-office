import React from 'react';

/**
 * Teks balasan AI → tampilan rapi tanpa HTML mentah (aman).
 * Mendukung: judul (#), paragraf, daftar bertingkat (-, *, •, 1.), kutipan (>), garis (---), tabel (| a | b |),
 * blok kode (```), **tebal**, *miring*, `kode`, tautan & [teks](url).
 */
export function RichText({ text }: { text: string }) {
    return <div className="rt">{blok(text)}</div>;
}

/** Pecah balasan panjang jadi beberapa bagian (untuk beberapa gelembung chat), di batas judul/paragraf. */
export function pecahBalasan(text: string, maks = 900): string[] {
    const t = text.trim();
    if (t.length <= maks || /```/.test(t)) return [t];
    const para = t.split(/\n{2,}(?=\S)/);
    const out: string[] = [];
    let cur = '';
    for (const p of para) {
        const judulBaru = /^#{1,4}\s/.test(p);
        if (cur && (cur.length + p.length > maks || (judulBaru && cur.length > maks / 3))) { out.push(cur.trim()); cur = ''; }
        cur += (cur ? '\n\n' : '') + p;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.length ? out : [t];
}

type Item = { lvl: number; num: string | null; isi: string[] };

function blok(text: string): React.ReactNode[] {
    const lines = text.replace(/\r/g, '').split('\n');
    const out: React.ReactNode[] = [];
    let i = 0, k = 0;
    const key = () => `b${k++}`;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) { i++; continue; }
        // Blok kode
        const pagar = line.match(/^\s*```(\w*)/);
        if (pagar) {
            const isi: string[] = []; i++;
            while (i < lines.length && !/^\s*```/.test(lines[i])) isi.push(lines[i++]);
            i++;
            out.push(<pre key={key()} className="rt-pre"><code>{isi.join('\n')}</code></pre>);
            continue;
        }
        // Tabel
        if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
            const sel = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
            const kepala = sel(line); i += 2;
            const baris: string[][] = [];
            while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) baris.push(sel(lines[i++]));
            out.push(
                <div key={key()} className="rt-tabel"><table>
                    <thead><tr>{kepala.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
                    <tbody>{baris.map((r, ri) => <tr key={ri}>{kepala.map((_, j) => <td key={j}>{inline(r[j] || '')}</td>)}</tr>)}</tbody>
                </table></div>
            );
            continue;
        }
        // Garis
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push(<hr key={key()} className="rt-hr" />); i++; continue; }
        // Judul
        const h = line.match(/^\s*(#{1,4})\s+(.*)$/);
        if (h) { out.push(<div key={key()} className={`rt-h rt-h${h[1].length}`}>{inline(h[2].replace(/\*\*/g, ''))}</div>); i++; continue; }
        // Kutipan
        if (/^\s*>/.test(line)) {
            const isi: string[] = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) isi.push(lines[i++].replace(/^\s*>\s?/, ''));
            out.push(<blockquote key={key()} className="rt-q">{blok(isi.join('\n'))}</blockquote>);
            continue;
        }
        // Daftar
        if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
            const items: Item[] = [];
            while (i < lines.length) {
                const l = lines[i];
                const m = l.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
                if (m) { items.push({ lvl: Math.min(3, Math.floor(m[1].replace(/\t/g, '    ').length / 2)), num: /^\d/.test(m[2]) ? m[2].replace(')', '.') : null, isi: [m[3]] }); i++; continue; }
                if (l.trim() && /^\s{2,}\S/.test(l) && items.length) { items[items.length - 1].isi.push(l.trim()); i++; continue; }
                if (!l.trim() && i + 1 < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i + 1])) { i++; continue; }
                break;
            }
            out.push(<div key={key()} className="rt-list">{items.map((it, j) => (
                <div key={j} className="rt-li" style={{ paddingLeft: it.lvl * 16 }}>
                    <span className="rt-tanda">{it.num || (it.lvl ? '◦' : '•')}</span>
                    <div>{inline(it.isi.join(' '))}</div>
                </div>
            ))}</div>);
            continue;
        }
        // Paragraf: gabung baris berurutan
        const isi: string[] = [];
        while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,4}\s|>|([-*•]|\d+[.)])\s+|\|.*\|\s*$|(-{3,}|\*{3,})\s*$)/.test(lines[i])) isi.push(lines[i++]);
        if (!isi.length) { isi.push(lines[i++]); }
        out.push(<p key={key()} className="rt-p">{isi.flatMap((l, j) => (j ? [<br key={`br${j}`} />, ...inline(l, j)] : inline(l, j)))}</p>);
    }
    return out;
}

function inline(s: string, key = 0): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|__[^_]+__|(?<![\w*])\*[^*\s][^*]*\*(?!\w)|(?<![\w_])_[^_\s][^_]*_(?![\w])|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g;
    let last = 0, m: RegExpExecArray | null, n = 0;
    while ((m = re.exec(s))) {
        if (m.index > last) out.push(s.slice(last, m.index));
        const t = m[0], k = `${key}-${n++}`;
        if (t.startsWith('**') || t.startsWith('__')) out.push(<b key={k}>{t.slice(2, -2)}</b>);
        else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
        else if (t.startsWith('[')) { const mm = t.match(/^\[([^\]]+)\]\((.+)\)$/)!; out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>); }
        else if (t.startsWith('http')) out.push(<a key={k} href={t} target="_blank" rel="noreferrer">{t.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}{t.length > 48 ? '…' : ''}</a>);
        else out.push(<em key={k}>{t.slice(1, -1)}</em>);
        last = m.index + t.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
}
