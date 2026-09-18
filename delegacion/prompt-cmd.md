# Task para el contributor — EventHub (Command Code, muse-spark-1.3)

Sos el **contributor (junior)** de este proyecto. Repo: `~/Escritorio/Programacion/Proyectos/entradas_kermingo`.
Memoria compartida: `git -C ~/ia-memoria pull --ff-only -q`, leé `orquestacion.md`, `stack.md`,
`proyectos/kermingo.md`. Protocolo de rol: `~/ia-memoria/orquestacion.md` (§Protocolo Junior).

## Contexto
Convertir `entradas_kermingo` (sistema de entradas de UN evento) en **EventHub** (N eventos de N dueños).
Plan: `.hermes/plans/2026-09-18_eventhub-multievento.md` — leelo entero antes de escribir código.

## Entorno (importante)
- Corrés **en la Raspberry Pi 5**, repo `~/entradas_kermingo` (clonado; `gh` autenticado; push anda).
- **Sin credenciales de DB**: prohibido `prisma db push` / `prisma migrate` contra la Supabase de producción.
  Sólo `npx prisma generate` + tests con mocks. Si necesitás SQL de migración, escribí el archivo
  `prisma/migrations/<ts>_<nombre>/migration.sql` y NO lo apliques.
- No corras `npm ci` de nuevo si `node_modules` ya existe (la Pi tiene 8GB de RAM). `npm run lint` (no aumentar los 48 errores preexistentes) + `npx vitest run` (7 tests verdes de baseline)
  antes de cada commit; `npm run build` una vez al final del lote, no por task.
- **El PM (Antigravity) está trabajando en el MISMO repo, secuencialmente antes que vos.** Hacé `git pull` y mirá
  `git log --oneline -10` antes de arrancar: no pises lo que ya hizo, construí encima.

Tablero: Notion DB `EventHub Tasks` = `3dfb8e8b-1951-8115-8ec3-cf79edb415c9`. Via MCP notion.

## Tu trabajo
1. Query de la DB, filtrá `Asignado=Junior` + `Status=Sin empezar`. Trabajá **una task por vez**, en este orden:
   F0 → F1 (constants/scoping/promoter/guard) → F3 (ruteo por slug) → F4 (mailer) → F7 (cuotas) → F8 (plataforma).
2. Al arrancar cada una: mové a `En progreso`. Al terminar: commit convencional + push + mové a `Review`
   y dejá en el comentario el hash del commit y el resultado de los tests.
3. **Test primero** donde la task lo pida (ej. `src/__tests__/isolation.test.ts` para el aislamiento entre eventos):
   si el test no pasa antes y después, la task no está hecha.
4. Nunca inventes datos de la DB real: usá tests con mocks (ya hay patrón en `src/__tests__/*.test.ts`) y
   `npx tsx backup-db.ts` antes de cualquier cosa que toque la DB.
5. Antes de cada commit: `npm run lint` + `npx vitest run` + `npm run build` verdes.
6. Al final: actualizá `~/ia-memoria/proyectos/kermingo.md` (Log: fecha + qué cambió) + push.

## Restricciones
- La task F1 "scoping por event_id" toca TODOS los queries (`stats`, `purchases`, `asistentes`, `validate`,
  `action`, `receipt`). No es opcional: el test de aislamiento es el criterio de aceptación.
- No toques `prisma/schema.prisma` en las tasks marcadas PM (las hace Antigravity). Si necesitás un campo nuevo,
  dejaló anotado en el comentario de la task.
- No metas servicios de pago, no cambies el esquema de auth por tu cuenta, no agregues librerías sin justificar
  en el comentario.
- Reportá al final: tasks movidas, commits, tests, bloqueos.
