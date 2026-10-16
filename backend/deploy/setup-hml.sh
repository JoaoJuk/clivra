#!/usr/bin/env bash
# Prepara a HOMOLOGAÇÃO na VPS. Roda uma vez (pode repetir sem estragar nada).
# Do Git Bash, na pasta backend/:  bash deploy/setup-hml.sh
#
# Cria: usuário Linux e role/banco Postgres `clivra_hml`, /opt/clivra-hml,
# /etc/clivra/clivra-hml.env (segredos NOVOS gerados na própria VPS; o SMTP é
# copiado da produção), o serviço clivra-hml e o bloco do Caddy.
set -euo pipefail
cd "$(dirname "$0")"

scp -q clivra-hml.service Caddyfile.clivra-hml oracle:/tmp/

ssh oracle 'sudo bash -s' <<'REMOTE'
set -euo pipefail

id clivra_hml >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin clivra_hml

# Peer auth: o usuário Linux clivra_hml entra só na role clivra_hml, sem senha.
if ! runuser -u postgres -- psql -Atc "select 1 from pg_roles where rolname = 'clivra_hml'" | grep -q 1; then
  runuser -u postgres -- createuser clivra_hml
fi
if ! runuser -u postgres -- psql -Atc "select 1 from pg_database where datname = 'clivra_hml'" | grep -q 1; then
  runuser -u postgres -- createdb -O clivra_hml clivra_hml
fi

mkdir -p /opt/clivra-hml/releases

ENV_FILE=/etc/clivra/clivra-hml.env
if [ ! -f "$ENV_FILE" ]; then
  (
    umask 077
    {
      echo 'NODE_ENV=production'
      echo 'HOST=127.0.0.1'
      echo 'PORT=3334'
      echo 'DATABASE_URL=postgres:///clivra_hml?host=/var/run/postgresql'
      echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
      echo "OWNER_SETUP_CODE=$(openssl rand -base64 24 | tr -d '/+=\n')"
      echo 'CORS_ORIGINS='
      echo 'COOKIE_SECURE=true'
      echo 'TRUST_PROXY=1'
      grep -E '^SMTP_(USER|PASS)=' /etc/clivra/clivra.env
    } > "$ENV_FILE"
  )
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Criado $ENV_FILE"
else
  echo "$ENV_FILE já existe (mantido)"
fi

install -m 644 -o root -g root /tmp/clivra-hml.service /etc/systemd/system/clivra-hml.service
rm -f /tmp/clivra-hml.service
systemctl daemon-reload
systemctl enable clivra-hml >/dev/null 2>&1

if ! grep -q 'clivra-api-hml\.' /etc/caddy/Caddyfile; then
  # Valida uma cópia antes: erro aqui não deixa o Caddyfile de verdade quebrado.
  NEW=$(mktemp)
  { cat /etc/caddy/Caddyfile; echo; cat /tmp/Caddyfile.clivra-hml; } > "$NEW"
  caddy validate --config "$NEW" --adapter caddyfile >/dev/null
  cp -p /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date -u +%Y%m%d%H%M%S)"
  cat "$NEW" > /etc/caddy/Caddyfile
  rm -f "$NEW"
  systemctl reload caddy
  echo "Caddy: bloco da homologação adicionado"
else
  echo "Caddy: bloco da homologação já existe"
fi
rm -f /tmp/Caddyfile.clivra-hml

echo "OK: homologação preparada. Agora: bash deploy/deploy.sh hml"
REMOTE
