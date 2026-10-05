"""Genera las gráficas de producción, las locales y la comparativa local vs producción.

Uso (desde load-tests/):  python3 generar_graficas.py   (requiere matplotlib)
Lee local/results-*.json, production/production-*.json (corridas con el nginx corregido) y
production/antes-keepalive/production-*.json (corridas previas a la corrección del nginx, que se
dibujan en gris como referencia), además de production/recursos-*.csv y local/recursos-*.csv
(salida de monitor.sh). Escribe en production/graficas/, local/graficas/ y comparativa/.
"""
import csv
import glob
import json
import os
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

AZUL, NARANJA, GRIS, ROJO = "#1565c0", "#ef6c00", "#9e9e9e", "#c62828"
DESPUES, ANTES = AZUL, GRIS
LEYENDA = [Patch(color=ANTES, label="antes de la corrección del nginx"), Patch(color=DESPUES, label="con keepalive")]


def metrics(path):
    return json.load(open(path))["metrics"]


def row(path):
    m = metrics(path)
    d = m["http_req_duration"]
    pico = m.get("http_req_failed{phase:peak}")
    n_pico = pico["passes"] + pico["fails"] if pico else None
    return {
        "vus": m["vus_max"]["max"], "rps": m["http_reqs"]["rate"],
        "rps_pico": n_pico / PICO_S if n_pico else None,
        "avg": d["avg"], "p90": d["p(90)"], "p95": d["p(95)"], "p99": d.get("p(99)"), "med": d["med"],
        "err": m["http_req_failed"]["value"] * 100, "m": m,
    }


PICO_S = 105  # duración de la fase de pico de spike.js (10 s + 1 min 30 s + 5 s)


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


def cargar(carpeta, fuente):
    """{(tipo, escala): fila} de los resúmenes de producción de una carpeta."""
    out = {}
    for f in sorted(glob.glob(f"{carpeta}/production-*.json")):
        t = re.search(r"production-(\w+?)-([\d.]+)-", f)
        if t and t.group(1) != "smoke":
            r = row(f)
            r["fuente"] = fuente
            out[(t.group(1), t.group(2))] = r
    return out


despues = cargar("production", "despues")
antes = cargar("production/antes-keepalive", "antes")
todas = {("antes",) + k: v for k, v in antes.items()}
todas.update({("despues",) + k: v for k, v in despues.items()})
G = "production/graficas"


def etiqueta(clave, r):
    """sostenida 75 VUs / spike 503 VUs ... con la marca de antes/después."""
    _, tipo, _ = clave
    nombre = {"sustained": "sostenida", "spike": "spike", "breakpoint": "breakpoint"}[tipo]
    return f"{nombre}\n{r['vus']} VUs"


def ordenar(tipo=None):
    ks = [k for k in todas if tipo is None or k[1] == tipo]
    return sorted(ks, key=lambda k: (k[1], todas[k]["vus"], k[0] != "antes"))


# --- producción: sostenida (throughput, p95 y p99), antes y después del keepalive ---
ks = ordenar("sustained")
for nombre, clave, fmt, titulo in [
    ("throughput", "rps", "{:.0f} req/s", "Throughput en producción (carga sostenida)"),
    ("p95", "p95", "{:.0f} ms", "Latencia p95 en producción (carga sostenida)"),
    ("p99", "p99", "{:.0f} ms", "Latencia p99 en producción (carga sostenida)"),
]:
    fig, ax = plt.subplots(figsize=(9, 4.2))
    colores = [DESPUES if k[0] == "despues" else ANTES for k in ks]
    barras(ax, [etiqueta(k, todas[k]) for k in ks], [todas[k][clave] for k in ks], colores, fmt, titulo)
    if clave != "rps":
        ax.axhline(500, color=ROJO, ls="--", lw=1)
        ax.text(len(ks) - 0.5, 500, "umbral 500 ms", color=ROJO, ha="right", va="bottom", fontsize=8)
    ax.legend(handles=LEYENDA, loc="upper left", fontsize=8)
    guardar(fig, G, nombre)

