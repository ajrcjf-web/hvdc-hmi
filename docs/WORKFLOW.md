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
7. `git commit -m "tipo: descripción en imperativo"`: un commit, un motivo (ver Convenciones).
8. Si cambió el comportamiento o las reglas: actualizar README y `CLAUDE.md` en la misma rama.

## Al terminar la sesión

1. Commitear lo que esté listo.
2. `git push`: copia de seguridad en GitHub.
3. `git status`: debe decir "working tree clean".

## Al terminar una funcionalidad (Pull Request)

1. `git push` de la rama.
2. En GitHub: **Compare & pull request**, con título y descripción claros. Si el PR resuelve un issue, incluir `Closes #N` en la descripción.
3. Esperar el CI en verde. Si falla: corregir en la misma rama, nunca desactivar el test.
4. Revisar **Files changed**; corregir en la misma rama si hace falta.
5. **Merge pull request** y **Delete branch**.
6. En la terminal: `git switch main` → `git pull` → `git branch -d nombre-rama` → `git fetch --prune`.

## Al cerrar una fase

En Claude Code, `/cerrar-fase` guía este procedimiento.

1. **Revisar el milestone** de la fase (Claude lo consulta con `gh`): no debe tener issues abiertos. Los que queden se resuelven antes, o se mueven a otro milestone o al backlog. Si la fase tiene subfases, todos sus milestones deben estar ya cerrados y sin issues abiertos (Claude lo comprueba con `gh api "repos/:owner/:repo/milestones?state=all"`).
2. **Revisar la hoja de ruta** del README:
   - ¿Qué cambió respecto del plan?
   - ¿Qué adelantamos o postergamos?
   - ¿Qué aprendimos que modifica lo que sigue?
   - Actualizar las fases abiertas para que vuelvan a ser verdaderas (las cerradas no se tocan: ver abajo).
3. **Revisar `CLAUDE.md`**: decisiones de diseño nuevas; simplificaciones conocidas resueltas o nuevas.
4. **Preparar la rama de cierre** `chore/release-0.N.0`: Claude aplica los cambios aprobados, ejecuta `npm version 0.N.0 --no-git-tag-version` (actualiza `package.json` y `package-lock.json`), hace los commits por motivo, el push y abre el PR `chore: release v0.N.0` con `gh`.
5. **Hacer el merge** del PR (solo el usuario).
6. **Marcar la versión** en `main`, después del merge (solo el usuario):
   ```
   git switch main
   git pull
   git tag -a v0.1.0 -m "Fase 1: modelo de estados y enclavamientos"
   git push origin v0.1.0
   ```
7. **Crear el Release** a partir del tag (solo el usuario). Claude redacta las notas en un archivo del scratchpad (resumen, qué incluye, limitaciones, aprendizajes y próximo paso) y el usuario ejecuta:
   ```
   gh release create v0.N.0 --verify-tag --draft --title "v0.N.0 — Fase N: <nombre de la fase>" --generate-notes --notes-file <archivo>
   ```
   Las notas propias se anteponen a las generadas por GitHub. `--draft` deja el Release sin publicar: se revisa en GitHub y se publica desde ahí. Cuando se confirme que `--notes-file` se combina bien con `--generate-notes`, se quita `--draft`.
8. **Cerrar el milestone** de la fase (solo el usuario: Issues → Milestones → Close). Si la fase tiene subfases, no hay nada que cerrar aquí: cada milestone se cerró al terminar su subfase.

Las tareas de las fases cerradas no se reescriben aunque el código cambie después: documentan lo que era cierto en ese momento, igual que las notas de un Release.

## Issues y milestones

- **La hoja de ruta del README** muestra las grandes tareas de cada fase.
- **Los issues** registran las mejoras puntuales y los errores que aparecen en el camino. Cada uno explica qué hay hoy, qué se propone y de dónde surgió.
- **Cada fase tiene un milestone** con el mismo nombre que en el README. Los issues sin milestone forman el backlog: pendientes, sin fase decidida.
- **Subfases.** Una fase grande puede dividirse en subfases (hoy, la Fase 4: 4.1 a 4.5). Cada subfase tiene su propio milestone, que el usuario cierra en GitHub al terminarla. La versión se publica una sola vez, al cerrar la fase completa.
- **Un PR que resuelve un issue** lo menciona con `Closes #N`: al hacer merge, GitHub cierra el issue y los deja vinculados.
- **`CLAUDE.md`** no lista tareas pendientes: describe el código como es hoy, incluidas sus simplificaciones conocidas.

## Comandos útiles

- `git fetch` + `git status`: ver si GitHub tiene cambios nuevos, sin traerlos todavía.
- `git log --oneline --graph --all`: ver el historial y las ramas como árbol.
- `git restore <archivo>`: descartar cambios no commiteados de un archivo.
- `git log main..origin/main --oneline`: commits en GitHub que todavía no tengo.
- `git show v0.1.0:README.md`: ver un archivo tal como estaba en una versión anterior.
- `git log v0.1.0..main --oneline`: commits hechos desde una versión.

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
