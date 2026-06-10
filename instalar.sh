#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  RC Convênios — Script de instalação para VPS Ubuntu/Debian
#  Execute como root: bash instalar.sh
# ═══════════════════════════════════════════════════════════

set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   RC Convênios — Instalação VPS      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── Verifica se é root ──────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo "  ❌  Execute como root: sudo bash instalar.sh"
  exit 1
fi

# ── 1. Atualiza o sistema ───────────────────────────────────
echo "  📦  Atualizando o sistema..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Instala Node.js 20 LTS ───────────────────────────────
echo "  📦  Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - -qq
apt-get install -y nodejs -qq
echo "  ✅  Node.js $(node -v)"

# ── 3. Instala PM2 (mantém o Node rodando sempre) ───────────
echo "  📦  Instalando PM2..."
npm install -g pm2 -q
echo "  ✅  PM2 instalado"

# ── 4. Instala Caddy (servidor web + HTTPS automático) ──────
echo "  📦  Instalando Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl -qq
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
apt-get update -qq && apt-get install caddy -y -qq
echo "  ✅  Caddy instalado"

# ── 5. Cria pasta do sistema ────────────────────────────────
echo "  📁  Configurando pasta do sistema..."
mkdir -p /var/www/convenios
echo "  ✅  Pasta criada: /var/www/convenios"

echo ""
echo "  ════════════════════════════════════════"
echo "  ✅  Instalação concluída!"
echo "  ════════════════════════════════════════"
echo ""
echo "  Próximos passos:"
echo ""
echo "  1. Copie os arquivos para o servidor:"
echo "     scp -r convenios-sistema/* root@SEU_IP:/var/www/convenios/"
echo ""
echo "  2. Instale as dependências:"
echo "     cd /var/www/convenios && npm install"
echo ""
echo "  3. Configure o domínio no Caddyfile:"
echo "     nano /var/www/convenios/Caddyfile"
echo "     (troque rcconvenios.com.br pelo seu domínio)"
echo ""
echo "  4. Suba o sistema:"
echo "     bash /var/www/convenios/iniciar.sh"
echo ""
