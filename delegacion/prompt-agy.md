# Task para el PM — EventHub (Antigravity CLI, Gemini 3.8 Flash, effort medium)

Sos el **PM** de este proyecto. Repo: `~/Escritorio/Programacion/Proyectos/entradas_kermingo` (clonar si falta).
Memoria compartida: `git -C ~/ia-memoria pull --ff-only -q`, leé `orquestacion.md`, `stack.md`,
`proyectos/kermingo.md`. Protocolo de rol: `~/ia-memoria/orquestacion.md` (§Protocolo PM).

## Contexto
`entradas_kermingo` es el sistema de entradas de un evento único (Kermingo 2026): Next.js 16 + Prisma 7 +
Supabase + Vercel. Hay que convertirlo en **EventHub**: misma funcionalidad, N eventos de N dueños, con
aislamiento real por evento. Plan completo: `.hermes/plans/2026-09-18_eventhub-multievento.md` (leelo entero
antes de tocar nada — tiene las 5 decisiones de arquitectura y los bloqueantes encontrados en el recon).

## Entorno (importante)
- Corrés **en la Raspberry Pi 5**, repo en `~/entradas_kermingo` (ya clonado, `gh` autenticado, git push anda).
- **No hay credenciales de base de datos acá.** NUNCA corras `prisma db push`, `prisma migrate` ni nada que
  abra la Supabase de producción. Las migraciones se escriben a mano como SQL en `prisma/migrations/<ts>_<nombre>/migration.sql`
  y quedan **sin aplicar** — las aplica Juan desde la Dell. Sí podés `npx prisma generate` y `npx prisma validate`.
- Tests con mocks (patrón en `src/__tests__/*.test.ts`). Antes de cada commit: `npm run lint` (baseline actual: **48 errors / 12 warnings** — `npm run lint 2>&1 | tail -1`; exigencia: NO aumentar el conteo, no hace falta llegar a cero), `npx vitest run` (baseline: **7 tests verdes**);
  `npm run build` si la RAM lo permite (si el build falla por memoria, anotalo en el comentario de la task, no lo
  escondas).


Tablero: Notion DB `EventHub Tasks` = `3dfb8e8b-1951-8115-8ec3-cf79edb415c9`
(page `EventHub — Entradas Multi-Evento` bajo Second Brain). Via MCP notion.

## Tu trabajo (en este orden)
1. Query de la DB, filtrá `Asignado=PM` y `Status=Sin empezar`. Mové a `En progreso` la primera.
2. Implementá **F1 schema multi-tenant** y **F2 auth multi-rol** (las tareas marcadas PM).
   Criterios de aceptación en el plan y en el nombre de cada task. Nada de scope creep.
   Reglas del repo: commits convencionales, un PR por task, `npx vitest run` verde (baseline 7) y sin sumar errores de lint (baseline 48). NO corras `backup-db.ts` acá: la Pi no tiene credenciales de la DB.
3. Cuando el contributor (Command Code) mande algo a `Review`: revisá el **diff real** (`git log/diff`), corré los
   tests, compará contra el criterio de aceptación. Mové a `Hecho` o devolvé con comentario concreto.
   Nunca confíes en el self-report del junior.
4. Terminá actualizando `~/ia-memoria/proyectos/kermingo.md` (Log: fecha + qué cambió) y pusheá.

## Restricciones
- No cambies el modelo de datos ya acordado (tenant = fila con `event_id`, NO DB por evento).
- No agregues dependencias de pago ni servicios nuevos: R2/Blob sólo si `STORAGE_MODE` lo habilita (F5).
- Si algo del plan es ambiguo o creés que está mal, escribí la duda en el comentario de la task en Notion y seguí
  con la task siguiente — Juan decide.
- Reportá al final: tasks movidas, commits, resultado de tests, dudas.
