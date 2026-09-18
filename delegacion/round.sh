#!/usr/bin/env bash
# Un round de trabajo continuo: PM (agy) -> contributor (command-code) -> verificación dura.
# Corre EN LA PI. El loop (cron) lo invoca; también se puede correr a mano.
# Salida: resumen del round. Deja estado en ~/.cache/eventhub/
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
LINT_BASELINE=48   # errores preexistentes del repo (no deben crecer)

log() { echo "$@" >>"$LOG"; }
say() { echo "$@" | tee -a "$LOG"; }

say "== ROUND $TS =="
git pull --ff-only -q || log "pull: sin cambios remotos"
log "HEAD previo: $(git log --oneline -1)"

# --- 0. estado inicial, para comparar después ---
BASE_TESTS=$(npx vitest run 2>&1 | grep -oE "Tests +[0-9]+ passed" | grep -oE "[0-9]+" | head -1)
BASE_TESTS=${BASE_TESTS:-0}
BASE_HEAD=$(git rev-parse HEAD)

# --- 1. PM ---
log ">> agy $AGY_MODEL"
timeout 4800 agy -p "$(cat delegacion/prompt-agy.md)" --dangerously-skip-permissions \
  --model "$AGY_MODEL" --print-timeout 60m >>"$LOG" 2>&1
log "AGY_EXIT=$?"

# --- 2. contributor ---
log ">> command-code $MODEL_CC"
timeout 4800 command-code -p "$(cat delegacion/prompt-cmd.md)" --trust --dangerously-skip-permissions \
  --tools-all --skip-onboarding --max-turns 120 -m "$MODEL_CC" >>"$LOG" 2>&1
log "CC_EXIT=$?"

# --- 3. verificación dura (no nos creemos el reporte de nadie) ---
NEW_HEAD=$(git rev-parse HEAD)
DIRTY=$(git status --porcelain | wc -l)
TESTS_RAW=$(npx vitest run 2>&1 | tail -6)
TESTS=$(echo "$TESTS_RAW" | grep -oE "Tests +[0-9]+ passed" | grep -oE "[0-9]+" | head -1); TESTS=${TESTS:-0}
FAILED=$(echo "$TESTS_RAW" | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" | head -1); FAILED=${FAILED:-0}
LINT=$(npm run lint 2>&1 | tail -1 | grep -oE "[0-9]+ errors" | grep -oE "[0-9]+" | head -1); LINT=${LINT:-0}
BUILD_OK=no
timeout 600 npm run build >/tmp/eventhub-build-$TS.log 2>&1 && BUILD_OK=si

STATUS=verde
[ "$FAILED" != "0" ] && STATUS=rojo
[ "$BUILD_OK" != "si" ] && STATUS=rojo
[ "$LINT" -gt "$LINT_BASELINE" ] && STATUS=rojo
[ "$DIRTY" != "0" ] && STATUS="sucio"

say "COMMITS_nuevos=$(git rev-list "$BASE_HEAD".."$NEW_HEAD" --count 2>/dev/null || echo '?') | tests=${TESTS}(prev $BASE_TESTS, failed=$FAILED) | lint=${LINT}/${LINT_BASELINE} | build=$BUILD_OK | working_tree_sucio=$DIRTY | estado=$STATUS"
say "log: $LOG"

if [ "$STATUS" != "verde" ]; then
  say "⛔ Ronda detenida: el repo no quedó sano (ver $LOG y /tmp/eventhub-build-$TS.log). No lanzo otra ronda hasta que se arregle."
  touch "$HOME/.cache/eventhub/BLOCKED"
fi
if [ "$DIRTY" != "0" ]; then
  say "ℹ️ archivos sin commitear:"
  git status --short | head -8 | tee -a "$LOG"
fi
