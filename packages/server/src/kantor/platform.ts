/**
 * Sambungan resmi ke platform: Instagram & Facebook (Meta Graph API), YouTube (Data API v3), TikTok (Content Posting API).
 * Hanya dipanggil setelah Pak Rico menekan "Setujui" / "Kirim", atau untuk MEMBACA angka hasil & komentar.
 * Kunci akses disimpan di VPS (data/rahasia/sosmed/<akun>.json, izin 600): tidak pernah dikirim ke tampilan, chat, atau AI.
 */
import fs from 'fs';
import path from 'path';
import type { Format, Hasil } from './sosmed';
import { unggahIg, insightIg, komentarIg, balasIg, type KunciIg } from './sosmed';

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook';
export const PLATFORM: Record<Platform, { nama: string; ikon: string; format: Format[]; label: Partial<Record<Format, string>>; kunci: Array<{ k: string; label: string; rahasia: boolean }>; catatan: string }> = {
    instagram: { nama: 'Instagram', ikon: '📸', format: ['reel', 'feed', 'carousel', 'story'], label: { reel: 'Reel', feed: 'Feed', carousel: 'Carousel', story: 'Story' },
        kunci: [{ k: 'igUserId', label: 'ID akun Instagram (Bisnis/Kreator)', rahasia: false }, { k: 'token', label: 'Token akses jangka panjang', rahasia: true }],
        catatan: 'Akun Profesional + aplikasi Meta dengan izin instagram_content_publish, instagram_manage_insights, instagram_manage_comments.' },
    facebook: { nama: 'Facebook', ikon: '📘', format: ['reel', 'feed', 'carousel', 'story', 'video'], label: { reel: 'Reel', feed: 'Postingan foto', carousel: 'Album foto', story: 'Story', video: 'Video' },
        kunci: [{ k: 'pageId', label: 'ID Halaman Facebook', rahasia: false }, { k: 'token', label: 'Token akses Halaman (Page access token)', rahasia: true }],
        catatan: 'Halaman (Page), bukan profil pribadi. Izin: pages_manage_posts, pages_read_engagement, pages_manage_engagement, read_insights.' },
    youtube: { nama: 'YouTube', ikon: '▶️', format: ['reel', 'video'], label: { reel: 'Shorts', video: 'Video panjang' },
        kunci: [{ k: 'clientId', label: 'OAuth Client ID (Google Cloud)', rahasia: false }, { k: 'clientSecret', label: 'OAuth Client secret', rahasia: true }, { k: 'refreshToken', label: 'Refresh token (scope youtube.upload, youtube.readonly, youtube.force-ssl)', rahasia: true }],
        catatan: 'Proyek Google Cloud dengan YouTube Data API v3. Kuota harian default ±6 unggahan per hari.' },
    tiktok: { nama: 'TikTok', ikon: '🎵', format: ['reel', 'carousel'], label: { reel: 'Video', carousel: 'Foto (carousel)' },
        kunci: [{ k: 'clientKey', label: 'Client key (TikTok for Developers)', rahasia: false }, { k: 'clientSecret', label: 'Client secret', rahasia: true }, { k: 'refreshToken', label: 'Refresh token (scope video.publish, video.list, user.info.stats)', rahasia: true }],
        catatan: 'Aplikasi yang belum lolos audit TikTok hanya boleh memposting sebagai PRIVAT (hanya saya). Foto carousel lewat API butuh domain terverifikasi; untuk sekarang diunggah manual.' }
};
export const NAMA_FORMAT_P = (p: Platform, f: Format) => PLATFORM[p].label[f] || f;
/** Rasio & ukuran yang dipakai di prompt. */
export function rasio(p: Platform, f: Format): { r: string; px: string } {
    if (f === 'video') return { r: '16:9', px: '1920×1080' };
    if (f === 'feed' || f === 'carousel') return p === 'tiktok' ? { r: '9:16', px: '1080×1920' } : { r: '4:5', px: '1080×1350' };
    return { r: '9:16', px: '1080×1920' };
}

