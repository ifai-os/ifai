#!/bin/zsh
# launchd 用这个脚本启动 Inngest 服务（install.sh 把 @…@ 换成实际值后放到 ~/.ifai-inngest/）。
# --poll-interval：每 5 分钟问一次网站有没有新的任务列表，部署后不用手动同步。
set -euo pipefail
source "@HOME_DIR@/keys.env"
# 去网站的请求走代理（安装时 PROXY 没填就不走）；隧道过来的本机请求不走
if [[ -n "@PROXY@" ]]; then
  export HTTPS_PROXY="@PROXY@" HTTP_PROXY="@PROXY@" NO_PROXY=127.0.0.1,localhost
fi
exec "@HOME_DIR@/cli/node_modules/.bin/inngest" start \
  --host "@UI_HOST@" \
  --port 8288 \
  --event-key "$INNGEST_EVENT_KEY" \
  --signing-key "$INNGEST_SIGNING_KEY_HEX" \
  --sdk-url "@SITE@/api/inngest" \
  --poll-interval 300 \
  --sqlite-dir "@HOME_DIR@/data"
