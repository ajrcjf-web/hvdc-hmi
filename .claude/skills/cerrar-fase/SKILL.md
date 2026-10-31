---
name: cerrar-fase
description: Ritual de cierre de una fase del proyecto y publicación de su versión. Usar cuando el usuario diga que terminó una fase, quiera cerrarla o quiera publicar una versión o Release.
---

# Cerrar una fase

Guía al usuario por el cierre de una fase, según docs/WORKFLOW.md.
El usuario está aprendiendo: explica cada paso y deja que él ejecute los comandos de Git.

## 1. Verificar el punto de partida
- Confirmar que la rama actual es `main`, actualizada (`git pull`) y sin cambios pendientes (`git status`).
- Confirmar que todas las casillas de la fase en la hoja de ruta del README están marcadas. Si falta alguna, avisar y no seguir.
- Ejecutar `npm run typecheck` y `npm test`. Si algo falla, no seguir.

## 2. Revisar la fase con el usuario
Proponer un balance con tres puntos y pedir confirmación:
- Qué cambió respecto del plan.
- Qué se adelantó o postergó.
- Qué se aprendió que modifica las fases siguientes.

## 3. Preparar la rama de cierre
Pedir al usuario que cree la rama `chore/release-X.Y.Z`. Después proponer, mostrando cada cambio como diff:
- README: nota de estado con la fase siguiente y el enlace al Release; título de la fase cerrada con ✅ y la versión; ajustes a las fases siguientes según el balance.
- CLAUDE.md: decisiones de diseño nuevas; preguntas abiertas resueltas o reasignadas a una fase. Revisar que ningún título de sección quede duplicado.
- Versión: indicar al usuario que ejecute `npm version X.Y.Z --no-git-tag-version` (actualiza package.json y package-lock.json sin crear commit ni tag).

## 4. Commits y Pull Request
- Proponer commits separados por motivo, con Conventional Commits:
  `docs: cierra la Fase N en la hoja de ruta`, `docs: ...` para CLAUDE.md, `chore: sube versión a X.Y.Z`.
- Proponer el PR con título `chore: release vX.Y.Z` y descripción con las secciones de la plantilla.

## 5. Tag y Release (después del merge)
No ejecutar estos comandos: dárselos al usuario.

```
git switch main
git pull
git tag -a vX.Y.Z -m "Fase N: <resumen>"
git push origin vX.Y.Z
```

Redactar las notas del Release con estas secciones:
- Resumen en una frase.
- Incluye: qué aporta la versión.
- Limitaciones conocidas: qué no hace todavía, con honestidad.
- Próximo paso: la fase siguiente.

Recordar al usuario usar "Generate release notes" en GitHub y agregar las notas arriba.
