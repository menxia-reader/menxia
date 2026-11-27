#!/usr/bin/env bash
# 浏览器 E2E（对真 staging 门下服务）——「推 TF / 发布前」由 Hermes 跑的本地门禁，不进 CI、test/run.sh 不默认跑。
# 只能这样运行（凭证由包装脚本注入环境变量，本脚本与 run.mjs 都不读 token 文件、不打印 token）：
#   /Users/charliezong/Developer/op/tools/menxia-web-e2e.sh <worktree> test/run-e2e.sh [用例名,用例名]
# 退出码：0 全过；1 有失败；3 无失败但有 PENDING（staging 新钩子未上线）。详见 docs/E2E.md。
set -uo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] && [ -x "$CHROME" ] || { echo "✖ 找不到 Chrome（设 CHROME=/path/to/chrome）"; exit 1; }
export CHROME

# 静态站：与 run-browser.sh 同法——随机端口、探活换端口，绝不连到别的 worktree 起的服务器
HOST="${E2E_HOST:-127.0.0.1}"
LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/menxia-e2e-log.XXXXXX")"
PORT="${PORT:-$(( 4988 + RANDOM % 800 ))}"
SERVER=""
trap 'kill $SERVER 2>/dev/null; rm -rf "$LOGDIR" 2>/dev/null' EXIT
for _ in $(seq 1 20); do
  python3 -u -m http.server "$PORT" --bind "$HOST" >"$LOGDIR/server.log" 2>&1 &
  SERVER=$!
  sleep 0.5
  kill -0 "$SERVER" 2>/dev/null && break
  PORT=$(( 4988 + RANDOM % 800 ))
done

export APP_URL="http://$HOST:$PORT/"
export E2E_ONLY="${1:-}"
echo "── 浏览器 E2E（真 staging：${MENXIA_E2E_URL:-未注入}；站点 ${APP_URL}）──"
node test/e2e/run.mjs
