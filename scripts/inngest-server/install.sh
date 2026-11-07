#!/bin/zsh
# 在 Mac Studio 上装自托管的 Inngest（后台任务服务），并用 Cloudflare Tunnel 让 Vercel 上的网站连回来。
# 用法见 docs/setup.md 第 9 步。可以重复运行：密钥和隧道已有就沿用，只重写启动配置。
#
#   zsh scripts/inngest-server/install.sh
#
# 可选环境变量：
#   SITE=https://ifai.io             网站地址（Inngest 到这里调 /api/inngest）
#   PUBLIC_HOST=inngest.ifai.io      隧道对外的域名（网站的 INNGEST_BASE_URL）
#   UI_HOST=127.0.0.1                控制台监听的地址；改成 0.0.0.0 才能从局域网其他电脑打开
set -euo pipefail

SITE=${SITE:-https://ifai.io}
PUBLIC_HOST=${PUBLIC_HOST:-inngest.ifai.io}
UI_HOST=${UI_HOST:-127.0.0.1}
CLI_VERSION=1.46.0 # 和 package.json 的 pnpm inngest 用同一个版本
TUNNEL=ifai-inngest
HOME_DIR="$HOME/.ifai-inngest"
AGENTS="$HOME/Library/LaunchAgents"
HERE=${0:A:h}

[[ "$(uname)" == Darwin ]] || { echo "只支持 macOS（launchd）。" >&2; exit 1 }
command -v node >/dev/null || { echo "缺 Node：先装 Node 22（brew install node@22）。" >&2; exit 1 }
command -v cloudflared >/dev/null || { echo "缺 cloudflared：先运行 brew install cloudflared。" >&2; exit 1 }

mkdir -p "$HOME_DIR/data" "$HOME_DIR/logs" "$AGENTS"
chmod 700 "$HOME_DIR"

# 1. Inngest 服务本身（开源版，单机：SQLite + 内置 Redis，数据在 ~/.ifai-inngest/data）
echo "→ 安装 inngest-cli@$CLI_VERSION"
npm install --silent --no-fund --no-audit --prefix "$HOME_DIR/cli" "inngest-cli@$CLI_VERSION" >/dev/null
[[ -x "$HOME_DIR/cli/node_modules/.bin/inngest" ]] || { echo "inngest-cli 没装好。" >&2; exit 1 }

# 2. 密钥：只生成一次。网站和服务两边要一致，换了要同步改 Vercel
if [[ ! -f "$HOME_DIR/keys.env" ]]; then
  echo "→ 生成事件密钥和签名密钥"
  umask 077
  {
    echo "INNGEST_EVENT_KEY=$(openssl rand -hex 24)"
    echo "INNGEST_SIGNING_KEY_HEX=$(openssl rand -hex 32)"
  } > "$HOME_DIR/keys.env"
fi

sed -e "s|@HOME_DIR@|$HOME_DIR|g" -e "s|@SITE@|$SITE|g" -e "s|@UI_HOST@|$UI_HOST|g" \
  "$HERE/run-inngest.sh" > "$HOME_DIR/run-inngest.sh"
chmod 700 "$HOME_DIR/run-inngest.sh"

# 3. Cloudflare Tunnel：只把网站要用的几个接口放出去，控制台（/v0/gql）不对外
if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "→ 浏览器会打开 Cloudflare 授权页，选 ifai.io 这个域名"
  cloudflared tunnel login
fi
tunnel_id() {
  cloudflared tunnel list --output json --name "$TUNNEL" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s||"[]")||[];console.log(t[0]?.id??"")})'
}
TUNNEL_ID=$(tunnel_id)
if [[ -z "$TUNNEL_ID" ]]; then
  echo "→ 新建隧道 $TUNNEL"
  cloudflared tunnel create "$TUNNEL"
  TUNNEL_ID=$(tunnel_id)
fi
cloudflared tunnel route dns --overwrite-dns "$TUNNEL" "$PUBLIC_HOST" >/dev/null
sed -e "s|@TUNNEL_ID@|$TUNNEL_ID|g" -e "s|@CREDENTIALS@|$HOME/.cloudflared/$TUNNEL_ID.json|g" -e "s|@PUBLIC_HOST@|$PUBLIC_HOST|g" \
  "$HERE/cloudflared.yml" > "$HOME_DIR/cloudflared.yml"

# 4. 两个常驻服务：开机登录后自动起来，挂了自动重启
CLOUDFLARED=$(command -v cloudflared)
write_agent() { # label program args...
  local label=$1; shift
  local args=""
  for arg in "$@"; do args+="    <string>$arg</string>"$'\n'; done
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
$args  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$(command -v node)"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME_DIR/logs/$label.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/logs/$label.log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$label.plist"
}
write_agent io.ifai.inngest /bin/zsh "$HOME_DIR/run-inngest.sh"
write_agent io.ifai.inngest-tunnel "$CLOUDFLARED" tunnel --no-autoupdate --config "$HOME_DIR/cloudflared.yml" run "$TUNNEL"

# 5. 检查
sleep 5
source "$HOME_DIR/keys.env"
local_status=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8288/" || true)
public_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$PUBLIC_HOST/e/not-a-key" -d '{}' || true)
echo
echo "本机控制台：http://$([[ $UI_HOST == 0.0.0.0 ]] && ipconfig getifaddr en0 || echo 127.0.0.1):8288  （状态 $local_status，应为 200）"
echo "隧道：https://$PUBLIC_HOST/e/…  （错的密钥应得 401，现在是 $public_status；刚建的域名可能要等一两分钟）"
echo
echo "把下面三项填进 Vercel → Settings → Environment Variables，只勾 Production，然后重新部署："
echo "  INNGEST_BASE_URL=https://$PUBLIC_HOST"
echo "  INNGEST_EVENT_KEY=$INNGEST_EVENT_KEY"
echo "  INNGEST_SIGNING_KEY=signkey-prod-$INNGEST_SIGNING_KEY_HEX"
