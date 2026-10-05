#!/usr/bin/env python3
"""Copia resumenes de k6 de results/ (ignorado por git) a una carpeta versionada, sin el JWT.

Uso:  python3 redact_results.py <destino> <resumen.json> [<resumen.json> ...]
      p. ej.  python3 redact_results.py production results/production-spike-*.json

`setup_data` guarda la cabecera Cookie con el access_token del admin del entorno probado: se
reemplaza por <redactado> antes de copiar. Falla si el resultado aun contiene un JWT.
"""
import json
import os
import re
import sys


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    dest = sys.argv[1]
    os.makedirs(dest, exist_ok=True)
    for path in sys.argv[2:]:
        data = json.load(open(path))
        cookie = data.get("setup_data", {}).get("headers", {}).get("Cookie")
        if cookie:
            data["setup_data"]["headers"]["Cookie"] = "access_token=<redactado>"
        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        if re.search(r"eyJ[A-Za-z0-9_-]{10,}", text):
            sys.exit(f"{path}: aun contiene algo con forma de JWT, no se copia")
        out = os.path.join(dest, os.path.basename(path))
        open(out, "w").write(text)
        print(f"{path} -> {out}")


if __name__ == "__main__":
    main()
