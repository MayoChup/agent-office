import React from 'react';

/** Teks balasan AI: **tebal**, `kode`, tautan, daftar, baris baru — tanpa HTML mentah (aman). */
export function RichText({ text }: { text: string }) {
    const lines = text.split('\n');
    return (
        <>
            {lines.map((line, i) => {
                const bullet = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
                const head = line.match(/^#{1,4}\s+(.*)$/);
                const body = inline(bullet ? bullet[2] : head ? head[1] : line, i);
                if (head) return <div key={i} className="rt-h">{body}</div>;
                if (bullet) return <div key={i} className="rt-li"><span>{/^\d/.test(bullet[1]) ? bullet[1] : '•'}</span><div>{body}</div></div>;
                return <div key={i} className={line.trim() ? '' : 'rt-gap'}>{body}</div>;
            })}
        </>
    );
}

function inline(s: string, key: number): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
    let last = 0, m: RegExpExecArray | null, n = 0;
    while ((m = re.exec(s))) {
        if (m.index > last) out.push(s.slice(last, m.index));
        const t = m[0];
        if (t.startsWith('**')) out.push(<b key={`${key}-${n++}`}>{t.slice(2, -2)}</b>);
        else if (t.startsWith('`')) out.push(<code key={`${key}-${n++}`}>{t.slice(1, -1)}</code>);
        else if (t.startsWith('[')) { const mm = t.match(/^\[([^\]]+)\]\((.+)\)$/)!; out.push(<a key={`${key}-${n++}`} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>); }
        else out.push(<a key={`${key}-${n++}`} href={t} target="_blank" rel="noreferrer">{t.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}{t.length > 48 ? '…' : ''}</a>);
        last = m.index + t.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
}
