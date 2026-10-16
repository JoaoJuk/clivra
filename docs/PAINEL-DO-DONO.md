# Painel do dono

Guia para **você** acompanhar e controlar o CLIVRA sem depender dos agentes.
Os comandos aqui estão prontos para copiar e colar.

---

## 0. Como o app funciona para a família

- **Todo mundo usa o mesmo app** (https://clivra-puce.vercel.app), com as
  mesmas telas. Cada pessoa tem a própria conta e vê **só os próprios**
  cartões, gastos e categorias. Ninguém vê os dados de ninguém, **nem você**.
- **Você é o admin.** A sua conta tem a mais o **Painel admin**, no topo de
  **Ajustes**. Os outros não veem esse painel.
- **Ninguém se cadastra sozinho.** Só entra quem você convidar pelo painel.
- **A homologação é só sua.** Ela é o app de testes. A família não entra
  nela: o link exige o seu login da Vercel e o banco é separado.

### Painel admin (Ajustes → Painel admin)

| Parte | O que mostra / faz |
|---|---|
| **Sistema** | Ambiente (Produção/Homologação), se a API está no ar, versão publicada e data do último backup |
| **Pessoas** | Quem tem conta, último acesso e em quantos aparelhos está. **Desconectar** tira a pessoa de todos os aparelhos (ela entra de novo com a senha). **Bloquear** tira e impede de entrar até você desbloquear |
| **Convites** | Convites pendentes (com **Revogar**) e o campo **Convidar por e-mail** |

### Convidar alguém da família
1. Ajustes → Painel admin → **Convidar por e-mail** → digite o e-mail → **Enviar convite**.
2. A pessoa recebe um e-mail de `clivra.net@gmail.com`.
3. Ela abre o app, toca em **Criar conta** e usa **esse mesmo e-mail**. Não
   aparece campo de código de configuração para ela.
4. Ela recebe um código de 6 dígitos, confirma e já entra.

O convite vale 7 dias. Se vencer, é só convidar de novo.

### Se perder o celular ou desconfiar de algo
Painel admin → na sua linha (ou na da pessoa) → **Desconectar**. Todos os
aparelhos saem na hora. Depois, troque a senha em "Esqueci minha senha".

---

## 1. Abrir o Git Bash

Os comandos de deploy são escritos para o **Git Bash**. Ele já está instalado
no seu PC, junto com o Git. Use o Git Bash, e não o PowerShell, porque o
PowerShell muda as aspas e quebra os comandos.

- **Pelo menu Iniciar:** digite `Git Bash` e abra.
- **Pela pasta:** no Explorador de Arquivos, abra `C:\Cartao`, clique com o
  botão direito num espaço vazio → *Mostrar mais opções* → **Open Git Bash here**.
- **No VS Code:** no terminal (`Ctrl+'`), clique na setinha ao lado do `+` e
  escolha **Git Bash**.

No Git Bash, `C:\Cartao` se escreve `/c/Cartao`. Para colar, use o botão
direito do mouse ou `Shift+Insert`.

---

## 2. Os dois ambientes

| | Homologação (testes) | Produção (de verdade) |
|---|---|---|
| Para quê | Testar antes de liberar | O app que você usa |
| Branch do git | `develop` | `main` |
| App (front) | Link de *Preview* da Vercel (veja abaixo) | https://clivra-puce.vercel.app |
| API (back) | `clivra-api-hml.163-176-182-24.sslip.io` | `clivra-api.163-176-182-24.sslip.io` |
| Banco de dados | `clivra_hml`, só dados de teste | `clivra`, seus dados reais |
| Segredos (na VPS) | `/etc/clivra/clivra-hml.env` | `/etc/clivra/clivra.env` |
| Código de configuração (só para criar a conta do admin) | um próprio | um próprio |
| Quem entra | só você | você e quem você convidar |

Os dois ambientes ficam na mesma VPS, mas um não enxerga o outro: cada um tem
seu próprio usuário Linux, seu banco e seus segredos. Uma falha na homologação
não chega aos seus dados reais.

### Regra de ouro
**Nada vai para a produção sem você testar na homologação.** O script de
deploy da produção recusa qualquer versão que não esteja na branch `main` do
GitHub.

### Achar o link da homologação (front)
1. Entre em https://vercel.com → projeto **clivra** → aba **Deployments**.
2. Procure o deploy mais recente com a branch **develop**. O tipo dele é *Preview*.
3. Clique nele e depois em **Visit**. A Vercel pode pedir o seu login: é uma
   proteção para que só você veja a homologação.

No iPhone, abra esse link no Safari. Se quiser, adicione à Tela de Início
também; o ícone fica separado do app de produção.

---

## 3. Comandos

Todos rodam no Git Bash, a partir da pasta do back-end:

```bash
cd /c/Cartao/backend
```

### Preparar a homologação (uma vez só)
```bash
bash deploy/setup-hml.sh
```
Cria o usuário, o banco, os segredos (gerados dentro da VPS), o serviço e o
endereço da homologação. Pode rodar de novo sem estragar nada. Deve terminar
com `OK: homologação preparada`.

### Publicar o back na homologação
```bash
git checkout develop && git pull
bash deploy/deploy.sh hml
```

### Publicar o back na produção (depois de aprovar na homologação)
```bash
git checkout main && git pull
bash deploy/deploy.sh prod
```

O **front** é publicado sozinho pela Vercel: um push em `develop` gera o
*Preview* e um push em `main` atualiza a produção.

### Copiar o código de configuração (só para criar a conta do admin)
```bash
ssh oracle "sudo grep OWNER_SETUP_CODE /etc/clivra/clivra-hml.env" | cut -d= -f2- | tr -d '\r\n' | clip   # homologação
ssh oracle "sudo grep OWNER_SETUP_CODE /etc/clivra/clivra.env" | cut -d= -f2- | tr -d '\r\n' | clip       # produção
```
Não aparece nada na tela: o código vai direto para a área de transferência.
Passe para o celular por um canal só seu (WhatsApp "você mesmo", rascunho de
e-mail) e apague depois. Não cole em nenhum chat. Os familiares nunca
precisam dele.

### O sistema está no ar?
```bash
ssh oracle "systemctl is-active clivra clivra-hml postgresql caddy"
```
O certo são quatro linhas `active`.

### Ver os erros recentes da API
```bash
ssh oracle "sudo journalctl -u clivra --since '1 hour ago' --no-pager"       # produção
ssh oracle "sudo journalctl -u clivra-hml --since '1 hour ago' --no-pager"   # homologação
```
O log nunca tem valor, estabelecimento nem senha (regra P4).

### Voltar para a versão anterior (se um deploy der problema)
```bash
ssh oracle "ls -1t /opt/clivra/releases"
```
A primeira linha é a versão atual e a segunda é a anterior. Para voltar,
troque `NOME-DA-ANTERIOR` pelo nome da segunda linha:
```bash
ssh oracle "sudo ln -sfn /opt/clivra/releases/NOME-DA-ANTERIOR /opt/clivra/current && sudo systemctl restart clivra"
```
Na homologação é igual, trocando `/opt/clivra` por `/opt/clivra-hml` e
`clivra` por `clivra-hml`.

### Backups do banco de produção
```bash
ssh oracle "sudo ls -lh /var/backups/clivra"
```
É feito um por dia, e cada um fica guardado 14 dias.

---

## 4. Onde ver cada coisa

| O quê | Onde |
|---|---|
| Código e histórico de cada mudança | https://github.com/JoaoJuk/clivra (aba *Commits*) |
| Deploys do front | https://vercel.com → projeto clivra → *Deployments* |
| Decisões e pendências entre os agentes | `docs/DECISOES.md` |
| Formato da API | `docs/CONTRATO-API.md` |

## 5. Cuidados com a rede

Se a rede onde você está tiver um firewall que inspeciona HTTPS (em
2026-10-16 vimos isso no PC: um **Fortinet** trocando o certificado), quem
administra essa rede pode, em tese, ver o que passa por ela. Para dados
financeiros, use **4G/5G ou o Wi-Fi de casa**.

*Em breve, neste guia: alerta por e-mail de login em aparelho novo.*
