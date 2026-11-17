/**
 * Pengatur model AI kantor (hemat token).
 *  - Tugas teks (JSON, ringkasan, carousel) tidak butuh alat → bisa dikerjakan langsung oleh Gemini / Groq (gratis, kuota sendiri),
 *    sehingga kuota OpenRouter (dipakai Hermes untuk chat & alat) tidak cepat habis.
 *  - Tiap AI punya "opsi model". HR (Hana) boleh memindahkan AI antar opsi GRATIS berdasarkan beban kerja; opsi berbayar hanya Pak Rico.
 *  - Batas harian per opsi; kalau penuh/gagal → pindah otomatis ke opsi gratis lain, terakhir ke Hermes.
 *  - Konteks tetap: tiap panggilan langsung membawa SOUL.md + ingatan (memories/*.md) profil Hermes di VPS, apa pun modelnya.
 * Kunci API hanya dibaca dari environment server; tidak pernah dikirim ke tampilan atau dicatat.
 */
import fs from 'fs';
import path from 'path';

export type Cara = 'hermes' | 'gemini' | 'groq' | 'xai';
export interface Opsi { id: string; label: string; cara: Cara; model: string; biaya: 'gratis' | 'berbayar'; batasHari: number; alat: boolean; ket: string; ada: boolean }
export interface Atur { opsi: string; oleh: 'awal' | 'hr' | 'rico'; alasan: string; at: number; kunci: boolean }
interface Hitung { n: number; masuk: number; keluar: number; gagal: number }
interface St { atur: Record<string, Atur>; hari: string; pakai: Record<string, Hitung>; aiHari: Record<string, Record<string, Hitung>>; riwayat: Array<{ hari: string; ai: Record<string, Hitung>; opsi: Record<string, Hitung> }>; review: { at: number; teks: string; ubah: Array<{ ai: string; dari: string; ke: string; alasan: string }> } | null; modelAuto: Record<string, { model: string; at: number }> }

const hariWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const kosong = (): Hitung => ({ n: 0, masuk: 0, keluar: 0, gagal: 0 });
const BASE: Record<Exclude<Cara, 'hermes'>, string> = { gemini: 'https://generativelanguage.googleapis.com/v1beta/openai', groq: 'https://api.groq.com/openai/v1', xai: 'https://api.x.ai/v1' };
const KUNCI: Record<Exclude<Cara, 'hermes'>, string> = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', xai: 'XAI_API_KEY' };
const PILIH: Record<Exclude<Cara, 'hermes'>, { prefer: RegExp[]; avoid: RegExp }> = {
    gemini: { prefer: [/^gemini-2\.5-flash$/, /flash(?!.*(lite|preview|image|tts))/, /flash-lite/, /flash/], avoid: /image|tts|audio|live|embed|vision|thinking|learnlm|aqa|imagen|veo|robotics|computer/i },
    groq: { prefer: [/^llama-3\.3-70b/, /gpt-oss-120b/, /llama-4/, /qwen/, /llama/], avoid: /whisper|tts|guard|playai|vision|compound|distil|orpheus/i },
    xai: { prefer: [/grok-3-mini/, /mini/, /grok/], avoid: /image|vision/i }
};

