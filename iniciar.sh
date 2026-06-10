#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  RC Convênios — Iniciar/reiniciar o sistema
#  Execute: bash iniciar.sh
# ═══════════════════════════════════════════════════════════

cd /var/www/convenios

echo ""
echo "  🚀  Iniciando RC Convênios..."

# Cria pasta de dados se não existir
mkdir -p data

# Para instâncias anteriores
pm2 stop rcconvenios 2>/dev/null || true
pm2 delete rcconvenios 2>/dev/null || true

# Inicia com PM2
pm2 start server.js --name rcconvenios

# Salva configuração do PM2 (reinicia após reboot)
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

# Copia Caddyfile e reinicia Caddy
cp /var/www/convenios/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy

echo ""
echo "  ✅  Sistema rodando!"
echo "  📋  Ver logs: pm2 logs rcconvenios"
echo "  🔄  Reiniciar: pm2 restart rcconvenios"
echo "  ⛔  Parar:     pm2 stop rcconvenios"
echo ""
