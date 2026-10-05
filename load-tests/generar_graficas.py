"""Genera las gráficas de producción y la comparativa local vs producción.

Uso (desde load-tests/):  python3 generar_graficas.py   (requiere matplotlib)
Lee local/results-*.json y production/production-*.json (sustained, spike y
breakpoint) y production/recursos-*.csv (salida de monitor.sh); escribe en
production/graficas/, local/graficas/ (sostenida y spike) y comparativa/.
"""
import csv
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

# --- producción: recuperación tras el spike (spike.js con escenario "recovery") ---
rec = []
for f in sorted(glob.glob("production/production-spike-*.json")):
    m = metrics(f)
    if "http_req_duration{phase:recovery}" in m:
        esc = re.search(r"spike-([\d.]+)-", f).group(1)
        rec.append((esc, m["http_req_duration{phase:peak}"]["p(95)"], m["http_req_duration{phase:recovery}"]["p(95)"],
                    m["http_req_failed{phase:peak}"]["value"] * 100, m["http_req_failed{phase:recovery}"]["value"] * 100))
if rec:
    fig, axs = plt.subplots(1, 2, figsize=(10, 4))
    x = range(len(rec))
    for ax, i, titulo, fmt in [(axs[0], 1, "p95 (ms)", "{:.0f}"), (axs[1], 3, "Error (%)", "{:.1f}")]:
        for k, (color, etiqueta, off) in enumerate([(NARANJA, "pico", 1), (AZUL, "recuperación", 2)]):
            vals = [r[i + k] for r in rec]
            b = ax.bar([j + (k - 0.5) * 0.35 for j in x], vals, width=0.35, color=color, label=etiqueta)
            for r_, v in zip(b, vals):
                ax.text(r_.get_x() + r_.get_width() / 2, v, fmt.format(v), ha="center", va="bottom", fontsize=8)
        ax.set_xticks(list(x))
        ax.set_xticklabels([f"LOAD_SCALE {r[0]}" for r in rec])
        ax.set_title(titulo, fontweight="bold")
        ax.legend()
        ax.grid(axis="y", alpha=0.3)
    fig.suptitle("Spike en producción: pico vs. fase de recuperación", fontweight="bold")
    guardar(fig, "production/graficas", "recuperacion")

# --- producción: CPU, memoria y TIME_WAIT durante cada corrida (monitor.sh) ---
for f in sorted(glob.glob("production/recursos-*.csv")):
    filas = list(csv.DictReader(open(f)))
    if len(filas) < 2:
        continue
    t = [(i * 1.0) for i in range(len(filas))]
    t0 = filas[0]["ts_utc"]
    num = lambda c: [float(r[c]) if r.get(c) not in (None, "") else float("nan") for r in filas]
    fig, axs = plt.subplots(3, 1, figsize=(10, 7), sharex=True)
    for c, color, lab in [("host_cpu_pct", GRIS, "VM"), ("backend_cpu_pct", AZUL, "backend"), ("nginx_cpu_pct", NARANJA, "nginx")]:
        axs[0].plot(t, num(c), color=color, label=lab)
    axs[0].set_ylabel("CPU (%)"); axs[0].legend(loc="upper left")
    axs[1].plot(t, num("backend_mem_mb"), color=AZUL, label="backend")
    axs[1].plot(t, num("nginx_mem_mb"), color=NARANJA, label="nginx")
    axs[1].axhline(1024, color="#c62828", ls="--", lw=1)
    axs[1].text(0, 1024, "límite del backend (1 GB)", color="#c62828", fontsize=8, va="bottom")
    axs[1].set_ylabel("Memoria (MB)"); axs[1].legend(loc="center left")
    axs[2].plot(t, num("nginx_timewait"), color="#6a1b9a")
    axs[2].set_ylabel("TIME_WAIT (nginx)")
    axs[2].set_xlabel(f"muestras (desde {t0})")
    for ax in axs:
        ax.grid(alpha=0.3)
    nombre = os.path.basename(f)[:-4]
    fig.suptitle(f"Recursos durante la prueba: {nombre}", fontweight="bold")
    guardar(fig, "production/graficas", nombre)

# --- local: sostenida y spike (throughput, latencia y error) ---
# En el spike se usa solo la fase de pico (phase:peak, 105 s) para que la recuperación no
# diluya el throughput; si el JSON es de la versión anterior del script, se usa el total.
PICO_S = 105
ls_m, lp_m = metrics("local/results-sustained.json"), metrics("local/results-spike.json")
if "http_req_duration{phase:peak}" in lp_m:
    lp_dur, lp_fail = lp_m["http_req_duration{phase:peak}"], lp_m["http_req_failed{phase:peak}"]
    lp_rps = (lp_fail["passes"] + lp_fail["fails"]) / PICO_S
else:
    lp_dur, lp_fail, lp_rps = lp_m["http_req_duration"], lp_m["http_req_failed"], lp_m["http_reqs"]["rate"]
loc_esc = [
    ("Sostenida", ls_m["http_reqs"]["rate"], ls_m["http_req_duration"], ls_m["http_req_failed"]["value"] * 100),
    ("Spike (pico)", lp_rps, lp_dur, lp_fail["value"] * 100),
]
fig, ax = plt.subplots(figsize=(7.5, 4))
barras(ax, [e[0] for e in loc_esc], [e[1] for e in loc_esc], AZUL, "{:.0f} req/s", "Throughput por escenario (local)")
guardar(fig, "local/graficas", "throughput")
fig, ax = plt.subplots(figsize=(8.5, 4))
for k, (clave, color) in enumerate([("avg", AZUL), ("p(90)", "#f4b183"), ("p(95)", "#a9d18e"), ("p(99)", "#f0d9a5")]):
    vals = [e[2][clave] for e in loc_esc]
    b = ax.bar([j + (k - 1.5) * 0.2 for j in range(len(loc_esc))], vals, width=0.2, color=color, label=clave.replace("avg", "promedio"))
    for r_, v in zip(b, vals):
        ax.text(r_.get_x() + r_.get_width() / 2, v, f"{v:.1f}", ha="center", va="bottom", fontsize=8)
ax.set_xticks(range(len(loc_esc)))
ax.set_xticklabels([e[0] for e in loc_esc])
ax.set_title("Latencia (ms) por escenario (local)", fontweight="bold")
ax.legend()
ax.grid(axis="y", alpha=0.3)
guardar(fig, "local/graficas", "latencia")
fig, ax = plt.subplots(figsize=(7.5, 4))
barras(ax, [e[0] for e in loc_esc], [e[3] for e in loc_esc], "#c62828", "{:.2f} %", "Tasa de error por escenario (local)")
ax.set_ylim(0, 1)
ax.axhline(1, color=GRIS, ls="--", lw=1)
ax.text(len(loc_esc) - 0.5, 1, "umbral 1 %", color=GRIS, ha="right", va="bottom", fontsize=8)
guardar(fig, "local/graficas", "error_rate")

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