# --- producción: tasa de error de todas las corridas ---
ks = ordenar()
fig, ax = plt.subplots(figsize=(12, 4.2))
colores = [DESPUES if k[0] == "despues" else ANTES for k in ks]
barras(ax, [etiqueta(k, todas[k]) for k in ks], [todas[k]["err"] for k in ks], colores, "{:.2f} %", "Tasa de error en producción (todas las corridas)")
ax.axhline(1, color=ROJO, ls="--", lw=1)
ax.text(len(ks) - 0.5, 1, "umbral 1 %", color=ROJO, ha="right", va="bottom", fontsize=8)
ax.set_ylabel("% de peticiones fallidas")
ax.legend(handles=LEYENDA, loc="upper left", fontsize=8)
guardar(fig, G, "error_rate")

# --- producción: spike (p95, error y throughput del pico), antes y después ---
ks = ordenar("spike")
if ks:
    fig, axs = plt.subplots(1, 3, figsize=(13, 4.2))
    colores = [DESPUES if k[0] == "despues" else ANTES for k in ks]
    et = [f"{todas[k]['vus']} VUs" for k in ks]
    pico = lambda r, c: r["m"].get(f"http_req_duration{{phase:peak}}", r["m"]["http_req_duration"])[c]
    barras(axs[0], et, [todas[k]["rps_pico"] or todas[k]["rps"] for k in ks], colores, "{:.0f}", "Throughput del pico (req/s)")
    barras(axs[1], et, [pico(todas[k], "p(95)") for k in ks], colores, "{:.0f}", "p95 del pico (ms)")
    axs[1].axhline(1000, color=ROJO, ls="--", lw=1)
    barras(axs[2], et, [todas[k]["err"] for k in ks], colores, "{:.2f} %", "Error")
    axs[2].axhline(1, color=ROJO, ls="--", lw=1)
    fig.legend(handles=LEYENDA, loc="lower center", ncol=2, fontsize=9)
    fig.suptitle("Spike en producción (umbral p95: 1000 ms; error: 1 %)", fontweight="bold")
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    guardar(fig, G, "spike")

# --- producción: recuperación tras el spike (escenario recovery) ---
rec = []
for (fuente, tipo, esc), r in sorted(todas.items(), key=lambda kv: kv[1]["vus"]):
    m = r["m"]
    if tipo == "spike" and "http_req_duration{phase:recovery}" in m:
        rec.append((r["vus"], m["http_req_duration{phase:peak}"]["p(95)"], m["http_req_duration{phase:recovery}"]["p(95)"],
                    m["http_req_failed{phase:peak}"]["value"] * 100, m["http_req_failed{phase:recovery}"]["value"] * 100))
if rec:
    fig, axs = plt.subplots(1, 2, figsize=(10, 4))
    x = range(len(rec))
    for ax, i, titulo, fmt in [(axs[0], 1, "p95 (ms)", "{:.0f}"), (axs[1], 3, "Error (%)", "{:.2f}")]:
        for k, (color, etiqueta_) in enumerate([(NARANJA, "pico"), (AZUL, "recuperación")]):
            vals = [r_[i + k] for r_ in rec]
            b = ax.bar([j + (k - 0.5) * 0.35 for j in x], vals, width=0.35, color=color, label=etiqueta_)
            for r_, v in zip(b, vals):
                ax.text(r_.get_x() + r_.get_width() / 2, v, fmt.format(v), ha="center", va="bottom", fontsize=8)
        ax.set_xticks(list(x))
        ax.set_xticklabels([f"{r_[0]} VUs" for r_ in rec])
        ax.set_title(titulo, fontweight="bold")
        ax.legend()
        ax.grid(axis="y", alpha=0.3)
    fig.suptitle("Spike en producción: pico vs. fase de recuperación (5 VUs, 2 min)", fontweight="bold")
    guardar(fig, G, "recuperacion")

