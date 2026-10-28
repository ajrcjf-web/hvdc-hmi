Al iniciar cada sesión
    Abrir VS Code en C:\dev\hvdc-hmi y una terminal.
    git status → ¿en qué rama estoy? ¿quedó algo sin commitear?
    git pull → traer lo último de GitHub (si trabajás desde otra PC o mergeaste un PR).
    Si la terminal de Claude Code va a hacer falta: abrir una segunda terminal y ejecutar claude.

Al empezar algo nuevo (una funcionalidad o arreglo)
    Estar en main y actualizado: git switch main → git pull.
    Crear la rama: git switch -c feature/nombre-descriptivo (o fix/, docs/).

Mientras trabajás (cada paso lógico terminado)
    Guardar todo (o activar File → Auto Save).
    npm run typecheck → sin errores.
    npm start → el programa funciona.
    git status y git diff → revisar qué cambió.
    git add <archivos> → git diff --staged si hay archivos nuevos.
    git commit -m "Verbo en imperativo + qué cambia" → un commit, un motivo.

Al terminar la sesión
    Commitear lo que esté listo.
    git push → copia de seguridad en GitHub.
    git status → debe decir “working tree clean”.

Al terminar una funcionalidad (Pull Request)
    git push de la rama.
    En GitHub: Compare & pull request → título y descripción claros.
    Revisar Files changed; corregir en la misma rama si hace falta.
    Merge → Delete branch.
    En la terminal: git switch main → git pull → git branch -d nombre-rama → git fetch --prune.

Reglas de oro
    Nunca trabajar directamente en main.
    Leer el diff antes de commitear y antes de aceptar cambios de Claude Code.
    No reescribir commits que ya están en GitHub.
    Nunca commitear secretos (.env, contraseñas, claves).
