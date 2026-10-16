#!/usr/bin/env bash
# Deploy da API na VPS. Rodar do Git Bash, na pasta backend/:
#   bash deploy/deploy.sh hml    → homologação (qualquer branch, normalmente develop)
#   bash deploy/deploy.sh prod   → produção (só o que já está em origin/main)
# Requer o host "oracle" no ~/.ssh/config. Pula os testes com SKIP_TESTS=1.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
case "$TARGET" in
  prod) SERVICE=clivra; BASE=/opt/clivra; PORT=3333 ;;
  hml) SERVICE=clivra-hml; BASE=/opt/clivra-hml; PORT=3334 ;;
  *) echo "Uso: bash deploy/deploy.sh hml|prod" >&2; exit 1 ;;
esac

if [ -n "$(git status --porcelain -- .)" ]; then
  echo "Há mudanças não commitadas em backend/. Faça commit antes do deploy." >&2
  exit 1
fi

# Produção recebe só o que passou pela homologação e foi publicado em main.
if [ "$TARGET" = prod ]; then
  git fetch -q origin main
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    echo "Produção só recebe origin/main. Faça checkout de main atualizado (git pull) antes." >&2
    exit 1
  fi
fi

npm run typecheck
[ "${SKIP_TESTS:-0}" = "1" ] || npm test
rm -rf dist && npm run build

RELEASE="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
TARBALL="$(mktemp -d)/clivra-$RELEASE.tgz"
# Versão e ambiente que o painel do admin mostra (GET /v1/admin/system).
printf '{"release":"%s","environment":"%s"}
' "$RELEASE" "$TARGET" > release.json
tar -czf "$TARBALL" dist drizzle package.json package-lock.json release.json
rm -f release.json
scp -q "$TARBALL" oracle:/tmp/clivra-release.tgz
rm -f "$TARBALL"

ssh oracle "RELEASE=$RELEASE SERVICE=$SERVICE BASE=$BASE PORT=$PORT bash -s" <<'REMOTE'
set -euo pipefail
DIR=$BASE/releases/$RELEASE
sudo mkdir -p "$DIR"
sudo tar -xzf /tmp/clivra-release.tgz -C "$DIR"
rm -f /tmp/clivra-release.tgz
# --ignore-scripts: nenhum pacote executa código na instalação.
sudo env PATH=/opt/node/bin:$PATH npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$DIR" >/dev/null
sudo chown -R root:root "$DIR" && sudo chmod -R go-w "$DIR"
sudo ln -sfn "$DIR" "$BASE/current"
sudo systemctl restart "$SERVICE"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1; then
    echo "OK: release $RELEASE no ar ($SERVICE)"
    # Mantém as 3 últimas releases.
    ls -1dt "$BASE"/releases/* | tail -n +4 | xargs -r sudo rm -rf
    exit 0
  fi
  sleep 1
done
echo "FALHOU: API não respondeu. Últimas linhas do log:" >&2
sudo journalctl -u "$SERVICE" -n 30 --no-pager >&2
exit 1
REMOTE