# --- producción: breakpoint por escalón (throughput efectivo y p95) ---
for f in sorted(glob.glob("production/production-breakpoint-*.json")):
    m = metrics(f)
    escala = float(re.search(r"breakpoint-([\d.]+)-", f).group(1))
    objetivo = [500, 1500, 3000, 5000, 8000, 10000]
    esc = lambda n: max(1, int(n * escala + 0.5))
    stages = [i for i in range(1, 7) if m.get(f"http_reqs{{stage:s{i}}}", {}).get("count", 0)]
    if not stages:
        continue
    fig, axs = plt.subplots(1, 2, figsize=(12, 4.2))
    et = [f"s{i}\n(→{esc(objetivo[i - 1]) * 6} req/s)" for i in stages]
    efectivos = [m[f"http_reqs{{stage:s{i}}}"]["count"] / 60 for i in stages]
    barras(axs[0], et, efectivos, AZUL, "{:.0f}", "Throughput efectivo por escalón (req/s)")
    p95s = [m[f"http_req_duration{{stage:s{i}}}"]["p(95)"] for i in stages]
    barras(axs[1], et, p95s, [ROJO if v > 500 else AZUL for v in p95s], "{:.0f} ms", "p95 por escalón")
    axs[1].axhline(500, color=ROJO, ls="--", lw=1)
    fig.suptitle("Breakpoint en producción: el p95 se dispara cuando el throughput deja de crecer", fontweight="bold")
    guardar(fig, G, "breakpoint_escalones")

# --- CPU, memoria y TIME_WAIT durante cada corrida (monitor.sh), local y producción ---
for f in sorted(glob.glob("production/recursos-*.csv") + glob.glob("local/recursos-*.csv")):
    carpeta_salida = os.path.join(os.path.dirname(f), "graficas")
    filas = list(csv.DictReader(open(f)))
    if len(filas) < 2:
        continue
    t = [(i * 1.0) for i in range(len(filas))]
    t0 = filas[0]["ts_utc"]
    num = lambda c: [float(r[c]) if r.get(c) not in (None, "") else float("nan") for r in filas]
    con_bd = any(r.get("db_connections") not in (None, "") for r in filas)
    fig, axs = plt.subplots(4 if con_bd else 3, 1, figsize=(10, 9 if con_bd else 7), sharex=True)
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
    if con_bd:
        axs[3].plot(t, num("db_cpu_pct"), color="#2e7d32", label="CPU de la BD (%)")
        axs[3].set_ylabel("BD: CPU (%)")
        ax2 = axs[3].twinx()
        ax2.plot(t, num("db_connections"), color="#c62828", label="conexiones abiertas")
        ax2.set_ylabel("conexiones abiertas")
        axs[3].legend(loc="upper left"); ax2.legend(loc="upper right")
    axs[-1].set_xlabel(f"muestras (desde {t0})")
    for ax in axs:
        ax.grid(alpha=0.3)
    nombre = os.path.basename(f)[:-4]
    fig.suptitle(f"Recursos durante la prueba: {nombre}", fontweight="bold")
    guardar(fig, carpeta_salida, nombre)

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


# --- comparativa local vs producción (sostenida, mismos 150 VUs) ---
loc = row("local/results-sustained.json")
ref = despues.get(("sustained", "1"))
if ref:
    fig, axs = plt.subplots(1, 4, figsize=(14, 4))
    for ax, (clave, fmt, titulo) in zip(axs, [
        ("rps", "{:.0f}", "Throughput (req/s)"),
        ("p95", "{:.1f}", "p95 (ms)"),
        ("p99", "{:.1f}", "p99 (ms)"),
        ("err", "{:.2f} %", "Error"),
    ]):
        barras(ax, [f"Local\n{loc['vus']} VUs", f"Producción\n{ref['vus']} VUs"], [loc[clave], ref[clave]], [AZUL, NARANJA], fmt, titulo)
        if clave == "err":
            ax.set_ylim(0, 1.2)
            ax.axhline(1, color=ROJO, ls="--", lw=1)
            ax.text(1.4, 1, "umbral 1 %", color=ROJO, ha="right", va="bottom", fontsize=8)
    fig.suptitle("Carga sostenida: local vs producción (150 VUs, nginx con keepalive)", fontweight="bold")
    guardar(fig, "comparativa", "sustained_local_vs_produccion")
print("OK", sorted(despues), sorted(antes))
