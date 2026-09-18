#!/usr/bin/env bash
# Un round de trabajo continuo: PM (agy) -> contributor (command-code) -> verificación dura.
# v3: la verificación usa EXIT CODES (vitest/build/lint), no parsing de texto: en la v2 el
# parseo de "Tests N passed" falló y reportó tests=0 como verde (agujero real).
# Corre EN LA PI.
set -uo pipefail
REPO="${REPO:-$HOME/entradas_kermingo}"
cd "$REPO" || exit 1
[ -f "$HOME/.config/eventhub/creds.env" ] && set -a && . "$HOME/.config/eventhub/creds.env" && set +a
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
TS=$(date +%Y%m%d-%H%M%S)
LOG="$HOME/.cache/eventhub/round-$TS.log"
mkdir -p "$(dirname "$LOG")"
AGY_MODEL="${AGY_MODEL:-gemini-3.8-flash-medium}"
MODEL_CC="${MODEL_CC:-meta/muse-spark-1.3-contributor}"
LINT_BASELINE=48
MAX_NUDGES=2
BOARD="3dfb8e8b-1951-8115-8ec3-cf79edb415c9"

log() { echo "$@" >>"$LOG"; }
say() { echo "$@" | tee -a "$LOG"; }
commits_since_base() { git rev-list "$BASE_HEAD"..HEAD --count 2>/dev/null || echo 0; }

say "== ROUND $TS =="
git pull --ff-only -q || log "pull: sin cambios remotos"
BASE_HEAD=$(git rev-parse HEAD)
log "HEAD previo: $(git log --oneline -1)"

NUDGE_PM="No hubo commits en tu intento anterior: quedaste idle sin trabajar. Acción inmediata y única: abrí el tablero Notion (DB EventHub Tasks $BOARD) y tomá la primera task con Asignado=PM y Status=Sin empezar (o una que el contributor haya dejado en Review). Implementala COMPLETA en este turno, corré npx vitest run, commiteá con mensaje convencional, pusheá y mové la task en el tablero. Prohibido terminar el turno sin commits. Si de verdad no existe ninguna task PM pendiente, respondé exactamente NO_PM_TASKS."
NUDGE_CC="No hubo commits en tu intento anterior: quedaste idle sin trabajar. Acción inmediata y única: abrí el tablero Notion (DB EventHub Tasks $BOARD) y tomá la primera task con Asignado=Junior y Status=Sin empezar. Implementala COMPLETA en este turno (código + tests con mocks + npx vitest run verde), commiteá, pusheá y mové la task a Review. Prohibido terminar el turno sin commits. Si no existe ninguna task Junior pendiente, respondé exactamente NO_JUNIOR_TASKS."

# --- 1. PM ---
log ">> agy $AGY_MODEL"
timeout 4800 agy -p "$(cat delegacion/prompt-agy.md)" --dangerously-skip-permissions \
  --model "$AGY_MODEL" --print-timeout 60m >>"$LOG" 2>&1
log "AGY_EXIT=$?"
N=0
while [ "$(commits_since_base)" = "0" ] && [ "$N" -lt "$MAX_NUDGES" ]; do
  N=$((N+1)); log "PM sin commits -> nudge $N"
  timeout 3000 agy -c -p "$NUDGE_PM" --dangerously-skip-permissions \
    --model "$AGY_MODEL" --print-timeout 45m >>"$LOG" 2>&1
  log "AGY_NUDGE${N}_EXIT=$?"
  grep -q "NO_PM_TASKS" "$LOG" && { log "PM declara que no quedan tasks PM"; break; }
done

# --- 2. contributor ---
log ">> command-code $MODEL_CC"
timeout 4800 command-code -p "$(cat delegacion/prompt-cmd.md)" --trust --dangerously-skip-permissions \
  --tools-all --skip-onboarding --max-turns 240 -m "$MODEL_CC" >>"$LOG" 2>&1
log "CC_EXIT=$?"
N=0
while [ "$(commits_since_base)" = "0" ] && [ "$N" -lt "$MAX_NUDGES" ]; do
  N=$((N+1)); log "contributor sin commits -> nudge $N"
  timeout 3000 command-code -c -p "$NUDGE_CC" --trust --dangerously-skip-permissions \
    --tools-all --skip-onboarding --max-turns 240 -m "$MODEL_CC" >>"$LOG" 2>&1
  log "CC_NUDGE${N}_EXIT=$?"
  grep -q "NO_JUNIOR_TASKS" "$LOG" && { log "contributor declara que no quedan tasks Junior"; break; }
done

# --- 3. verificación dura por EXIT CODES ---
NEW_HEAD=$(git rev-parse HEAD)
DIRTY=$(git status --porcelain | wc -l)
npx vitest run >/tmp/eventhub-tests-$TS.log 2>&1; TEST_EXIT=$?
TESTS=$(grep -oE "Tests +[0-9]+ passed" /tmp/eventhub-tests-$TS.log | grep -oE "[0-9]+" | head -1); TESTS=${TESTS:-"?"}
npm run lint >/tmp/eventhub-lint-$TS.log 2>&1; LINT=$((LINT_BASELINE))
LINT=$(tail -3 /tmp/eventhub-lint-$TS.log | grep -oE "[0-9]+ errors" | grep -oE "[0-9]+" | head -1); LINT=${LINT:-999}
timeout 600 npm run build >/tmp/eventhub-build-$TS.log 2>&1; BUILD_EXIT=$?

STATUS=verde
[ "$TEST_EXIT" != "0" ] && STATUS=rojo
[ "$BUILD_EXIT" != "0" ] && STATUS=rojo
[ "$LINT" -gt "$LINT_BASELINE" ] && STATUS=rojo
[ "$DIRTY" != "0" ] && STATUS="sucio"

say "COMMITS_nuevos=$(commits_since_base) | tests=$TESTS (exit=$TEST_EXIT) | lint=$LINT/$LINT_BASELINE | build_exit=$BUILD_EXIT | sucio=$DIRTY | estado=$STATUS"
say "logs: $LOG · /tmp/eventhub-{tests,lint,build}-$TS.log"
if [ "$STATUS" != "verde" ]; then
  say "⛔ Ronda detenida: el repo no quedó sano. No lanzo otra ronda hasta que se arregle."
  touch "$HOME/.cache/eventhub/BLOCKED"
fi
if [ "$DIRTY" != "0" ]; then
  say "ℹ️ archivos sin commitear:"
  git status --short | head -8 | tee -a "$LOG"
fi
