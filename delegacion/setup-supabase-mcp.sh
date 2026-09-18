#!/usr/bin/env bash
# Configura el MCP oficial de Supabase en agy + command-code con un PAT (sbp_...).
# Uso: bash delegacion/setup-supabase-mcp.sh <sbp_token> [project_ref]
# Idempotente. Verifica con una llamada real a list_tables antes de dar OK.
set -uo pipefail
PAT="${1:-${SUPABASE_ACCESS_TOKEN:-}}"
REF="${2:-wodzuelvlqontlthdlig}"
[ -z "$PAT" ] && { echo "Falta el PAT (sbp_...). Uso: $0 <sbp_token> [ref]"; exit 2; }
case "$PAT" in sbp_*) ;; *) echo "⚠️  El token no empieza con sbp_ — el MCP lo va a rechazar (probado: sb_secret_ da 401 en la Management API)."; exit 2;; esac
export PATH="$HOME/.npm-global/bin:$PATH"

echo "== 1/3 registro en command-code (scope user)"
timeout 90 command-code mcp add-json supabase \
  "{\"command\":\"npx\",\"args\":[\"-y\",\"@supabase/mcp-server-supabase@latest\",\"--project-ref=$REF\"],\"env\":{\"SUPABASE_ACCESS_TOKEN\":\"$PAT\"}}" \
  -s user 2>&1 | tail -3

echo "== 2/3 registro en agy"
timeout 90 agy mcp add --env SUPABASE_ACCESS_TOKEN="$PAT" supabase \
  npx -y @supabase/mcp-server-supabase@latest --project-ref="$REF" 2>&1 | tail -3

echo "== 3/3 verificación real (list_tables)"
{
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}\n'
  printf '{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
  printf '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_tables","arguments":{}}}\n'
  sleep 15
} | SUPABASE_ACCESS_TOKEN="$PAT" timeout 120 npx -y @supabase/mcp-server-supabase@latest --project-ref="$REF" 2>&1 \
  | python3 -c "
import sys, json
ok=False
for line in sys.stdin:
    line=line.strip()
    if not line.startswith('{'): continue
    try: d=json.loads(line)
    except Exception: continue
    if d.get('id')==3:
        body=json.dumps(d)
        ok='Unauthorized' not in body
        print('list_tables ->', 'OK' if ok else 'RECHAZADO (token inválido)')
print('RESULTADO:', 'MCP supabase funcionando' if ok else 'MCP supabase NO funciona')
"
echo "== fin"
