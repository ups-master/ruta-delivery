# Ruta - Frontend

SPA/PWA en React 19 + TypeScript + Vite que sirve tanto la pantalla del conductor como
el panel administrativo (el rol autenticado determina las rutas visibles). Ver el
`README.md` de la raiz del repositorio para como levantar el stack completo con Docker.

## Desarrollo local

Requiere pnpm (la version exacta queda fijada en `package.json` -> `packageManager`;
con Corepack habilitado, `pnpm install`/`pnpm run dev` la activan solos):

```bash
corepack enable   # una sola vez por maquina
pnpm install
pnpm run dev
```

Por defecto el proxy de Vite (`vite.config.ts`) redirige `/api` a
`http://localhost:8080`; ajusta `VITE_API_PROXY_TARGET` si el backend corre en otro
puerto.

## Build de produccion

```bash
pnpm run build
```

Corre `tsc -b` (chequeo de tipos; el build falla si hay errores) y despues
`vite build`. Genera `dist/`, servido por Nginx (`Dockerfile`, `nginx.conf`) en el
contenedor.

## Pruebas y lint

```bash
pnpm test                  # vitest run (215 pruebas)
pnpm run test:coverage     # con cobertura V8: 97,5 % de instrucciones; falla por debajo del 90 %
pnpm run lint       # oxlint, entiende TypeScript/TSX nativamente
pnpm run typecheck  # solo el chequeo de tipos, sin generar el build
```

## Estructura

- `src/pages/driver/*`: pantalla del conductor (buscar factura, OCR, foto, GPS, PIN).
- `src/pages/admin/*`: panel administrativo (facturas, equipo, entregas, tablero,
  costo por entrega, circuit breaker + retry).
- `src/context/AuthContext.tsx`: token JWT y usuario, en `localStorage`/`sessionStorage`.
- `src/api/client.ts`: cliente HTTP (axios) con el token Bearer.
- `src/types/domain.ts`: tipos de dominio (Invoice, Driver, DeliveryAttempt, ...),
  reflejando los DTO reales del backend (`backend/.../infrastructure/adapter/in/web/dto`).
