# Flujo de trabajo

## Al iniciar cada sesión

1. Abrir VS Code en `C:\dev\hvdc-hmi` y una terminal.
2. `git status`: ¿en qué rama estoy? ¿quedó algo sin commitear?
3. `git pull`: traer lo último de GitHub.
4. Si hace falta Claude Code: abrir una **segunda terminal** y ejecutar `claude`.

## Al empezar algo nuevo

1. `git switch main` y **enseguida** `git pull`. Hasta el pull, `main` local está desactualizado aunque Git diga "up to date".
2. Crear la rama: `git switch -c tipo/nombre-descriptivo`.
3. El primer `git push` de una rama nueva la crea en GitHub (con `push.autoSetupRemote` activado; si no, `git push -u origin nombre-rama`).

## Mientras trabajo (cada paso lógico terminado)

1. Guardar todo (Auto Save activado).
2. `npm run typecheck`: sin errores.
3. `npm test`: todo en verde.
4. `npm start`: el programa funciona.
5. `git status` y `git diff`: revisar qué cambió.
6. `git add <archivos>` y, si hay archivos nuevos, `git diff --staged`.
7. `git commit -m "Verbo en imperativo + qué cambia"`: un commit, un motivo.
8. Si cambió el comportamiento o las reglas: actualizar README y `CLAUDE.md` en la misma rama.

## Al terminar la sesión

1. Commitear lo que esté listo.
2. `git push`: copia de seguridad en GitHub.
3. `git status`: debe decir "working tree clean".

## Al terminar una funcionalidad (Pull Request)

1. `git push` de la rama.
2. En GitHub: **Compare & pull request**, con título y descripción claros.
3. Esperar el CI en verde. Si falla: corregir en la misma rama, nunca desactivar el test.
4. Revisar **Files changed**; corregir en la misma rama si hace falta.
5. **Merge pull request** y **Delete branch**.
6. En la terminal: `git switch main` → `git pull` → `git branch -d nombre-rama` → `git fetch --prune`.

## Al cerrar una fase

1. **Revisar la hoja de ruta** del README:
   - ¿Qué cambió respecto del plan?
   - ¿Qué adelantamos o postergamos?
   - ¿Qué aprendimos que modifica lo que sigue?
   - Actualizarla para que vuelva a ser verdadera.
2. **Revisar `CLAUDE.md`**: decisiones de diseño nuevas, preguntas abiertas resueltas o nuevas.
3. **Actualizar la versión** en `package.json` (por ejemplo, `0.1.0`), en una rama con su PR.
4. **Marcar la versión** en `main`, después del merge:
git switch main
git pull
git tag -a v0.1.0 -m “Fase 1: modelo de estados y enclavamientos”
git push origin v0.1.0

5. **Publicar un Release** en GitHub a partir del tag, con un resumen de lo que incluye la fase.

## Comandos útiles

- `git fetch` + `git status`: ver si GitHub tiene cambios nuevos, sin traerlos todavía.
- `git log --oneline --graph --all`: ver el historial y las ramas como árbol.
- `git restore <archivo>`: descartar cambios no commiteados de un archivo.
- `git log main..origin/main --oneline`: commits en GitHub que todavía no tengo.

## Convenciones

Se usa [Conventional Commits](https://www.conventionalcommits.org/). El mismo tipo sirve para el commit y para el prefijo de la rama.

| Tipo | Para qué |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un error |
| `docs` | Solo documentación |
| `test` | Solo tests |
| `refactor` | Reorganizar código sin cambiar su comportamiento |
| `chore` | Mantenimiento: dependencias, configuración |
| `ci` | Integración continua |

**Commits:** `tipo: descripción en imperativo`. Tipo en inglés y minúscula; descripción en español, en minúscula y sin punto final. Un commit, un motivo.
Ejemplo: `feat: agrega enclavamiento de desacople con P = 0`

**Ramas:** `tipo/nombre-descriptivo`, en minúsculas, con guiones y sin acentos.
Ejemplo: `feat/power-interlocks`

**Versiones:** `0.x.y` mientras el proyecto está en desarrollo; una versión menor por fase.

## Reglas de oro

- Nunca trabajar directamente en `main`.
- Leer el diff antes de commitear y antes de aceptar cambios de Claude Code.
- No reescribir commits que ya están en GitHub.
- Nunca commitear secretos (`.env`, contraseñas, claves).
- Cambiar de rama cambia los archivos del disco: guardar y commitear antes de cambiar.
- La documentación se actualiza en el mismo PR que el código.
