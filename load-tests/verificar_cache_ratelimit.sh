#!/usr/bin/env bash
# Comprueba, con peticiones reales, dos mecanismos que las pruebas de carga no aislan:
#   1) Rate limiting del login (5 intentos fallidos por IP + usuario en una ventana de 60 s).
#   2) Cache Aside de las lineas de factura (Caffeine, TTL 300 s): primera lectura (fria) frente
#      a las siguientes (calientes) y, si hay un PostgreSQL en contenedor, cuantas consultas llegan
#      de verdad a la tabla delivery_invoice_line.
#
# Uso:  BASE_URL=http://localhost:8080 ADMIN_PASSWORD=... load-tests/verificar_cache_ratelimit.sh
#       BASE_URL=https://<ip-ec2> ADMIN_PASSWORD=... INSECURE_TLS=true load-tests/verificar_cache_ratelimit.sh
# Variables opcionales:
#   POSTGRES_CONTAINER  contenedor de PostgreSQL para contar consultas (solo con BD en contenedor)
#   SKIP_WAIT=1         omite la espera de 65 s de la ventana del rate limiting
#   ONLY=ratelimit|cache  ejecuta solo esa parte (por defecto, las dos). En produccion conviene
#                       el rate limiting desde fuera de la VM y la cache desde la propia VM, donde
#                       el RTT de red (~100 ms) no oculta la diferencia de milisegundos.
#   INVOICES            cuantas facturas leer (por defecto 20)
# El rate limiting usa usuarios inventados (usuario_prueba...): el limite es por IP + usuario, asi
# que NO bloquea al admin. Para que la caché arranque fria en un stack local, reinicia el backend.
set -euo pipefail

BASE="${BASE_URL:?define BASE_URL}"; BASE="${BASE%/}"
PW="${ADMIN_PASSWORD:?define ADMIN_PASSWORD}"
N="${INVOICES:-20}"
ONLY="${ONLY:-all}"
CURL=(curl -s); [ "${INSECURE_TLS:-}" = "true" ] && CURL+=(-k)

if [ "$ONLY" != cache ]; then
echo "=== 1) Rate limiting del login (5 intentos / 60 s por IP + usuario) ==="
login() { "${CURL[@]}" -o /dev/null -w "$1 -> %{http_code}\n" -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' -d "{\"username\":\"$2\",\"password\":\"incorrecta\"}"; }
for i in 1 2 3 4 5 6 7 8; do login "intento $i (usuario_prueba)" usuario_prueba; done
login "otro usuario, misma IP (otro_prueba)" otro_prueba
if [ "${SKIP_WAIT:-0}" != "1" ]; then
  echo "esperando 65 s a que se renueve la ventana..."; sleep 65
  login "tras 65 s (usuario_prueba)" usuario_prueba
fi
echo "esperado: 401 x5, 429 x3, 401 para otro usuario y 401 (no 429) tras la ventana"

fi

if [ "$ONLY" != ratelimit ]; then
echo
echo "=== 2) Cache Aside de las lineas de factura ==="
J="$(mktemp)"; trap 'rm -f "$J"' EXIT
"${CURL[@]}" -c "$J" -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$PW\"}" \
  "$BASE/api/v1/auth/login" -o /dev/null -w 'login admin -> %{http_code}\n'
IDS="$("${CURL[@]}" -b "$J" "$BASE/api/v1/driver/invoices?q=0" | grep -o '"id":[0-9]*' | cut -d: -f2 | head -"$N")"
echo "facturas publicadas leidas: $(echo "$IDS" | grep -c .)"
for _ in 1 2 3 4 5 6; do "${CURL[@]}" -b "$J" -o /dev/null "$BASE/api/v1/driver/invoices?q=0"; done  # calienta el stack HTTP, no la cache de lineas

stats() {
  [ -n "${POSTGRES_CONTAINER:-}" ] || { echo "-"; return; }
  docker exec "$POSTGRES_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select coalesce(idx_scan,0)+coalesce(seq_scan,0) from pg_stat_user_tables where relname = '"'"'delivery_invoice_line'"'"'"'
}
pasada() {
  for id in $IDS; do "${CURL[@]}" -b "$J" -o /dev/null -w '%{time_total}\n' "$BASE/api/v1/driver/invoices/$id/lines"; done \
    | sort -n | awk '{a[NR]=$1; s+=$1} END {printf "promedio %.2f ms | mediana %.2f ms | max %.2f ms (%d peticiones)\n", s/NR*1000, a[int((NR+1)/2)]*1000, a[NR]*1000, NR}'
}
# pg_stat_user_tables publica con hasta ~10 s de retraso: se espera 12 s antes de leerla
espera() { [ -n "${POSTGRES_CONTAINER:-}" ] && sleep 12 || true; }

espera; S0="$(stats)"
echo "-- pasada 1 (cache fria):";    pasada
echo "-- pasada 2 (cache caliente):"; pasada
echo "-- pasada 3 (cache caliente):"; pasada
if [ -n "${POSTGRES_CONTAINER:-}" ]; then
  espera; S1="$(stats)"
  echo "consultas a delivery_invoice_line durante las 3 pasadas ($(( $(echo "$IDS" | grep -c .) * 3 )) lecturas): +$((S1 - S0))"
  echo "esperado: una consulta por factura (solo la pasada fria) = $(echo "$IDS" | grep -c .)"
fi
echo "esperado: la pasada 1 es la mas lenta; las 2 y 3 salen de memoria (si la cache ya estaba caliente, reinicia el backend)"
fi
