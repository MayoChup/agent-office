/** Nama populer → kode saham bursa AS (supaya "tsmc", "alibaba", "google" langsung ketemu). */
export const ALIAS_SAHAM: Record<string, string> = {
    tsmc: 'TSM', 'taiwan semi': 'TSM', taiwan: 'TSM', alibaba: 'BABA', toyota: 'TM', sony: 'SONY', novo: 'NVO', 'novo nordisk': 'NVO', asml: 'ASML', arm: 'ARM',
    shopify: 'SHOP', mercadolibre: 'MELI', shopee: 'SE', garena: 'SE', 'sea limited': 'SE', nubank: 'NU', spotify: 'SPOT', temu: 'PDD', pinduoduo: 'PDD', baidu: 'BIDU',
    grab: 'GRAB', unilever: 'UL', shell: 'SHEL', astrazeneca: 'AZN', novartis: 'NVS', sanofi: 'SNY', hsbc: 'HSBC', netease: 'NTES', infosys: 'INFY', roblox: 'RBLX',
    cloudflare: 'NET', snowflake: 'SNOW', microstrategy: 'MSTR', strategy: 'MSTR', rivian: 'RIVN', sofi: 'SOFI', 'rocket lab': 'RKLB',
    google: 'GOOGL', alphabet: 'GOOGL', facebook: 'META', instagram: 'META', whatsapp: 'META', berkshire: 'BRK-B', 'coca cola': 'KO', 'coca-cola': 'KO', cocacola: 'KO',
    walmart: 'WMT', disney: 'DIS', netflix: 'NFLX', mcdonald: 'MCD', starbucks: 'SBUX', nike: 'NKE', visa: 'V', mastercard: 'MA', paypal: 'PYPL', intel: 'INTC',
    broadcom: 'AVGO', oracle: 'ORCL', salesforce: 'CRM', adobe: 'ADBE', palantir: 'PLTR', coinbase: 'COIN', uber: 'UBER', airbnb: 'ABNB', boeing: 'BA', pfizer: 'PFE'
};
/** Kode dari kata pencarian (kode langsung atau nama populer), atau null. */
export function kodeDari(q: string): string | null {
    const t = q.trim().toLowerCase(); if (!t) return null;
    if (ALIAS_SAHAM[t]) return ALIAS_SAHAM[t];
    const k = Object.keys(ALIAS_SAHAM).find((a) => a.length >= 4 && t.startsWith(a)); if (k) return ALIAS_SAHAM[k];
    return /^[a-z]{1,5}(-[a-z])?$/.test(t) ? t.toUpperCase() : null;
}
/** Cocokkan baris saham dengan kata pencarian (kode, nama, atau nama populer). */
export function cocokCari(b: { s: string; nama: string }, q: string) {
    const qq = q.trim().toUpperCase(); if (!qq) return true;
    if (b.s.includes(qq) || b.nama.toUpperCase().includes(qq)) return true;
    const k = ALIAS_SAHAM[q.trim().toLowerCase()] || Object.entries(ALIAS_SAHAM).find(([a]) => a.length >= 4 && q.trim().toLowerCase().startsWith(a))?.[1];
    return !!k && b.s === k;
}