/* ── Penyimpanan kunci ── */
export class Rahasia {
    constructor(private dir: string) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
    private f(akun: string) { return path.join(this.dir, `${akun.replace(/[^a-z0-9-]/gi, '')}.json`); }
    baca(akun: string): Record<string, string> { try { return JSON.parse(fs.readFileSync(this.f(akun), 'utf8')); } catch { return {}; } }
    simpan(akun: string, x: Record<string, string>) { fs.writeFileSync(this.f(akun), JSON.stringify(x), { mode: 0o600 }); try { fs.chmodSync(this.f(akun), 0o600); } catch { /* */ } }
    hapus(akun: string) { try { fs.unlinkSync(this.f(akun)); } catch { /* */ } }
}
export interface Sambungan { platform: Platform; akun: string; kunci: Record<string, string>; simpanKunci: (x: Record<string, string>) => void }
/** Kunci lengkap? (Instagram akun utama juga boleh dari env lama INSTAGRAM_USER_ID/INSTAGRAM_TOKEN.) */
export function kunciLengkap(platform: Platform, k: Record<string, string>) { return PLATFORM[platform].kunci.every((x) => (k[x.k] || '').trim()); }

const GRAPH = (process.env.META_API_HOST || process.env.INSTAGRAM_API_HOST || 'https://graph.facebook.com').replace(/\/+$/, '');
async function jget(url: string, init?: RequestInit, nama = 'Platform') {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) });
    const t = await res.text(); let j: any = {}; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t.slice(0, 200) }; }
    const err = j.error && (typeof j.error === 'object' ? j.error.message || j.error.code : j.error);
    if (!res.ok || (err && err !== 'ok')) throw new Error(`${nama} menolak: ${String(err || j.error_description || `HTTP ${res.status}`).slice(0, 240)}`); // tanpa token di pesan
    return j;
}
const form = (b: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(b).toString() });
const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Instagram (memakai fungsi lama) ── */
const kIg = (s: Sambungan): KunciIg => ({ igUserId: s.kunci.igUserId, token: s.kunci.token, host: GRAPH });

