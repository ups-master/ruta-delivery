#!/usr/bin/env bash
# Mide CPU y memoria mientras corre una prueba de carga. Se ejecuta EN la maquina que aloja
# el backend (la EC2), no en la que lanza k6: lanzalo ANTES de k6 y detenelo con Ctrl-C
# cuando k6 termine (deja ~1 min de margen a cada lado para ver el reposo).
#
# Uso: load-tests/monitor.sh <salida.csv> [intervalo_s]      (por defecto 5 s)
#   BACKEND_CONTAINER / NGINX_CONTAINER: nombres de los contenedores; si no se definen se
#   toma el primero cuyo nombre contiene "backend" / "nginx" (docker ps).
#
# Columnas del CSV (hora en UTC):
#   ts_utc, host_cpu_pct, host_mem_used_mb, backend_cpu_pct, backend_mem_mb, nginx_cpu_pct,
#   nginx_mem_mb, nginx_timewait
# nginx_timewait = sockets TCP en TIME_WAIT dentro del contenedor del nginx: si se acerca a
# ~28 000 (rango de puertos efimeros por defecto) el nginx se queda sin puertos para abrir
# conexiones hacia el backend (502 "connect() failed (99: Address not available)").
#
# Al detenerlo imprime: reinicios y OOMKilled del backend, y el conteo de codigos HTTP del log
# del nginx en la ventana medida (verificacion cruzada de la tabla de codigos de k6).
# La base de datos (RDS) no se mide aqui: CloudWatch, ver load-tests/README.md.
set -euo pipefail

OUT="${1:?uso: monitor.sh <salida.csv> [intervalo_s]}"
INTERVAL="${2:-5}"

find_container() { docker ps --format '{{.Names}}' | grep -i -m1 "$1" || true; }
BACKEND="${BACKEND_CONTAINER:-$(find_container backend)}"
NGINX="${NGINX_CONTAINER:-$(find_container nginx)}"
[ -n "$BACKEND" ] || { echo "No encuentro el contenedor del backend (define BACKEND_CONTAINER)." >&2; exit 1; }
[ -n "$NGINX" ] || { echo "No encuentro el contenedor del nginx (define NGINX_CONTAINER)." >&2; exit 1; }

START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "ts_utc,host_cpu_pct,host_mem_used_mb,backend_cpu_pct,backend_mem_mb,nginx_cpu_pct,nginx_mem_mb,nginx_timewait" > "$OUT"
echo "[monitor] backend=$BACKEND nginx=$NGINX intervalo=${INTERVAL}s inicio=$START -> $OUT (Ctrl-C para terminar)"

# "345.6MiB" / "1.2GiB" / "800KiB" -> MB (MiB)
to_mb() {
  awk -v v="$1" 'BEGIN{
    n=v+0
    if (v ~ /GiB/) n*=1024; else if (v ~ /KiB/) n/=1024; else if (v ~ /[0-9]B$/ && v !~ /MiB/) n/=1048576
    printf "%.1f", n }'
}

cpu_times() { awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print idle, total}' /proc/stat; }

summary() {
  echo
  echo "[monitor] fin. Reinicios y OOMKilled del backend: $(docker inspect -f '{{.RestartCount}} {{.State.OOMKilled}}' "$BACKEND")"
  echo "[monitor] codigos HTTP del nginx desde $START:"
  docker logs --since "$START" "$NGINX" 2>&1 | awk '/ HTTP\/1\.[01]" /{print $9}' | sort | uniq -c | sort -rn || true
  echo "[monitor] CSV: $OUT"
  exit 0
}
trap summary INT TERM

read -r PREV_IDLE PREV_TOTAL < <(cpu_times)
while true; do
  sleep "$INTERVAL"
  read -r IDLE TOTAL < <(cpu_times)
  HOST_CPU="$(awk -v i="$IDLE" -v t="$TOTAL" -v pi="$PREV_IDLE" -v pt="$PREV_TOTAL" 'BEGIN{d=t-pt; v=0; if (d>0) v=(1-(i-pi)/d)*100; printf "%.1f", v}')"
  PREV_IDLE="$IDLE"; PREV_TOTAL="$TOTAL"
  HOST_MEM="$(free -m | awk '/^Mem:/{print $3}')"

  B_CPU=""; B_MEM=""; N_CPU=""; N_MEM=""
  while IFS=';' read -r name cpu mem; do
    cpu="${cpu%\%}"; mem="$(to_mb "${mem%% *}")"
    if [ "$name" = "$BACKEND" ]; then B_CPU="$cpu"; B_MEM="$mem"; fi
    if [ "$name" = "$NGINX" ]; then N_CPU="$cpu"; N_MEM="$mem"; fi
  done < <(docker stats --no-stream --format '{{.Name}};{{.CPUPerc}};{{.MemUsage}}' "$BACKEND" "$NGINX")

  TW="$(docker exec "$NGINX" cat /proc/net/sockstat 2>/dev/null | awk '/^TCP:/{for(i=1;i<=NF;i++) if($i=="tw") print $(i+1)}')"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$HOST_CPU,$HOST_MEM,$B_CPU,$B_MEM,$N_CPU,$N_MEM,${TW:-}" >> "$OUT"
done
