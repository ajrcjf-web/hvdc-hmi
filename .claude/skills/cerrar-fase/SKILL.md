---
name: cerrar-fase
description: Ritual de cierre de una fase del proyecto y publicación de su versión. Usar cuando el usuario diga que terminó una fase, quiera cerrarla o quiera publicar una versión o Release.
---

# Cerrar una fase

Guía al usuario por el cierre de una fase, según docs/WORKFLOW.md.
El usuario está aprendiendo: explica cada paso y el porqué.
Reparto de tareas, igual que en CLAUDE.md: Claude crea la rama de cierre, aplica los cambios aprobados, ejecuta `npm version`, hace los commits, el push y abre el PR con `gh`. El usuario se reserva el merge, el tag, el Release y el cierre del milestone.

## 1. Verificar el punto de partida
- Confirmar que la rama actual es `main`, actualizada (`git pull`) y sin cambios pendientes (`git status`).
- Confirmar que todas las casillas de la fase en la hoja de ruta del README están marcadas. Si falta alguna, avisar y no seguir.
- Revisar con `gh` el milestone de la fase: `gh issue list --milestone "<nombre del milestone>" --state open`. No debe tener issues abiertos. Si quedan, decidir con el usuario si se resuelven antes o se mueven a otro milestone o al backlog (sin milestone). Para ver el nombre exacto: `gh api repos/:owner/:repo/milestones --jq '.[].title'` (lista solo los milestones abiertos, y el de la fase que se cierra lo está).
- Ejecutar `npm run typecheck` y `npm test`. Si algo falla, no seguir.

## 2. Revisar la fase con el usuario
Basar el balance en datos, no en memoria. Con `vANTERIOR` como el tag de la versión anterior:
- Plan original de la fase: `git show vANTERIOR:README.md` (el README tal como estaba al empezar la fase).
- Trabajo hecho: `git log vANTERIOR..main --oneline`.

Proponer un balance con tres puntos y pedir confirmación:
- Qué cambió respecto del plan original: tareas agregadas, partidas o quitadas durante la fase. No confundir con lo que se hizo: comparar contra el plan.
- Qué se adelantó o postergó.
- Qué se aprendió que modifica las fases siguientes: aprendizajes técnicos y de proceso.

## 3. Preparar la rama de cierre
La versión es `0.N.0`, donde N es el número de la fase que se cierra.
Crear la rama `chore/release-0.N.0` desde `main`. Después proponer, mostrando cada cambio como diff:
- README: nota de estado con la fase siguiente y el enlace al Release; título de la fase cerrada con ✅ y la versión.
- README: no modificar las tareas de las fases ya cerradas; son el registro histórico.
- README: ajustar las fases siguientes solo con grandes tareas. Las tareas puntuales, mejoras y deuda técnica que surjan del balance van como issues en el milestone que corresponda: proponer título y descripción, y que el usuario los cree.
- CLAUDE.md: decisiones de diseño nuevas, escritas como reglas generales para el código futuro. "Simplificaciones conocidas" es solo para simplificaciones intencionales del dominio; la deuda técnica no va ahí, va en issues. Revisar que ningún título de sección quede duplicado.
- Versión: ejecutar `npm version 0.N.0 --no-git-tag-version` (actualiza package.json y package-lock.json sin crear commit ni tag) y mostrar el cambio. Después repetir `npm run typecheck`, `npm test` y `npm run build`.

Aplicar solo los cambios que el usuario apruebe.

## 4. Commits y Pull Request
- Hacer los commits por motivo, con Conventional Commits:
  `docs: cierra la Fase N en la hoja de ruta`, `docs: ...` para CLAUDE.md, `chore: sube versión a 0.N.0`.
- Hacer push de la rama y abrir el PR con `gh pr create`, título `chore: release v0.N.0`.
- Redactar la descripción con las secciones de la plantilla `.github/pull_request_template.md`. Antes, preguntar al usuario qué issues se relacionan: `Closes #N` si el PR los resuelve; `#N` a secas si solo los menciona.
- En "Cómo se verificó", poner solo lo que Claude ejecutó de verdad (no inventar resultados). Lo que el usuario verifique por su cuenta se anota aparte, como suyo.

## 5. Tag, Release y milestone (después del merge)
No ejecutar estos comandos: dárselos al usuario.

```
git switch main
git pull
git tag -a v0.N.0 -m "Fase N: <resumen>"
git push origin v0.N.0
```

Redactar las notas del Release con estas secciones:
- Resumen en una frase.
- Incluye: qué aporta la versión.
- Limitaciones conocidas: qué no hace todavía, con honestidad.
- Aprendizajes: técnicos y de proceso, tomados del balance del paso 2.
- Próximo paso: la fase siguiente.

Escribir las notas en un archivo del scratchpad (`release-notes-v0.N.0.md`) y dar al usuario su ruta completa. Después darle el comando para crear el Release, que antepone las notas propias a las generadas por GitHub:

```
gh release create v0.N.0 --verify-tag --draft --title "v0.N.0 — Fase N: <nombre de la fase>" --generate-notes --notes-file "<ruta completa del archivo>"
```

- Título: `v0.N.0 — Fase N: <nombre de la fase>`, como los Releases anteriores. El nombre sale del título de la fase en el README, con la primera letra en minúscula (ej. `v0.3.0 — Fase 3: la ventana overview`).
- `--verify-tag` aborta si el tag no existe todavía.
- `--draft` deja el Release sin publicar, para que el usuario revise en GitHub que sus notas quedaron arriba de las generadas y lo publique desde ahí.
- Nota: la ayuda de `gh release create` documenta que `--notes` se antepone a las notas de `--generate-notes`, pero no lo dice de `--notes-file`. Cuando el usuario confirme que `--notes-file` se combina bien con `--generate-notes`, quitar `--draft` de este comando y de docs/WORKFLOW.md.

Por último, pedir al usuario que cierre el milestone de la fase en GitHub (Issues → Milestones → Close) y que verifique que el enlace al Release de la nota de estado del README funciona.
