"""Genera las gráficas de producción y la comparativa local vs producción.

Uso (desde load-tests/):  python3 generar_graficas.py   (requiere matplotlib)
Lee local/results-*.json y production/production-*.json (sustained, spike y
breakpoint); escribe en production/graficas/ y comparativa/.
"""
import glob
import json
import os
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

AZUL, NARANJA, GRIS = "#1565c0", "#ef6c00", "#9e9e9e"


def metrics(path):
    return json.load(open(path))["metrics"]


def row(path):
    m = metrics(path)
    d = m["http_req_duration"]
    return {
        "vus": m["vus_max"]["max"], "rps": m["http_reqs"]["rate"],
        "p95": d["p(95)"], "p99": d.get("p(99)"), "med": d["med"],
        "err": m["http_req_failed"]["value"] * 100,
    }


def barras(ax, etiquetas, valores, color, fmt, titulo):
    b = ax.bar(etiquetas, valores, color=color, width=0.6)
    for r, v in zip(b, valores):
        ax.text(r.get_x() + r.get_width() / 2, v, fmt.format(v), ha="center", va="bottom", fontsize=9, fontweight="bold")
    ax.set_title(titulo, fontweight="bold")
    ax.grid(axis="y", alpha=0.3)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)


def guardar(fig, carpeta, nombre):
    os.makedirs(carpeta, exist_ok=True)
    fig.tight_layout()
    for ext in ("png", "svg"):
        fig.savefig(f"{carpeta}/{nombre}.{ext}", dpi=110)
    plt.close(fig)


# --- producción: sustained por LOAD_SCALE ---
prod = {}
for f in sorted(glob.glob("production/production-sustained-*.json")):
    prod[re.search(r"sustained-([\d.]+)-", f).group(1)] = row(f)
escalas = sorted(prod, key=float)
et = [f"{e}\n({prod[e]['vus']} VUs)" for e in escalas]

for nombre, clave, fmt, titulo, color in [
    ("throughput", "rps", "{:.0f} req/s", "Throughput en producción (sustained)", AZUL),
    ("p95", "p95", "{:.0f} ms", "Latencia p95 en producción (sustained)", NARANJA),
    ("p99", "p99", "{:.0f} ms", "Latencia p99 en producción (sustained)", NARANJA),
]:
    fig, ax = plt.subplots(figsize=(7.5, 4))
    barras(ax, et, [prod[e][clave] for e in escalas], color, fmt, titulo)
    ax.set_xlabel("LOAD_SCALE")
    if clave != "rps":
        ax.axhline(500, color="#c62828", ls="--", lw=1)
        ax.text(len(escalas) - 0.5, 500, "umbral 500 ms", color="#c62828", ha="right", va="bottom", fontsize=8)
    guardar(fig, "production/graficas", nombre)

# --- producción: spike, breakpoint y tasa de error de todas las corridas ---
extra = {}
for tipo in ("spike", "breakpoint"):
    for f in sorted(glob.glob(f"production/production-{tipo}-*.json")):
        extra[(tipo, re.search(rf"{tipo}-([\d.]+)-", f).group(1))] = row(f)

corridas = [(f"sustained\n{e}\n({prod[e]['vus']} VUs)", prod[e]) for e in escalas]
corridas += [(f"{t}\n{e}\n({r['vus']} VUs)", r) for (t, e), r in sorted(extra.items(), key=lambda kv: (kv[0][0], float(kv[0][1])))]

fig, ax = plt.subplots(figsize=(10, 4))
barras(ax, [c[0] for c in corridas], [c[1]["err"] for c in corridas], "#c62828", "{:.2f} %", "Tasa de error en producción (todas las corridas)")
ax.axhline(1, color=GRIS, ls="--", lw=1)
ax.text(len(corridas) - 0.5, 1, "umbral 1 %", color=GRIS, ha="right", va="bottom", fontsize=8)
ax.set_ylabel("% de peticiones fallidas")
guardar(fig, "production/graficas", "error_rate")

fig, axs = plt.subplots(1, 3, figsize=(12, 4))
sp = [(f"{e}\n({r['vus']} VUs)", r) for (t, e), r in sorted(extra.items(), key=lambda kv: float(kv[0][1])) if t == "spike"]
if sp:
    for ax, (clave, fmt, titulo) in zip(axs, [("rps", "{:.0f}", "Throughput (req/s)"), ("p95", "{:.0f}", "p95 (ms)"), ("err", "{:.1f} %", "Error")]):
        barras(ax, [c[0] for c in sp], [c[1][clave] for c in sp], AZUL if clave == "rps" else NARANJA, fmt, titulo)
    axs[1].axhline(1000, color="#c62828", ls="--", lw=1)
    fig.suptitle("Spike en producción por LOAD_SCALE (umbral p95: 1000 ms)", fontweight="bold")
    guardar(fig, "production/graficas", "spike")
else:
    plt.close(fig)

# --- comparativa local vs producción (sustained) ---
loc = row("local/results-sustained.json")
ref = prod[escalas[-1]]
fig, axs = plt.subplots(1, 3, figsize=(12, 4))
for ax, (clave, fmt, titulo) in zip(axs, [
    ("rps", "{:.0f}", "Throughput (req/s)"),
    ("p95", "{:.1f}", "p95 (ms)"),
    ("p99", "{:.1f}", "p99 (ms)"),
]):
    barras(ax, [f"Local\n{loc['vus']} VUs", f"Producción\n{ref['vus']} VUs"], [loc[clave], ref[clave]], AZUL, fmt, titulo)
    ax.bar_label  # noqa: B018
    bs = ax.patches
    bs[1].set_color(NARANJA)
fig.suptitle(f"Sustained: local (150 VUs) vs producción (LOAD_SCALE {escalas[-1]})", fontweight="bold")
guardar(fig, "comparativa", "sustained_local_vs_produccion")
print("OK", escalas, sorted(extra))