/* ── Facebook Page ── */
async function fbVideoFase(s: Sambungan, ujung: 'video_reels' | 'video_stories', url: string, caption: string) {
    const { pageId, token } = s.kunci;
    const mulai = await jget(`${GRAPH}/${pageId}/${ujung}`, form({ upload_phase: 'start', access_token: token }), 'Facebook');
    const vid = String(mulai.video_id);
    await jget(String(mulai.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${vid}`), { method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: url } }, 'Facebook');
    const akhir = await jget(`${GRAPH}/${pageId}/${ujung}`, form({ upload_phase: 'finish', video_id: vid, ...(ujung === 'video_reels' ? { video_state: 'PUBLISHED', description: caption } : {}), access_token: token }), 'Facebook');
    return String(akhir.post_id || vid);
}
async function unggahFb(s: Sambungan, url: string[], caption: string, f: Format, judul: string) {
    const { pageId, token } = s.kunci; const vid = (u: string) => /\.(mp4|mov|m4v)(\?|$)/i.test(u);
    let id: string;
    if (f === 'reel') id = await fbVideoFase(s, 'video_reels', url[0], caption);
    else if (f === 'story') {
        if (vid(url[0])) id = await fbVideoFase(s, 'video_stories', url[0], caption);
        else { const p = await jget(`${GRAPH}/${pageId}/photos`, form({ url: url[0], published: 'false', access_token: token }), 'Facebook'); id = String((await jget(`${GRAPH}/${pageId}/photo_stories`, form({ photo_id: String(p.id), access_token: token }), 'Facebook')).post_id || p.id); }
    } else if (f === 'video') id = String((await jget(`${GRAPH}/${pageId}/videos`, form({ file_url: url[0], title: judul.slice(0, 100), description: caption, access_token: token }), 'Facebook')).id);
    else if (f === 'carousel' && url.length > 1) {
        const ids: string[] = [];
        for (const u of url.slice(0, 10)) ids.push(String((await jget(`${GRAPH}/${pageId}/photos`, form({ url: u, published: 'false', access_token: token }), 'Facebook')).id));
        const b: Record<string, string> = { message: caption, access_token: token }; ids.forEach((x, i) => { b[`attached_media[${i}]`] = JSON.stringify({ media_fbid: x }); });
        id = String((await jget(`${GRAPH}/${pageId}/feed`, form(b), 'Facebook')).id);
    } else { const p = await jget(`${GRAPH}/${pageId}/photos`, form({ url: url[0], caption, access_token: token }), 'Facebook'); id = String(p.post_id || p.id); }
    let tautan: string | undefined; try { tautan = (await jget(`${GRAPH}/${id}?fields=permalink_url&access_token=${encodeURIComponent(token)}`, undefined, 'Facebook')).permalink_url; } catch { /* tidak wajib */ }
    return { id, tautan };
}
async function hasilFb(s: Sambungan, id: string, f: Format): Promise<Partial<Hasil>> {
    const t = encodeURIComponent(s.kunci.token), out: Partial<Hasil> = {};
    try { const j = await jget(`${GRAPH}/${id}?fields=reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares&access_token=${t}`, undefined, 'Facebook'); out.suka = j.reactions?.summary?.total_count; out.komentar = j.comments?.summary?.total_count; out.bagikan = j.shares?.count ?? 0; } catch { /* sebagian */ }
    try {
        const m = f === 'reel' || f === 'video' ? 'post_impressions_unique,post_video_views' : 'post_impressions_unique,post_impressions';
        const j = await jget(`${GRAPH}/${id}/insights?metric=${m}&access_token=${t}`, undefined, 'Facebook');
        for (const d of j.data || []) { const v = +(d.values?.[0]?.value ?? 0); if (d.name === 'post_impressions_unique') out.jangkauan = v; if (d.name === 'post_video_views' || d.name === 'post_impressions') out.tayang = v; }
    } catch { /* metrik tidak tersedia untuk jenis ini */ }
    if (Object.values(out).every((v) => v == null)) throw new Error('Facebook tidak memberi angka untuk postingan ini.');
    return out;
}

/* ── YouTube ── */
async function tokenYt(s: Sambungan) {
    const j = await jget('https://oauth2.googleapis.com/token', form({ client_id: s.kunci.clientId, client_secret: s.kunci.clientSecret, refresh_token: s.kunci.refreshToken, grant_type: 'refresh_token' }), 'Google');
    return String(j.access_token);
}
async function unggahYt(s: Sambungan, file: string, caption: string, f: Format, judul: string, tag: string[]) {
    const at = await tokenYt(s), ukuran = fs.statSync(file).size, jenis = /\.mov$/i.test(file) ? 'video/quicktime' : 'video/mp4';
    const shorts = f === 'reel';
    const meta = { snippet: { title: `${judul}${shorts && !/#shorts/i.test(judul) ? ' #Shorts' : ''}`.slice(0, 100), description: caption.slice(0, 4900), tags: tag.map((x) => x.replace(/^#/, '')).slice(0, 15), categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(ukuran), 'X-Upload-Content-Type': jenis }, body: JSON.stringify(meta), signal: AbortSignal.timeout(60_000) });
    const lokasi = init.headers.get('location'); if (!init.ok || !lokasi) throw new Error(`YouTube menolak: HTTP ${init.status} ${(await init.text()).slice(0, 200)}`);
    const put = await fetch(lokasi, { method: 'PUT', headers: { 'Content-Type': jenis, 'Content-Length': String(ukuran) }, body: fs.readFileSync(file), signal: AbortSignal.timeout(30 * 60_000) });
    const j: any = await put.json().catch(() => ({})); if (!put.ok || !j.id) throw new Error(`YouTube gagal menerima video: ${String(j.error?.message || `HTTP ${put.status}`).slice(0, 200)}`);
    return { id: String(j.id), tautan: shorts ? `https://youtube.com/shorts/${j.id}` : `https://youtu.be/${j.id}` };
}
async function hasilYt(s: Sambungan, id: string): Promise<Partial<Hasil>> {
    const at = await tokenYt(s);
    const j = await jget(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${at}` } }, 'YouTube');
    const st = j.items?.[0]?.statistics; if (!st) throw new Error('Video YouTube tidak ditemukan.');
    return { tayang: +st.viewCount || 0, suka: +st.likeCount || 0, komentar: +st.commentCount || 0 };
}

/* ── TikTok ── */
async function tokenTt(s: Sambungan) {
    const j = await jget('https://open.tiktokapis.com/v2/oauth/token/', form({ client_key: s.kunci.clientKey, client_secret: s.kunci.clientSecret, grant_type: 'refresh_token', refresh_token: s.kunci.refreshToken }), 'TikTok');
    if (j.refresh_token && j.refresh_token !== s.kunci.refreshToken) s.simpanKunci({ ...s.kunci, refreshToken: String(j.refresh_token) }); // TikTok bisa memutar refresh token
    return String(j.access_token);
}
async function unggahTt(s: Sambungan, file: string, caption: string, f: Format) {
    if (f !== 'reel') throw new Error('Foto/carousel TikTok lewat API butuh domain terverifikasi; unggah manual dulu.');
    const at = await tokenTt(s), h = { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json; charset=UTF-8' };
    const info = await jget('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers: h }, 'TikTok');
    const opsi: string[] = info.data?.privacy_level_options || [];
    const privasi = opsi.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : opsi[0] || 'SELF_ONLY';
    const ukuran = fs.statSync(file).size, MB = 1024 * 1024;
    const potong = ukuran <= 64 * MB ? ukuran : 10 * MB, jumlah = ukuran <= 64 * MB ? 1 : Math.floor(ukuran / potong);
    const init = await jget('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers: h, body: JSON.stringify({ post_info: { title: caption.slice(0, 2200), privacy_level: privasi, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: 'FILE_UPLOAD', video_size: ukuran, chunk_size: potong, total_chunk_count: jumlah } }) }, 'TikTok');
    const urlUp = String(init.data?.upload_url), pid = String(init.data?.publish_id);
    const fd = fs.openSync(file, 'r');
    try {
        for (let i = 0; i < jumlah; i++) {
            const awal = i * potong, akhir = i === jumlah - 1 ? ukuran : awal + potong, buf = Buffer.alloc(akhir - awal);
            fs.readSync(fd, buf, 0, buf.length, awal);
            const r = await fetch(urlUp, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length), 'Content-Range': `bytes ${awal}-${akhir - 1}/${ukuran}` }, body: buf, signal: AbortSignal.timeout(10 * 60_000) });
            if (!r.ok && r.status !== 206) throw new Error(`TikTok gagal menerima potongan video (HTTP ${r.status}).`);
        }
    } finally { fs.closeSync(fd); }
    for (let i = 0; i < 60; i++) {
        await tunggu(5000);
        const st = await jget('https://open.tiktokapis.com/v2/post/publish/status/fetch/', { method: 'POST', headers: h, body: JSON.stringify({ publish_id: pid }) }, 'TikTok');
        const s2 = st.data?.status;
        if (s2 === 'PUBLISH_COMPLETE') { const vid = String(st.data?.publicaly_available_post_id?.[0] || pid); return { id: vid, tautan: privasi === 'SELF_ONLY' ? undefined : undefined, privat: privasi === 'SELF_ONLY' }; }
        if (s2 === 'FAILED') throw new Error(`TikTok gagal memproses: ${st.data?.fail_reason || 'tidak diketahui'}`);
    }
    return { id: pid, privat: privasi === 'SELF_ONLY' };
}
async function hasilTt(s: Sambungan, id: string): Promise<Partial<Hasil>> {
    if (!/^\d+$/.test(id)) throw new Error('Video TikTok belum punya id publik.');
    const at = await tokenTt(s);
    const j = await jget('https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count', { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: { video_ids: [id] } }) }, 'TikTok');
    const v = j.data?.videos?.[0]; if (!v) throw new Error('Video TikTok tidak ditemukan.');
    return { tayang: v.view_count, suka: v.like_count, komentar: v.comment_count, bagikan: v.share_count };
}

/* ── Antarmuka umum ── */
export interface BahanUnggah { url: string[]; file: string[]; caption: string; format: Format; judul: string; tag: string[] }
export async function unggah(s: Sambungan, b: BahanUnggah): Promise<{ id: string; tautan?: string; privat?: boolean }> {
    if (s.platform === 'instagram') return unggahIg(kIg(s), b.url, b.caption, b.format);
    if (s.platform === 'facebook') return unggahFb(s, b.url, b.caption, b.format, b.judul);
    if (s.platform === 'youtube') return unggahYt(s, b.file[0], b.caption, b.format, b.judul, b.tag);
    return unggahTt(s, b.file[0], b.caption, b.format);
}
/** Platform yang mengambil berkas lewat tautan https publik (bukan dikirim langsung dari VPS). */
export const butuhUrlPublik = (p: Platform) => p === 'instagram' || p === 'facebook';
export async function hasil(s: Sambungan, id: string, f: Format): Promise<Partial<Hasil>> {
    if (s.platform === 'instagram') return insightIg(kIg(s), id, f);
    if (s.platform === 'facebook') return hasilFb(s, id, f);
    if (s.platform === 'youtube') return hasilYt(s, id);
    return hasilTt(s, id);
}
/** Jumlah pengikut/subscriber saat ini. */
export async function pengikut(s: Sambungan): Promise<number | null> {
    try {
        if (s.platform === 'instagram') return +(await jget(`${GRAPH}/${s.kunci.igUserId}?fields=followers_count&access_token=${encodeURIComponent(s.kunci.token)}`, undefined, 'Instagram')).followers_count;
        if (s.platform === 'facebook') { const j = await jget(`${GRAPH}/${s.kunci.pageId}?fields=followers_count,fan_count&access_token=${encodeURIComponent(s.kunci.token)}`, undefined, 'Facebook'); return +(j.followers_count ?? j.fan_count); }
        if (s.platform === 'youtube') { const at = await tokenYt(s); const j = await jget('https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true', { headers: { Authorization: `Bearer ${at}` } }, 'YouTube'); return +j.items?.[0]?.statistics?.subscriberCount; }
        const at = await tokenTt(s); const j = await jget('https://open.tiktokapis.com/v2/user/info/?fields=follower_count', { headers: { Authorization: `Bearer ${at}` } }, 'TikTok'); return +j.data?.user?.follower_count;
    } catch (e: any) { console.warn('[Sosmed] pengikut:', e?.message || e); return null; }
}
export interface KomentarMasuk { id: string; user: string; teks: string; at: number; dibalas: boolean }
export async function komentar(s: Sambungan, postId: string): Promise<KomentarMasuk[]> {
    if (s.platform === 'instagram') return komentarIg(kIg(s), postId);
    if (s.platform === 'facebook') {
        const j = await jget(`${GRAPH}/${postId}/comments?fields=id,message,from{name},created_time,comment_count&limit=50&access_token=${encodeURIComponent(s.kunci.token)}`, undefined, 'Facebook');
        return (j.data || []).map((c: any) => ({ id: String(c.id), user: String(c.from?.name || 'pengguna'), teks: String(c.message || ''), at: Date.parse(c.created_time) || Date.now(), dibalas: (c.comment_count || 0) > 0 }));
    }
    if (s.platform === 'youtube') {
        const at = await tokenYt(s);
        const j = await jget(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(postId)}&maxResults=50`, { headers: { Authorization: `Bearer ${at}` } }, 'YouTube');
        return (j.items || []).map((c: any) => { const t = c.snippet?.topLevelComment?.snippet || {}; return { id: String(c.snippet?.topLevelComment?.id || c.id), user: String(t.authorDisplayName || ''), teks: String(t.textOriginal || ''), at: Date.parse(t.publishedAt) || Date.now(), dibalas: (c.snippet?.totalReplyCount || 0) > 0 }; });
    }
    return []; // TikTok: API komentar belum tersedia untuk aplikasi umum
}
export async function balas(s: Sambungan, komentarId: string, pesan: string) {
    if (s.platform === 'instagram') return balasIg(kIg(s), komentarId, pesan);
    if (s.platform === 'facebook') return jget(`${GRAPH}/${encodeURIComponent(komentarId)}/comments`, form({ message: pesan.slice(0, 8000), access_token: s.kunci.token }), 'Facebook');
    if (s.platform === 'youtube') { const at = await tokenYt(s); return jget('https://www.googleapis.com/youtube/v3/comments?part=snippet', { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { parentId: komentarId, textOriginal: pesan.slice(0, 9000) } }) }, 'YouTube'); }
    throw new Error('Membalas komentar TikTok lewat API belum tersedia.');
}
export const bisaKomentar = (p: Platform) => p !== 'tiktok';
/**
 * DM balasan pribadi untuk satu komentar (fitur resmi Instagram "private reply": 1 DM per komentar, dalam 7 hari).
 * Butuh izin pesan (instagram_manage_messages / instagram_business_manage_messages) pada token akun.
 */
export async function dmKomentar(s: Sambungan, komentarId: string, pesan: string) {
    if (s.platform !== 'instagram') throw new Error('DM otomatis baru tersedia untuk Instagram.');
    const k = kIg(s);
    const r = await fetch(`${k.host}/${encodeURIComponent(k.igUserId || 'me')}/messages`, {
        method: 'POST', signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k.token}` },
        body: JSON.stringify({ recipient: { comment_id: komentarId }, message: { text: pesan.slice(0, 1000) } })
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(`Instagram DM: ${j?.error?.message || `HTTP ${r.status}`}`);
    return j;
}
