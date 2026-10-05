#!/usr/bin/env python3
"""Promedio y maximo de cada recurso durante la meseta, a partir del CSV de monitor.sh.

Uso:  python3 resumen_recursos.py <recursos.csv> [desde_UTC hasta_UTC]
      p. ej.  python3 resumen_recursos.py local/recursos-sostenida-1.0.csv 2026-10-05T03:02:13Z 2026-10-05T03:09:13Z
Sin ventana usa todo el CSV. La ventana de la meseta de sustained.js es: inicio de k6 + 3 min
hasta + 10 min (3 min de subida, 7 min de meseta).
"""
import csv
import statistics as st
import sys

COLS = [
    ("host_cpu_pct", "CPU de la VM (%)"),
    ("host_mem_used_mb", "Memoria usada de la VM (MB)"),
    ("backend_cpu_pct", "CPU del backend (% de un nucleo)"),
    ("backend_mem_mb", "Memoria del backend (MB)"),
    ("nginx_cpu_pct", "CPU del nginx (%)"),
    ("nginx_mem_mb", "Memoria del nginx (MB)"),
    ("nginx_timewait", "Sockets TIME_WAIT del nginx"),
    ("db_cpu_pct", "CPU de la BD (%)"),
    ("db_mem_mb", "Memoria de la BD (MB)"),
    ("db_connections", "Conexiones abiertas a la BD (pool)"),
]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rows = list(csv.DictReader(open(sys.argv[1])))
    if len(sys.argv) >= 4:
        rows = [r for r in rows if sys.argv[2] <= r["ts_utc"] <= sys.argv[3]]
    print(f"{len(rows)} muestras ({rows[0]['ts_utc']} -> {rows[-1]['ts_utc']})\n" if rows else "sin muestras en la ventana")
    print("| Recurso | Promedio | Maximo |\n|---|---:|---:|")
    for col, nombre in COLS:
        vals = [float(r[col]) for r in rows if r.get(col) not in (None, "")]
        if vals:
            print(f"| {nombre} | {st.mean(vals):.1f} | {max(vals):.1f} |")


if __name__ == "__main__":
    main()
