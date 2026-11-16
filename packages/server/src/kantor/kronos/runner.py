#!/usr/bin/env python3
"""
Pekerja Kronos untuk Kantor Virtual.
Kronos = model dasar (foundation model) sumber terbuka untuk candlestick (github.com/shiyu-coder/Kronos, lisensi MIT).
Proses ini hidup lama: membaca satu permintaan JSON per baris dari stdin, menulis satu jawaban JSON per baris ke stdout.
Permintaan: {"id", "bars": [{t,o,h,l,c,v}], "y_t": [iso...], "n": jumlah jalur, "T", "top_p"}
Jawaban:    {"id", "ok", "paths": [[[o,h,l,c], ...pred_len] ... n], "detik"}
"""
import sys, os, json, time

REPO = os.environ.get("KRONOS_REPO", os.path.join(os.path.dirname(os.path.abspath(__file__)), "repo"))
MODEL = os.environ.get("KRONOS_MODEL", "NeoQuasar/Kronos-small")
TOKENIZER = os.environ.get("KRONOS_TOKENIZER", "NeoQuasar/Kronos-Tokenizer-base")
MAX_CTX = int(os.environ.get("KRONOS_MAX_CONTEXT", "512"))
sys.path.insert(0, REPO)

def kirim(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()

try:
    import numpy as np, pandas as pd, torch
    from model import Kronos, KronosTokenizer, KronosPredictor
    torch.set_num_threads(max(1, int(os.environ.get("KRONOS_THREADS", str(os.cpu_count() or 2)))))
    t0 = time.time()
    if os.environ.get("KRONOS_ACAK") == "1":  # hanya untuk uji alur tanpa mengunduh bobot (hasil TIDAK bermakna)
        tok = KronosTokenizer(d_in=6, d_model=256, n_heads=4, ff_dim=512, n_enc_layers=4, n_dec_layers=4, ffn_dropout_p=0.0, attn_dropout_p=0.0, resid_dropout_p=0.0, s1_bits=10, s2_bits=10, beta=0.05, gamma0=1.0, gamma=1.1, zeta=0.05, group_size=5)
        mdl = Kronos(s1_bits=10, s2_bits=10, n_layers=8, d_model=512, n_heads=8, ff_dim=1024, ffn_dropout_p=0.0, attn_dropout_p=0.0, resid_dropout_p=0.0, token_dropout_p=0.0, learn_te=True)
    else:
        tok = KronosTokenizer.from_pretrained(TOKENIZER)
        mdl = Kronos.from_pretrained(MODEL)
    tok.eval(); mdl.eval()
    pred = KronosPredictor(mdl, tok, device="cpu", max_context=MAX_CTX)
    kirim({"siap": True, "model": MODEL, "muat_detik": round(time.time() - t0, 1), "param_juta": round(sum(p.numel() for p in mdl.parameters()) / 1e6, 1)})
except Exception as e:  # noqa
    kirim({"siap": False, "error": f"{type(e).__name__}: {e}"})
    sys.exit(1)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        q = json.loads(line)
        t0 = time.time()
        bars = q["bars"]; y_t = q["y_t"]; n = max(1, min(64, int(q.get("n", 20))))
        pl = len(y_t)
        bars = bars[-max(32, MAX_CTX - pl):]  # konteks + prediksi tidak melebihi jendela model
        df = pd.DataFrame({"open": [b["o"] for b in bars], "high": [b["h"] for b in bars], "low": [b["l"] for b in bars], "close": [b["c"] for b in bars], "volume": [float(b.get("v") or 0) for b in bars]})
        df["amount"] = df["volume"] * df[["open", "high", "low", "close"]].mean(axis=1)
        xt = pd.Series(pd.to_datetime([b["t"] for b in bars])); yt = pd.Series(pd.to_datetime(y_t))
        # n jalur terpisah = batch berisi n salinan, masing-masing satu sampel (bukan dirata-rata)
        out = pred.predict_batch([df] * n, [xt] * n, [yt] * n, pred_len=pl, T=float(q.get("T", 1.0)), top_p=float(q.get("top_p", 0.9)), sample_count=1, verbose=False)
        paths = [[[round(float(r.open), 4), round(float(r.high), 4), round(float(r.low), 4), round(float(r.close), 4)] for r in d.itertuples()] for d in out]
        kirim({"id": q.get("id"), "ok": True, "paths": paths, "konteks": len(bars), "detik": round(time.time() - t0, 1)})
    except Exception as e:  # noqa
        kirim({"id": (q.get("id") if isinstance(q, dict) else None), "ok": False, "error": f"{type(e).__name__}: {e}"})
