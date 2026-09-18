#!/usr/bin/env bash
# Corre EN LA PI. Uso: bash delegacion/dispatch.sh
# Busca la Dell G15 (túnel inverso :2222 → tailscale), clona/actualiza el repo y corre
# delegacion/remote-run.sh allá (PM Antigravity + contributor Command Code).
# Salida: en foreground para debug; para deleción real usar la version background del watchdog.
set -uo pipefail
SLUG="Juan-Martin-Cerezo/entradas_kermingo"
REPO_NAME="entradas_kermingo"

SSH=""
for T in "-p 2222 juan@127.0.0.1" "juan@100.78.55.63"; do
  if ssh $T -o ConnectTimeout=6 true 2>/dev/null; then SSH="ssh $T"; break; fi
done
[ -z "$SSH" ] && { echo "G15 NO alcanzable (túnel :2222 y tailscale 100.78.55.63 sin respuesta)"; exit 2; }
echo "G15 alcanzable vía: $SSH"

REMOTE=$(cat <<'EOS'
export PATH="$HOME/.npm-global/bin:$PATH"
D="$HOME/Escritorio/Programacion/Proyectos/entradas_kermingo"
if [ -d "$D/.git" ]; then cd "$D" && git pull --ff-only -q; else mkdir -p "$(dirname "$D")" && git clone "https://github.com/Juan-Martin-Cerezo/entradas_kermingo.git" "$D"; fi
cd "$D" || exit 1
git log --oneline -1
bash delegacion/remote-run.sh
EOS
)

$SSH "$REMOTE"
