/**
 * Perbaikan sekali jalan di VPS saat kantor menyala (aman diulang).
 * - Dua AI bernama "Hana": penasihat keuangan diganti menjadi "Laras" (HR tetap Hana).
 *   Mengubah nama di kantor.config.json, profile.yaml, SOUL.md profilnya, dan tabel susunan kantor di SOUL.md lain.
 */
import fs from 'fs';
import path from 'path';

export const NAMA_PENASIHAT = 'Laras';
export function gantiNamaPenasihat(hermesHome: string, configFile: string, agents: Record<string, any>) {
    const id = 'keuangan-penasihat', lama = 'Hana', baru = NAMA_PENASIHAT;
    const ubah = (f: string, fn: (s: string) => string) => { try { const s = fs.readFileSync(f, 'utf8'); const t = fn(s); if (t !== s) { fs.writeFileSync(f, t); return true; } } catch { /* tidak ada */ } return false; };
    let n = 0;
    if (ubah(configFile, (s) => { try { const c = JSON.parse(s); if (c.agents?.[id]?.name === lama) { c.agents[id].name = baru; return JSON.stringify(c, null, 2); } } catch { /* */ } return s; })) n++;
    if (agents[id]?.name === lama) agents[id].name = baru;
    const d = path.join(hermesHome, 'profiles', id);
    if (ubah(path.join(d, 'profile.yaml'), (s) => s.replace(/^display_name:\s*Hana\s*$/m, `display_name: ${baru}`))) n++;
    if (ubah(path.join(d, 'SOUL.md'), (s) => s.replace(/^Kamu Hana si Penasihat\./m, `Kamu ${baru} si Penasihat.`))) n++;
    const souls = [path.join(hermesHome, 'SOUL.md')];
    try { for (const p of fs.readdirSync(path.join(hermesHome, 'profiles'))) souls.push(path.join(hermesHome, 'profiles', p, 'SOUL.md')); } catch { /* */ }
    for (const f of souls) if (ubah(f, (s) => s.split('| Hana | Penasihat |').join(`| ${baru} | Penasihat |`))) n++;
    if (n) console.log(`[Migrasi] Penasihat keuangan sekarang bernama ${baru} (${n} berkas diperbarui).`);
}
