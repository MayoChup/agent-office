import fs from 'fs';
import path from 'path';

/** Kirim pesan berformat ke chat Telegram Pak Rico lewat bot Joni (label tebal, dipecah bila panjang). */
export async function telegramKirim(hermesHome: string, label: string, isi: string): Promise<boolean> {
    let env = '';
    try { env = fs.readFileSync(path.join(hermesHome, '.env'), 'utf8'); } catch { return false; }
    const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '');
    const token = get('TELEGRAM_BOT_TOKEN');
    const chat = get('TELEGRAM_HOME_CHANNEL') || get('TELEGRAM_ALLOWED_USERS').split(',')[0].trim();
    if (!token || !chat) return false;
    const bagian = potong(isi, 3500);
    for (let i = 0; i < bagian.length; i++) {
        const html = `${i === 0 ? `<b>${esc(label)}</b>\n` : ''}${mdKeHtml(bagian[i])}`;
        let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true })
        }).catch(() => null);
        if (!res?.ok) { // format gagal → kirim polos
            res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chat, text: `${i === 0 ? `${label}\n` : ''}${bagian[i]}` })
            }).catch(() => null);
            if (!res?.ok) return false;
        }
    }
    return true;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function mdKeHtml(s: string): string {
    return esc(s)
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/__([^_\n]+)__/g, '<b>$1</b>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/^#{1,4}\s+(.+)$/gm, '<b>$1</b>');
}

function potong(s: string, n: number): string[] {
    const out: string[] = [];
    let sisa = s.trim() || '(kosong)';
    while (sisa.length > n) {
        let i = sisa.lastIndexOf('\n', n);
        if (i < n * 0.5) i = n;
        out.push(sisa.slice(0, i));
        sisa = sisa.slice(i).trim();
    }
    out.push(sisa);
    return out;
}
