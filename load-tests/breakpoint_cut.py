#!/usr/bin/env python3
"""Punto de ruptura de un resumen de breakpoint.js: tasa de llegada, error y p95 por escalon.

Uso:  python3 breakpoint_cut.py <resumen.json> [LOAD_SCALE] [p95_ms]
      LOAD_SCALE se toma del nombre del archivo (production-breakpoint-0.05-...) si no se pasa.

breakpoint.js sube la tasa de llegada en 6 escalones de 1 min y etiqueta cada peticion con su
escalon (s1..s6). El corte por abortOnFail usa el error ACUMULADO y llega tarde, asi que el
punto de ruptura real es el primer escalon cuyo error es >= 1 % o cuyo p95 supera el umbral.
`ramping-arrival-rate` cuenta ITERACIONES por segundo y cada iteracion hace 6 peticiones, por
eso se muestra tambien el equivalente en req/s (x6).
"""
import json
import math
import re
import sys

STAGE_TARGETS = [500, 1500, 3000, 5000, 8000, 10000]  # iguales a breakpoint.js
START_RATE = 500
REQS_PER_ITERATION = 6
ERROR_LIMIT = 1.0  # %


def scaled(n, scale):
    return 0 if n == 0 else max(1, math.floor(n * scale + 0.5))  # igual que Math.round de JS


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    scale = float(sys.argv[2]) if len(sys.argv) > 2 else None
    if scale is None:
        m = re.search(r"breakpoint-([\d.]+)-", path)
        scale = float(m.group(1)) if m else 1.0
    p95_limit = float(sys.argv[3]) if len(sys.argv) > 3 else 500.0

    metrics = json.load(open(path))["metrics"]
    total = metrics["http_reqs"]
    elapsed = total["count"] / total["rate"] if total.get("rate") else float("nan")
    print(f"{path}\nLOAD_SCALE={scale}  duracion ~{elapsed:.0f} s  peticiones={total['count']}  "
          f"error acumulado={metrics['http_req_failed']['value'] * 100:.2f} %\n")
    if not any(k.startswith("http_reqs{stage:") for k in metrics):
        print("Este resumen no trae datos por escalon (corrida anterior a las etiquetas de stage en\n"
              "breakpoint.js): solo hay el error acumulado. Repite la corrida con el script actual.")
        return

    print(f"{'escalon':8} {'objetivo it/s':>16} {'objetivo req/s':>16} {'peticiones':>11} {'error %':>8} {'p95 ms':>8}")

    prev = scaled(START_RATE, scale)
    first_bad = None
    for i, target in enumerate(STAGE_TARGETS, start=1):
        end = scaled(target, scale)
        reqs = metrics.get(f"http_reqs{{stage:s{i}}}", {}).get("count", 0)
        if reqs:
            err = metrics.get(f"http_req_failed{{stage:s{i}}}", {}).get("value", 0) * 100
            p95 = metrics.get(f"http_req_duration{{stage:s{i}}}", {}).get("p(95)", float("nan"))
            bad = err >= ERROR_LIMIT or p95 > p95_limit
            if bad and first_bad is None:
                first_bad = (i, prev, end)
            print(f"s{i:<7} {prev:>6}->{end:<8} {prev * REQS_PER_ITERATION:>6}->{end * REQS_PER_ITERATION:<8} "
                  f"{reqs:>11} {err:>8.2f} {p95:>8.1f}{'  <- supera el umbral' if bad else ''}")
        else:
            print(f"s{i:<7} {prev:>6}->{end:<8} {prev * REQS_PER_ITERATION:>6}->{end * REQS_PER_ITERATION:<8} {'(no se alcanzo)':>11}")
        prev = end

    print()
    if first_bad:
        i, lo, hi = first_bad
        print(f"Punto de ruptura: escalon s{i}, con la tasa de llegada entre {lo} y {hi} iteraciones/s "
              f"({lo * REQS_PER_ITERATION}-{hi * REQS_PER_ITERATION} req/s). Resolucion: 1 escalon (1 min).")
    else:
        print("Ningun escalon supero el umbral (error >= 1 % o p95 > umbral): subir LOAD_SCALE.")


if __name__ == "__main__":
    main()
