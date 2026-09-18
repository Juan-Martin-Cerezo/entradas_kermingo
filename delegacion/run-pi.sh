#!/usr/bin/env bash
# Corre EN LA PI. Uso: bash delegacion/run-pi.sh [repo]
# Secuencial: (1) PM = agy (Gemini 3.8 Flash Medium), (2) contributor = Command Code (muse-spark-1.3-contributor).
# Modelos verificados contra `agy models` y `command-code --list-models` (2026-09-18).
set -uo pipefail
REPO="${1:-$HOME/entradas_kermingo}"
cd "$REPO" || exit 1
TS=$(date +%Y%m%d-%H%M%S)
OUT="$HOME/.cache/delegacion-eventhub-pi-$TS.log"
mkdir -p "$(dirname "$OUT")"
AGY_MODEL="${AGY_MODEL:-gemini-3.8-flash-medium}"
MODEL_CC="${MODEL_CC:-meta/muse-spark-1.3-contributor}"

log() { echo "$@" | tee -a "$OUT"; }
log "== EventHub Pi delegation $TS — $REPO =="
git pull --ff-only -q 2>&1 | tee -a "$OUT" || true
log "HEAD: $(git log --oneline -1)"

log ">> PM: agy --model $AGY_MODEL (print-timeout 60m)"
timeout 4800 agy -p "$(cat delegacion/prompt-agy.md)" \
  --dangerously-skip-permissions --model "$AGY_MODEL" --print-timeout 60m >>"$OUT" 2>&1
log "AGY_EXIT=$?"

log ">> contributor: command-code -m $MODEL_CC"
timeout 4800 command-code -p "$(cat delegacion/prompt-cmd.md)" \
  --trust --dangerously-skip-permissions --tools-all --skip-onboarding \
  --max-turns 120 -m "$MODEL_CC" >>"$OUT" 2>&1
log "CC_EXIT=$?"

log "== fin — commits nuevos: =="
git log --oneline -8 | tee -a "$OUT"
log "log completo: $OUT"
