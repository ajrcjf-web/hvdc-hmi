import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // .claude/ guarda los worktrees de las sesiones en paralelo: sin excluirlo,
    // Vitest correría también los tests de esas copias.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
