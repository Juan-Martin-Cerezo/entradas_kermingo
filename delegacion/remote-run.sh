#!/usr/bin/env bash
# Corre EN LA DELL (G15 o Vostro), desde cualquier cwd: bash delegacion/remote-run.sh
# Dispara: (1) PM = Antigravity CLI (Gemini 3.8 Flash, effort medium)
#          (2) contributor = Command Code (muse spark 1.3, fallback deepseek-v4-flash)
# Log: ~/delegacion-eventhub-<ts>.log
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1
TS=$(date +%Y%m%d-%H%M%S)
OUT="$HOME/delegacion-eventhub-$TS.log"
AGY_MODEL="${AGY_MODEL:-gemini-3.8-flash}"
AGY_EFFORT="${AGY_EFFORT:-medium}"

log() { echo "$@" | tee -a "$OUT"; }
has_flag() { "$1" --help 2>&1 | grep -q -- "$2"; }
export PATH="$HOME/.npm-global/bin:$PATH"

log "== EventHub delegation $TS — $(hostname) — $REPO_ROOT =="
[ -f delegacion/prompt-agy.md ] && [ -f delegacion/prompt-cmd.md ] || { log "FATAL: faltan delegacion/prompt-*.md"; exit 1; }

AGY=$(command -v agy || command -v antigravity || true)
CC=$(command -v command-code || true)

# ---- discovery (queda en el log para no adivinar flags la próxima) ----
{
  echo "--- agy: ${AGY:-NO ENCONTRADO}"
  [ -n "$AGY" ] && { "$AGY" --version 2>&1 | head -2; "$AGY" --help 2>&1 | head -45; }
  echo "--- command-code: ${CC:-NO ENCONTRADO}"
  [ -n "$CC" ] && { "$CC" --version 2>&1 | head -2; "$CC" models 2>&1 | head -45; }
} | tee -a "$OUT"

# ---- modelo del contributor ----
MODEL_CC="deepseek/deepseek-v4-flash"
if [ -n "$CC" ]; then
  MUSE=$("$CC" models 2>/dev/null | grep -iE "muse|spark" | head -1 | awk '{print $1}')
  if [ -n "${MUSE:-}" ]; then MODEL_CC="$MUSE"; else log "WARN: 'muse spark 1.3' no listado en 'command-code models' → fallback $MODEL_CC"; fi
fi

# ---- 1) PM: Antigravity ----
if [ -n "$AGY" ]; then
  ARGS=(-p "$(cat delegacion/prompt-agy.md)")
  has_flag "$AGY" "--trust" && ARGS+=(--trust)
  has_flag "$AGY" "dangerously-skip-permissions" && ARGS+=(--dangerously-skip-permissions)
  has_flag "$AGY" "model" && ARGS+=(--model "$AGY_MODEL")
  has_flag "$AGY" "effort" && ARGS+=(--effort "$AGY_EFFORT")
  log ">> agy ${ARGS[*]:0:120} ..."
  timeout 1800 "$AGY" "${ARGS[@]}" >>"$OUT" 2>&1
  log "AGY_EXIT=$?"
else
  log "SKIP agy: binario no encontrado (probá 'agy', 'antigravity', o el nombre real de la instalación)"
fi

# ---- 2) contributor: Command Code ----
if [ -n "$CC" ]; then
  log ">> command-code -m $MODEL_CC (contributor)"
  timeout 1800 "$CC" -p "$(cat delegacion/prompt-cmd.md)" \
    --trust --dangerously-skip-permissions --tools-all --max-turns 80 -m "$MODEL_CC" >>"$OUT" 2>&1
  log "CC_EXIT=$?"
else
  log "SKIP command-code: binario no encontrado"
fi

log "== fin $TS — log completo: $OUT =="
tail -30 "$OUT"
