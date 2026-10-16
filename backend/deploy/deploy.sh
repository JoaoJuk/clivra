#!/usr/bin/env bash
# Deploy da API na VPS. Rodar do Git Bash, na pasta backend/:  ./deploy/deploy.sh
# Requer o host "oracle" no ~/.ssh/config. Pula os testes com SKIP_TESTS=1.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain -- .)" ]; then
  echo "Há mudanças não commitadas em backend/. Faça commit antes do deploy." >&2
  exit 1
fi

npm run typecheck
[ "${SKIP_TESTS:-0}" = "1" ] || npm test
rm -rf dist && npm run build

RELEASE="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
TARBALL="$(mktemp -d)/clivra-$RELEASE.tgz"
tar -czf "$TARBALL" dist drizzle package.json package-lock.json
scp -q "$TARBALL" oracle:/tmp/clivra-release.tgz
rm -f "$TARBALL"

ssh oracle "RELEASE=$RELEASE bash -s" <<'REMOTE'
set -euo pipefail
DIR=/opt/clivra/releases/$RELEASE
sudo mkdir -p "$DIR"
sudo tar -xzf /tmp/clivra-release.tgz -C "$DIR"
rm -f /tmp/clivra-release.tgz
# --ignore-scripts: nenhum pacote executa código na instalação.
sudo env PATH=/opt/node/bin:$PATH npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$DIR" >/dev/null
sudo chown -R root:root "$DIR" && sudo chmod -R go-w "$DIR"
sudo ln -sfn "$DIR" /opt/clivra/current
sudo systemctl restart clivra
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3333/v1/health >/dev/null 2>&1; then
    echo "OK: release $RELEASE no ar"
    # Mantém as 3 últimas releases.
    ls -1dt /opt/clivra/releases/* | tail -n +4 | xargs -r sudo rm -rf
    exit 0
  fi
  sleep 1
done
echo "FALHOU: API não respondeu. Últimas linhas do log:" >&2
sudo journalctl -u clivra -n 30 --no-pager >&2
exit 1
REMOTE