export class ModelRouter {
    private file: string;
    st: St = { atur: {}, hari: '', pakai: {}, aiHari: {}, riwayat: [], review: null, modelAuto: {} };
    private dingin = new Map<string, number>();
    constructor(dataDir: string, private hermesHome: string, private env: Record<string, string | undefined> = process.env) {
        this.file = path.join(dataDir, 'model-ai.json');
        try { this.st = { ...this.st, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { /* baru */ }
    }
    private simpan() { try { fs.writeFileSync(this.file, JSON.stringify(this.st)); } catch (e: any) { console.warn('[Model] simpan:', e?.message || e); } }
    private gantiHari() {
        const h = hariWib(); if (this.st.hari === h) return;
        if (this.st.hari) this.st.riwayat = [...this.st.riwayat, { hari: this.st.hari, ai: Object.fromEntries(Object.entries(this.st.aiHari).map(([a, x]) => [a, Object.values(x).reduce((s, v) => ({ n: s.n + v.n, masuk: s.masuk + v.masuk, keluar: s.keluar + v.keluar, gagal: s.gagal + v.gagal }), kosong())])), opsi: this.st.pakai }].slice(-30);
        this.st.hari = h; this.st.pakai = {}; this.st.aiHari = {}; this.simpan();
    }
    /** Daftar opsi yang diizinkan (allowlist). Batas harian bisa diubah lewat environment. */
    opsi(): Opsi[] {
        const n = (k: string, d: number) => Math.max(1, Number(this.env[k]) || d);
        return [
            { id: 'hermes', label: 'Hermes (bawaan profil)', cara: 'hermes', model: 'sesuai config profil (OpenRouter gratis)', biaya: 'gratis', batasHari: n('KANTOR_HERMES_PER_HARI', 400), alat: true, ket: 'Bisa memakai alat & skill. Kuota OpenRouter dipakai bersama chat — jangan dibebani tugas teks rutin.', ada: true },
            { id: 'gemini', label: 'Gemini Flash (langsung)', cara: 'gemini', model: this.env.GEMINI_MODEL || this.st.modelAuto.gemini?.model || 'otomatis (flash)', biaya: 'gratis', batasHari: n('KANTOR_GEMINI_PER_HARI', 250), alat: false, ket: 'Gratis, cepat, rapi untuk JSON & ringkasan. Tanpa alat.', ada: !!this.env.GEMINI_API_KEY },
            { id: 'groq', label: 'Groq Llama (langsung)', cara: 'groq', model: this.env.GROQ_MODEL || this.st.modelAuto.groq?.model || 'otomatis (llama 70B)', biaya: 'gratis', batasHari: n('KANTOR_GROQ_PER_HARI', 300), alat: false, ket: 'Gratis & sangat cepat. Cocok untuk teks pendek, game, tata desain.', ada: !!this.env.GROQ_API_KEY },
            { id: 'grok', label: 'Grok (xAI, langsung)', cara: 'xai', model: this.env.XAI_MODEL || this.st.modelAuto.xai?.model || 'otomatis (grok mini)', biaya: 'berbayar', batasHari: n('KANTOR_XAI_PER_HARI', 30), alat: false, ket: 'Berbayar per token. Hanya Pak Rico yang bisa memilih ini.', ada: !!this.env.XAI_API_KEY }
        ];
    }
    private cari(id: string) { return this.opsi().find((o) => o.id === id); }
    private terpakai(id: string) { this.gantiHari(); return this.st.pakai[id]?.n || 0; }
    /** Pembagian awal: AI dengan tugas teks rutin dibagi rata ke opsi gratis langsung, supaya tidak menumpuk di satu kuota. */
    aturAwal(ids: string[]) {
        const langsung = this.opsi().filter((o) => o.ada && o.biaya === 'gratis' && !o.alat);
        let i = 0, ubah = false;
        for (const id of ids) {
            const a = this.st.atur[id];
            if (a && this.cari(a.opsi)?.ada) continue;
            if (a && a.kunci) continue;
            const pilih = langsung.length ? langsung[i++ % langsung.length].id : 'hermes';
            this.st.atur[id] = { opsi: pilih, oleh: 'awal', alasan: 'Pembagian awal supaya kuota tersebar.', at: Date.now(), kunci: false };
            ubah = true;
        }
        if (ubah) this.simpan();
    }
    /** Urutan opsi untuk satu tugas teks: pilihan AI itu dulu, lalu opsi gratis lain yang masih longgar, terakhir Hermes. */
    rute(aiId: string): Opsi[] {
        const semua = this.opsi().filter((o) => o.ada);
        const utama = this.cari(this.st.atur[aiId]?.opsi || 'hermes');
        const longgar = (o: Opsi) => this.terpakai(o.id) < o.batasHari && (this.dingin.get(o.id) || 0) < Date.now();
        const urut: Opsi[] = [];
        if (utama?.ada && longgar(utama)) urut.push(utama);
        // Cadangan hanya opsi gratis (tidak pernah otomatis pindah ke berbayar), yang paling lowong dulu.
        for (const o of semua.filter((x) => x.biaya === 'gratis' && x.id !== 'hermes' && x.id !== utama?.id && longgar(x)).sort((a, b) => this.terpakai(a.id) / a.batasHari - this.terpakai(b.id) / b.batasHari)) urut.push(o);
        if (!urut.some((o) => o.id === 'hermes')) urut.push(this.cari('hermes')!);
        return urut;
    }
    catat(aiId: string, opsi: string, masuk: number, keluar: number, ok: boolean) {
        this.gantiHari();
        const t = (this.st.pakai[opsi] ||= kosong()); const a = ((this.st.aiHari[aiId] ||= {})[opsi] ||= kosong());
        for (const x of [t, a]) { x.n++; x.masuk += masuk; x.keluar += keluar; if (!ok) x.gagal++; }
        this.simpan();
    }
    /** Ingatan profil di VPS (SOUL + memories) — dibawa ke model mana pun supaya AI tetap paham konteksnya. */
    otak(aiId: string) {
        const dir = aiId === 'default' ? this.hermesHome : path.join(this.hermesHome, 'profiles', aiId);
        const baca = (f: string, n: number) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim().slice(0, n); } catch { return ''; } };
        let mem = '';
        try { for (const f of fs.readdirSync(path.join(dir, 'memories')).filter((x) => x.endsWith('.md')).slice(0, 4)) mem += `\n[${f}]\n${baca(path.join('memories', f), 2500)}`; } catch { /* belum ada ingatan */ }
        return [baca('SOUL.md', 3000), mem ? `\nINGATANMU (dari otak kantor di VPS):${mem.slice(0, 5000)}` : ''].filter(Boolean).join('\n');
    }
    private async modelUntuk(o: Opsi): Promise<string> {
        const cara = o.cara as Exclude<Cara, 'hermes'>;
        const tetap = cara === 'gemini' ? this.env.GEMINI_MODEL : cara === 'groq' ? this.env.GROQ_MODEL : this.env.XAI_MODEL;
        if (tetap) return tetap;
        const c = this.st.modelAuto[cara]; if (c && Date.now() - c.at < 12 * 3600_000) return c.model;
        const r = await fetch(`${BASE[cara]}/models`, { headers: { Authorization: `Bearer ${this.env[KUNCI[cara]]}` }, signal: AbortSignal.timeout(15_000) });
        const j: any = await r.json().catch(() => ({}));
        const ids: string[] = (j?.data || []).map((m: any) => String(m.id || '').replace(/^models\//, '')).filter((id: string) => id && !PILIH[cara].avoid.test(id));
        let m = ''; for (const re of PILIH[cara].prefer) { const hit = ids.filter((id) => re.test(id)).sort().reverse()[0]; if (hit) { m = hit; break; } }
        m = m || ids[0]; if (!m) throw new Error(`${o.label}: tidak ada model yang cocok.`);
        this.st.modelAuto[cara] = { model: m, at: Date.now() }; this.simpan(); return m;
    }
    /** Panggil satu opsi langsung (OpenAI-compatible). */
    async langsung(o: Opsi, aiId: string, nama: string, prompt: string, maks = 4000): Promise<string> {
        const cara = o.cara as Exclude<Cara, 'hermes'>;
        const kunci = this.env[KUNCI[cara]]; if (!kunci) throw new Error(`${o.label} belum diatur.`);
        const model = await this.modelUntuk(o);
        const sistem = [`Kamu ${nama}, anggota tim AI di Kantor Virtual milik Pak Rico. Ikuti format keluaran yang diminta persis (kalau diminta JSON, keluarkan JSON saja).`, this.otak(aiId)].filter(Boolean).join('\n\n');
        const r = await fetch(`${BASE[cara]}/chat/completions`, {
            method: 'POST', signal: AbortSignal.timeout(90_000), headers: { Authorization: `Bearer ${kunci}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'system', content: sistem }, { role: 'user', content: prompt }], temperature: 0.7, max_tokens: maks })
        });
        if (!r.ok) {
            const isi = (await r.text()).slice(0, 160);
            this.dingin.set(o.id, Date.now() + (r.status === 429 ? 10 * 60_000 : r.status === 401 || r.status === 403 ? 6 * 3600_000 : 3 * 60_000));
            if (r.status === 404 || r.status === 400) delete this.st.modelAuto[cara];
            throw new Error(`${o.label}: HTTP ${r.status} ${isi}`);
        }
        const j: any = await r.json();
        const out = String(j?.choices?.[0]?.message?.content || '').trim();
        if (!out) throw new Error(`${o.label}: jawaban kosong.`);
        return out;
    }
    /** Pak Rico / HR mengatur opsi satu AI. HR hanya boleh opsi gratis & tidak boleh mengubah yang dikunci Pak Rico. */
    setAtur(aiId: string, opsi: string, oleh: 'hr' | 'rico', alasan = '', kunci?: boolean) {
        const o = this.cari(opsi); if (!o) throw new Error('Opsi model tidak dikenal.'); if (!o.ada) throw new Error(`${o.label} belum diatur di server (kunci API belum ada).`);
        const lama = this.st.atur[aiId];
        if (oleh === 'hr') { if (o.biaya !== 'gratis') throw new Error('HR hanya boleh memilih opsi gratis.'); if (lama?.kunci) throw new Error('Dikunci Pak Rico.'); }
        this.st.atur[aiId] = { opsi, oleh, alasan: alasan.slice(0, 200), at: Date.now(), kunci: oleh === 'rico' ? kunci !== false : false };
        this.simpan(); return this.st.atur[aiId];
    }
    lepasKunci(aiId: string) { const a = this.st.atur[aiId]; if (a) { a.kunci = false; this.simpan(); } }
    /** Rekap beban kerja 7 hari per AI & per opsi (untuk HR dan tampilan). */
    rekap(hari = 7) {
        this.gantiHari();
        const hari7 = [...this.st.riwayat.slice(-(hari - 1)), { hari: this.st.hari, ai: Object.fromEntries(Object.entries(this.st.aiHari).map(([a, x]) => [a, Object.values(x).reduce((s, v) => ({ n: s.n + v.n, masuk: s.masuk + v.masuk, keluar: s.keluar + v.keluar, gagal: s.gagal + v.gagal }), kosong())])), opsi: this.st.pakai }];
        const ai: Record<string, Hitung> = {}, opsi: Record<string, Hitung> = {};
        for (const h of hari7) {
            for (const [k, v] of Object.entries(h.ai)) { const x = (ai[k] ||= kosong()); x.n += v.n; x.masuk += v.masuk; x.keluar += v.keluar; x.gagal += v.gagal; }
            for (const [k, v] of Object.entries(h.opsi)) { const x = (opsi[k] ||= kosong()); x.n += v.n; x.masuk += v.masuk; x.keluar += v.keluar; x.gagal += v.gagal; }
        }
        return { hari: hari7.length, ai, opsi, hariIni: { opsi: this.st.pakai, ai: this.st.aiHari } };
    }
    promptReview(anggota: Array<{ id: string; nama: string; peran: string }>) {
        const r = this.rekap(), o = this.opsi().filter((x) => x.ada);
        const tok = (c: number) => Math.round(c / 4);
        return [
            'Kamu HR Officer. Tata ulang pembagian MODEL AI tim supaya sehemat mungkin dan tidak ada kuota yang habis mendadak.',
            'Aturan: hanya boleh memilih opsi GRATIS. AI bertanda [DIKUNCI] tidak boleh diubah. Opsi "hermes" disisakan untuk AI yang butuh alat/skill; tugas teks rutin sebaiknya di opsi langsung (gemini/groq). Sebar beban supaya tiap opsi < 70% batas hariannya.',
            '', 'OPSI (pemakaian 7 hari / batas per hari):',
            ...o.map((x) => `- ${x.id}: ${x.label}, ${x.biaya}, batas ${x.batasHari}/hari, terpakai 7 hari ${r.opsi[x.id]?.n || 0} panggilan (~${tok((r.opsi[x.id]?.masuk || 0) + (r.opsi[x.id]?.keluar || 0))} token), gagal ${r.opsi[x.id]?.gagal || 0}. ${x.ket}`),
            '', 'ANGGOTA (opsi sekarang, beban 7 hari):',
            ...anggota.map((a) => { const at = this.st.atur[a.id]; const b = r.ai[a.id]; return `- ${a.id} (${a.nama}, ${a.peran}): ${at?.opsi || 'hermes'}${at?.kunci ? ' [DIKUNCI]' : ''}, ${b?.n || 0} tugas, ~${tok((b?.masuk || 0) + (b?.keluar || 0))} token, gagal ${b?.gagal || 0}`; }),
            '', 'Jawab HANYA JSON: {"ringkasan":"2-3 kalimat untuk Pak Rico","ubah":[{"ai":"<id>","opsi":"<id opsi>","alasan":"singkat"}]} — cantumkan hanya yang perlu dipindah; boleh kosong.'
        ].join('\n');
    }
    terapkanReview(raw: string, valid: Set<string>) {
        const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); let j: any = null; try { j = JSON.parse(raw.slice(a, b + 1)); } catch { /* */ }
        const ubah: Array<{ ai: string; dari: string; ke: string; alasan: string }> = [];
        for (const x of Array.isArray(j?.ubah) ? j.ubah.slice(0, 30) : []) {
            const ai = String(x?.ai || ''), ke = String(x?.opsi || ''); if (!valid.has(ai)) continue;
            const dari = this.st.atur[ai]?.opsi || 'hermes'; if (dari === ke) continue;
            try { this.setAtur(ai, ke, 'hr', String(x?.alasan || '')); ubah.push({ ai, dari, ke, alasan: String(x?.alasan || '').slice(0, 200) }); } catch { /* ditolak pagar pengaman */ }
        }
        this.st.review = { at: Date.now(), teks: String(j?.ringkasan || '').slice(0, 800), ubah }; this.simpan();
        return this.st.review;
    }
    /** Ringkasan untuk tampilan (tanpa kunci API). */
    tampil(anggota: Array<{ id: string; nama: string; peran: string }>) {
        const r = this.rekap();
        return { opsi: this.opsi().map((o) => ({ ...o, hariIni: this.st.pakai[o.id] || kosong(), minggu: r.opsi[o.id] || kosong() })), anggota: anggota.map((a) => ({ ...a, atur: this.st.atur[a.id] || { opsi: 'hermes', oleh: 'awal', alasan: '', at: 0, kunci: false }, hariIni: Object.values(this.st.aiHari[a.id] || {}).reduce((s, v) => s + v.n, 0), minggu: r.ai[a.id] || kosong() })), review: this.st.review };
    }
}
