#!/bin/bash
# 麦克罗 MAC·RO 服务器部署脚本（Ubuntu + nginx + systemd + certbot）
# 用环境变量指定你自己的服务器，脚本里不保存任何服务器信息：
#   export DEPLOY_HOST=ubuntu@your.server.ip   DEPLOY_KEY=~/.ssh/your_key.pem   DEPLOY_DOMAIN=macro.example.com
#   bash deploy/deploy.sh setup   # 首次：建目录、写 env、装 systemd 服务、装 nginx 站点（HTTP）
#   bash deploy/deploy.sh cert    # DNS 生效后：certbot 申请证书并开启 HTTPS
#   bash deploy/deploy.sh         # 日常发布：上传代码 → 重启服务 → 验证
# 只新增 mcd-macro 服务和独立的 nginx 站点文件，不改动服务器上已有的其他站点
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${DEPLOY_KEY:?请设置 DEPLOY_KEY（SSH 私钥路径）}"
HOST="${DEPLOY_HOST:?请设置 DEPLOY_HOST（如 ubuntu@1.2.3.4）}"
DOMAIN="${DEPLOY_DOMAIN:?请设置 DEPLOY_DOMAIN（如 macro.example.com）}"
REMOTE="${DEPLOY_DIR:-/opt/mcd-macro}"
PORT="${DEPLOY_PORT:-3020}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=20 "$HOST")

upload() {
  echo "── 上传代码到 $REMOTE ──"
  rsync -az -e "ssh -i $KEY -o BatchMode=yes" \
    --exclude '.env' --exclude '.probe' --exclude '.claude' --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store' \
    "$HERE/server.js" "$HERE/package.json" "$HERE/public" "$HOST:$REMOTE/"
}

setup() {
  "${SSH[@]}" "sudo mkdir -p $REMOTE && sudo chown ubuntu:ubuntu $REMOTE"
  upload
  echo "── 写入 /etc/mcd-macro.env（Token 只在服务器，权限 600）──"
  TOKEN=$(grep '^MCD_MCP_TOKEN=' "$HERE/.env" | cut -d= -f2-)
  [ -n "$TOKEN" ] || { echo "❌ 本地 .env 没有 MCD_MCP_TOKEN"; exit 1; }
  printf 'MCD_MCP_TOKEN=%s\nPORT=%s\nHOST=127.0.0.1\nPUBLIC_MODE=0\n' "$TOKEN" "$PORT" \
    | "${SSH[@]}" "sudo tee /etc/mcd-macro.env >/dev/null && sudo chmod 600 /etc/mcd-macro.env"
  echo "── 安装 systemd 服务 mcd-macro ──"
  "${SSH[@]}" "sudo tee /etc/systemd/system/mcd-macro.service >/dev/null" <<EOF
[Unit]
Description=McDonald's Macro Calculator ($DOMAIN)
After=network-online.target

[Service]
User=ubuntu
WorkingDirectory=$REMOTE
EnvironmentFile=/etc/mcd-macro.env
ExecStart=/usr/local/bin/node $REMOTE/server.js
Restart=always
RestartSec=3
MemoryMax=256M
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
  "${SSH[@]}" "sudo systemctl daemon-reload && sudo systemctl enable --now mcd-macro && sleep 1 && systemctl is-active mcd-macro"
  echo "── 安装 nginx 站点（独立文件，不改其他站点）──"
  "${SSH[@]}" "sudo tee /etc/nginx/sites-available/mcd-macro.conf >/dev/null" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    server_tokens off;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
  "${SSH[@]}" "sudo ln -sf /etc/nginx/sites-available/mcd-macro.conf /etc/nginx/sites-enabled/mcd-macro.conf && sudo nginx -t && sudo systemctl reload nginx"
  verify
}

cert() {
  echo "── 检查 DNS ──"
  local ip; ip=$(dig +short "$DOMAIN" A | tail -1)
  local want="${HOST#*@}"
  [ "$ip" = "$want" ] || { echo "❌ $DOMAIN 还没解析到 $want（当前：${ip:-无}），请先添加 A 记录"; exit 1; }
  "${SSH[@]}" "sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --redirect && sudo nginx -t && sudo systemctl reload nginx"
  verify
}

release() {
  upload
  "${SSH[@]}" "sudo systemctl restart mcd-macro && sleep 1 && systemctl is-active mcd-macro"
  verify
}

verify() {
  echo "── 验证 ──"
  "${SSH[@]}" "curl -fsS http://127.0.0.1:$PORT/api/health && echo && systemctl is-active mcd-macro nginx | tr '\n' ' ' && echo"
  curl --noproxy "*" -s -o /dev/null -w "https://$DOMAIN → %{http_code}\n" --max-time 10 "https://$DOMAIN/" || true
}

case "${1:-release}" in
  setup) setup ;;
  cert) cert ;;
  release) release ;;
  *) echo "用法: bash deploy/deploy.sh [setup|cert|release]"; exit 1 ;;
esac
