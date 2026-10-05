#!/usr/bin/env python3
"""Imprime, de uno o mas resumenes de k6, los numeros que van en las tablas de la Fase 4.

Uso:  python3 resumen_corrida.py production/production-sustained-*.json
Por corrida: VUs, peticiones, req/s, promedio, p90/p95/p99, error, conteo por codigo HTTP
(si el resumen trae `http_reqs{status:N}`) y, en spike, pico vs. recuperacion.
"""
import json
import sys


def g(m, k, f, default=float("nan")):
    return m.get(k, {}).get(f, default)


for path in sys.argv[1:]:
    m = json.load(open(path))["metrics"]
    d = m["http_req_duration"]
    print(f"\n== {path}")
    print(f"VUs max {g(m, 'vus_max', 'max'):.0f} | peticiones {m['http_reqs']['count']} | {m['http_reqs']['rate']:.1f} req/s")
    print(f"prom {d['avg']:.1f} | med {d['med']:.1f} | p90 {d['p(90)']:.1f} | p95 {d['p(95)']:.1f} | "
          f"p99 {d.get('p(99)', float('nan')):.1f} | max {d['max']:.0f} ms | error {m['http_req_failed']['value'] * 100:.2f} %")
    codigos = {k[len("http_reqs{status:"):-1]: v["count"] for k, v in m.items() if k.startswith("http_reqs{status:")}
    if codigos:
        print("codigos HTTP: " + ", ".join(f"{c}: {n}" for c, n in sorted(codigos.items(), key=lambda kv: -kv[1]) if n))
    else:
        print("codigos HTTP: este resumen no los desglosa (corrida anterior a statusThresholds)")
    if "http_req_duration{phase:recovery}" in m:
        for fase in ("peak", "recovery"):
            print(f"  fase {fase:8}: p95 {m[f'http_req_duration{{phase:{fase}}}']['p(95)']:.1f} ms | "
                  f"error {m[f'http_req_failed{{phase:{fase}}}']['value'] * 100:.2f} %")
