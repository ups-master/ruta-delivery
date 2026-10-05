# Contribuir a Ruta

Reglas de ramas, PR y commits. La mecanica del pipeline (que hace cada workflow) esta
documentada en el README ("CI/CD y versionado"); esto es sobre el proceso: como y donde
se debe trabajar para que ese pipeline funcione.

## Modelo de ramas

- **`main`**: solo codigo liberado. Cada push aca dispara un release (`semantic-release`)
  y un despliegue a **produccion**. Nunca se pushea directo (ver reglas de proteccion
  abajo) -- se llega por PR desde `develop`.
- **`develop`**: rama de trabajo. Cada push aca despliega a **staging**. Tampoco se
  pushea directo -- se llega por PR desde una rama de feature.
- **Ramas de feature**: nacen de `develop`, nombradas `tipo/descripcion-corta` (kebab
  case), donde `tipo` es el mismo prefijo que se usa en los commits (ver abajo):
  `feat/paginar-admin-invoices`, `fix/csrf-cookie-detached-head`, `docs/actualizar-readme`.

```
feature/x ──PR──► develop ──PR (al liberar)──► main
                (CI en verde)              (CI en verde + 1 aprobacion)
```

## Commits: Conventional Commits

`semantic-release` calcula la version a partir del prefijo del commit -- no es solo
estilo, tiene efecto real en que numero de version sale:

| Prefijo | Efecto en la version | Ejemplo |
|---|---|---|
| `fix:` | patch (`1.0.0` -> `1.0.1`) | `fix(auth): corregir expiracion de la cookie` |
| `feat:` | minor (`1.0.0` -> `1.1.0`) | `feat(admin): paginar la lista de facturas` |
| `feat!:` / pie `BREAKING CHANGE:` | major (`1.0.0` -> `2.0.0`) | `feat(api)!: remover /api/v0` |
| `docs:`, `refactor:`, `test:`, `chore:`, `ci:`, `perf:`, `style:` | no dispara release | `docs: aclarar seed en produccion` |

**El prefijo se elige por que carpeta se toca, no por costumbre.** Un cambio a
`.github/workflows/` o `deploy/` no cambia el codigo de la app -- las imagenes de
`ruta-backend`/`ruta-frontend` quedan identicas aunque cambie como se construyen o
se despliegan. Usar `fix:`/`feat:` ahi infla la version del producto sin que haya
nada distinto corriendo en produccion (paso en la practica: un cambio solo a
`cd.yml` etiquetado `fix:` disparo `1.0.1 -> 1.0.2` sin que el codigo cambiara).

| Si el cambio toca... | Usar |
|---|---|
| `backend/`, `frontend/` (codigo de la app) | `fix:` / `feat:` / `feat!:` segun corresponda |
| `.github/workflows/`, `deploy/`, `package.json` de la raiz (tooling, no la app) | `ci:` o `chore:` |
| `README.md`, `CONTRIBUTING.md`, `docs/` | `docs:` |

Si un commit toca ambas cosas a la vez (poco comun), el prefijo es el del cambio de
mayor peso -- normalmente el de `backend/`/`frontend/` si lo hay.

Un commit sin alguno de estos prefijos no rompe nada, pero `commit-analyzer` lo trata
como si no aportara nada a la version -- usa el prefijo que corresponda.

## Cambios de API (contract-first)

`docs/openapi.json` es la fuente de verdad del contrato de la API. Para agregar o cambiar un
endpoint, campo, codigo de respuesta o enum:

1. Edita primero `docs/openapi.json` y revisalo en el PR junto con el codigo.
2. Implementa el cambio en el backend hasta que `OpenApiContractIntegrationTest` pase: el
   test compara `/v3/api-docs` contra el archivo y falla si difieren en cualquier direccion.
3. Si el contrato ya es el correcto y solo hay que sincronizar el archivo con un cambio de
   anotaciones, el JSON real queda en `backend/target/openapi-actual.json`; revisa el diff
   antes de copiarlo.

Toda respuesta 4xx/5xx se documenta con el schema `ErrorResponse`, que se agrega solo
(`OpenApiConfig`); no lo anotes por endpoint.

## Pull Requests

- **Contra `develop`**: requiere que `CI` (backend-test + frontend-build) este en verde.
  No exige una aprobacion humana obligatoria -- con un equipo chico, forzarla ahi frena
  sin aportar mucho; el gate real es el check.
- **Contra `main`** (al momento de liberar): requiere `CI` en verde **y al menos 1
  aprobacion** de otra persona. Esta es la rama que dispara produccion, por eso el gate
  es mas estricto.
- Nadie (ni un admin) deberia pushear directo a `develop`/`main` para cambios de codigo
  normales. La unica excepcion real son los commits automaticos del propio pipeline
  (`chore(release): X.Y.Z`, el back-merge `main -> develop`), que usan un token de admin
  para saltarse el ruleset -- ver "CI/CD y versionado" en el README para el detalle
  tecnico de por que eso es necesario.
- Preferir **squash and merge** o **rebase and merge** sobre "Create a merge commit"
  para features chicas: mantiene el historial de `develop`/`main` legible y evita que
  CI tenga que revalidar un merge commit con un arbol distinto al ya probado.

## Reglas de proteccion vigentes (Settings -> Rules -> Rulesets)

| Ruleset | Ramas | Reglas |
|---|---|---|
| "Proteccion base develop" | `develop` | Sin borrado, sin force-push, CI (`backend-test`+`frontend-build`) obligatorio |
| "Proteccion release main" | `main` | Lo mismo, mas PR + 1 aprobacion obligatoria |

Ambos rulesets tienen un bypass para el rol `admin` del repositorio -- lo usa
exclusivamente el pipeline (`RELEASE_TOKEN`, un PAT de un admin guardado como secreto)
para los dos pushes automaticos mencionados arriba. Un humano con rol admin *puede*
usar ese mismo bypass para pushear directo, pero no deberia salvo una emergencia real
(hotfix que no puede esperar a la revision) -- la norma sigue siendo PR.
