#!/usr/bin/env bash
# 浏览器层测试：DOM 单元（test/dom.test.html）+ 端到端冒烟（?demo=1&auto=1）
# 在真 Chrome headless 里跑，抓 console 输出判定，失败非零退出。零依赖：只要有 Chrome。
#
# 用法：test/run-browser.sh          # 两层都跑
#       test/run-browser.sh dom      # 只跑 DOM 单元
#       test/run-browser.sh smoke    # 只跑端到端冒烟
set -uo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  if [ -n "${CI:-}" ]; then
    echo "✖ CI 里找不到 Chrome —— 浏览器层不能静默跳过（那是绿色空转）"
    exit 1
  fi
  echo "跳过浏览器层：未找到 Chrome（设 CHROME=/path/to/chrome 可指定）"
  exit 0
fi

# CI 的容器里没有 user namespace，不加这两个 flag 的 Chrome 直接 core dump
CI_FLAGS=()
[ -n "${CI:-}" ] && CI_FLAGS=(--no-sandbox --disable-dev-shm-usage)

# 并发隔离：同机多 worktree 会同时跑本脚本，默认端口/日志若共享，第二个 http.server 抢不到
# 4188 端口静默死掉、Chrome 转而加载头一个 worktree 的代码，把「别的分支」的 RESULT 写进
# 共享的 /tmp/zhupi-*.log，本脚本 grep 到就误判（实测捞到隔壁 pass=63）。故端口随机化、日志入
# 本进程私有目录，两者都随 PID 唯一，互不踩踏。
LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/zhupi-log.XXXXXX")"
# 起本进程自己的服务器：端口被占（别的 worktree 先起了）时 http.server 会即刻 Errno 48 退出，
# 靠 kill -0 探活换端口重试——绝不让 Chrome 连到别人的服务器、抓回别人的 RESULT。仍只依赖 python。
PORT="${PORT:-$(( 4188 + RANDOM % 800 ))}"   # 显式 PORT= 优先；缺省随机化，避免多 worktree 撞 4188
SERVER=""
trap 'kill $SERVER 2>/dev/null; rm -rf "$LOGDIR" 2>/dev/null' EXIT
for _ in $(seq 1 20); do
  python3 -u -m http.server "$PORT" >"$LOGDIR/server.log" 2>&1 &
  SERVER=$!
  sleep 0.5
  kill -0 "$SERVER" 2>/dev/null && break     # 还活着＝端口是我们的（被占的话已 Errno 48 退出）
  PORT=$(( 4188 + RANDOM % 800 ))             # 撞了就换随机端口重试
done
sleep 0.5

# Chrome --headless 截图/加载后不会自己退出，用「产物就绪即杀」的模式跑
run_page_once() {
  local url="$1" log="$2" budget="$3" winsize="$4"
  local dir; dir="$(mktemp -d)"
  rm -f "$log"
  # budget=real：不用虚拟时间，真时钟跑，等页面自己打出 RESULT 才收工。
  # mermaid 渲在跨进程沙箱 iframe 里（要真下 3.5MB 脚本、真渲染），虚拟时钟不会等它，
  # 实测 virtual-time 下 iframe 的 load 一直不触发——这类断言只能走真时钟。
  # （--screenshot 一出图 Chrome 就退出，会把还在跑的页面脚本一起带走，所以真时钟模式不带它）
  local vt="--virtual-time-budget=$budget" shot="--screenshot=$dir/shot.png"
  [ "$budget" = "real" ] && { vt="--no-first-run"; shot="--no-default-browser-check"; }
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --enable-logging=stderr --v=0 \
    "${CI_FLAGS[@]+"${CI_FLAGS[@]}"}" \
    --window-size="$winsize" "$vt" \
    --user-data-dir="$dir" "$shot" "$url" >/dev/null 2>"$log" &
  local pid=$!
  if [ "$budget" = "real" ]; then
    for _ in $(seq 1 90); do
      grep -q '\[mm\] RESULT' "$log" 2>/dev/null && break
      sleep 1
    done
  else
    for _ in $(seq 1 60); do
      [ -s "$dir/shot.png" ] && break
      sleep 1
    done
  fi
  sleep 2
  kill $pid 2>/dev/null
  rm -rf "$dir" 2>/dev/null || true
}

# 「整组空日志」（2026-10-15 查实）：--virtual-time-budget 只在「有网络请求挂着」时停住虚拟时间。
# index.html 的 ES 模块图是一层层发现的——一个模块到了、渲染进程解析完才去请求下一个，
# 这个间隙里没有请求挂着，虚拟时间就直接快进到预算用完：Chrome 截一张空白图（app 还没挂载）
# 就退出，页面脚本一行没跑。机器一忙间隙就长，所以只在全量连跑 / pre-push 时偶发。
# 实测一次 rail 组：服务端只收到 35 个请求（正常整图是 40 个）、截图全空、零条 [rail] 输出。
# 判据只认「页面零输出」——跑起来了但断言红、或 app 真的加载即崩，都不会被重跑救回：
# 前者有输出不进重跑，后者三次都是零输出照样红。重跑一律打 ↻ 行，日志里看得见。
run_page() {
  local url="$1" log="$2" budget="$3" winsize="${4:-1440,1000}"   # 第 4 参可换窗宽，缺省桌面 1440
  local attempt r0 r1
  for attempt in 1 2 3; do
    r0=$(grep -c '"GET ' "$LOGDIR/server.log" 2>/dev/null || true)
    run_page_once "$url" "$log" "$budget" "$winsize"
    grep -qE '\[(dom|smoke|mobile|rail|mm)\] ' "$log" 2>/dev/null && return 0
    r1=$(grep -c '"GET ' "$LOGDIR/server.log" 2>/dev/null || true)
    echo "  ↻ ${url##*/} 页面零输出（第 ${attempt} 次，服务端收到 $((r1 - r0)) 个请求）——疑似虚拟时间在模块加载间隙耗尽"
  done
  # 三次都零输出：不再是那个间隙了。$LOGDIR 会被 EXIT trap 删掉，当场把日志尾巴打出来
  echo "  ⚠ ${url##*/} 三次都零输出，最后一次日志尾 15 行："
  tail -15 "$log" 2>/dev/null | sed 's/^/    | /'
}

# 钉死断言名字清单（不只是总数）：删一条加一条互相抵消时总数不变，但名字集会变，diff 里现形。
# 抽名字用和上面日志展示同一套 [^"]* 边界（Chrome 的 --enable-logging 会给每条 console 追加
# `", source: …`，[^"]* 恰好切在那个引号前），再去掉 PASS/FAIL 与 ` — 明细` 后缀，排序去重。
# 对不上就打 diff 并返回非零，交给调用方置 STATUS=1。
check_names() { # $1=tag(dom|smoke)  $2=logfile  $3=golden
  local tag="$1" log="$2" golden="$3" actual
  actual="$(mktemp)"
  grep -oE "\[$tag\] (PASS|FAIL) [^\"]*" "$log" \
    | sed -E "s/^\[$tag\] (PASS|FAIL) //; s/ — .*\$//; s/[[:space:]]+\$//" \
    | LC_ALL=C sort -u > "$actual"
  if diff -u "$golden" "$actual" >/tmp/zhupi-$tag-names.diff 2>&1; then
    rm -f "$actual"; return 0
  fi
  echo "  ✖ 断言名字清单与 $golden 对不上（+新增 / -缺失）："
  sed 's/^/    /' /tmp/zhupi-$tag-names.diff
  rm -f "$actual"; return 1
}

# 期望断言条数：钉死总数，断言被删/被跳过也要红
DOM_EXPECT=38
SMOKE_EXPECT=136
MM_EXPECT=4
MOBILE_EXPECT=31
RAIL_EXPECT=10

WHAT="${1:-all}"
STATUS=0

if [ "$WHAT" = "all" ] || [ "$WHAT" = "dom" ]; then
  echo "── DOM 单元（渲染行号规则 / 锚定几何）──"
  run_page "http://127.0.0.1:$PORT/test/dom.test.html" "$LOGDIR/dom.log" 6000
  grep -o '\[dom\] [A-Z]* [^"]*' "$LOGDIR/dom.log" | sed 's/^/  /' || true
  RESULT=$(grep -o '\[dom\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/dom.log" | tail -1)
  if [ -z "$RESULT" ]; then
    echo "  ✖ DOM 层没跑出结果（页面可能报错，详见 $LOGDIR/dom.log）"
    STATUS=1
  elif [ "$RESULT" = "[dom] RESULT pass=$DOM_EXPECT fail=0" ]; then
    echo "  ✔ $RESULT"
  else
    echo "  ✖ ${RESULT}（期望 pass=$DOM_EXPECT fail=0——条数对不上也算红，防断言被悄悄删掉）"
    STATUS=1
  fi
  check_names dom "$LOGDIR/dom.log" test/dom-assertions.golden || STATUS=1
fi

if [ "$WHAT" = "all" ] || [ "$WHAT" = "smoke" ]; then
  echo "── 端到端冒烟（demo 免 token，真实事件路径划批 + rev 切换）──"
  run_page "http://127.0.0.1:$PORT/index.html?demo=1&auto=1" "$LOGDIR/smoke.log" 45000
  grep -o '\[smoke\] [^"]*' "$LOGDIR/smoke.log" | sed 's/^/  /' || true
  RESULT=$(grep -o '\[smoke\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/smoke.log" | tail -1)
  if [ -z "$RESULT" ]; then
    echo "  ✖ 冒烟没跑出结果（详见 $LOGDIR/smoke.log）"
    STATUS=1
  elif [ "$RESULT" = "[smoke] RESULT pass=$SMOKE_EXPECT fail=0" ]; then
    echo "  ✔ $RESULT"
  else
    echo "  ✖ ${RESULT}（期望 pass=$SMOKE_EXPECT fail=0）"
    STATUS=1
  fi
  check_names smoke "$LOGDIR/smoke.log" test/smoke-assertions.golden || STATUS=1

  # 直达链接：URL 带 ?pr=998 应直接开到那折（归档折 → 自动切已画可栏、只读）
  run_page "http://127.0.0.1:$PORT/index.html?demo=1&deep=1&pr=998" "$LOGDIR/deep.log" 5000
  grep -o '\[smoke\] [^"]*' "$LOGDIR/deep.log" | sed 's/^/  /' || true
  RD=$(grep -o '\[smoke\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/deep.log" | tail -1)
  if [ "$RD" = "[smoke] RESULT pass=3 fail=0" ]; then echo "  ✔ deep $RD"; else echo "  ✖ deep ${RD}（期望 pass=3 fail=0）"; STATUS=1; fi

  # 直达链接指向不存在的折：必须出提示，不许静默（pendingNotice 曾经只写不读）
  run_page "http://127.0.0.1:$PORT/index.html?demo=1&deep=miss&pr=9999" "$LOGDIR/deepmiss.log" 5000
  grep -o '\[smoke\] [^"]*' "$LOGDIR/deepmiss.log" | sed 's/^/  /' || true
  RM=$(grep -o '\[smoke\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/deepmiss.log" | tail -1)
  if [ "$RM" = "[smoke] RESULT pass=1 fail=0" ]; then echo "  ✔ deep-miss $RM"; else echo "  ✖ deep-miss ${RM}（期望 pass=1 fail=0）"; STATUS=1; fi

  # 故障注入两场：403 限流不得清 token（历史上误删过），401 才回设置页
  for mode in 403 401; do
    run_page "http://127.0.0.1:$PORT/index.html?demo=1&fail=$mode" "$LOGDIR/fail$mode.log" 4000
    grep -o "\[smoke\] [^\"]*" "$LOGDIR/fail$mode.log" | sed 's/^/  /' || true
    R=$(grep -o '\[smoke\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/fail$mode.log" | tail -1)
    EXP=$([ "$mode" = "403" ] && echo 3 || echo 2)
    if [ "$R" = "[smoke] RESULT pass=$EXP fail=0" ]; then echo "  ✔ fail=$mode $R"; else echo "  ✖ fail=$mode ${R}（期望 pass=$EXP fail=0）"; STATUS=1; fi
  done

  # 手机窄口（M0 · review #121 §5）：390px 窗宽真进 ≤900 分支。走完整条三层动线——
  # 阅读页 →「‹ 目录」→ 目录页（篇/节）→ 点节滚回正文 →「‹ 全部折子」→ 清单页 → 点卡。
  # 用 [mobile] 独立标签，不进 smoke 的 golden 名单（那份钉在 1440 桌面口跑出来的集合）。
  echo "── 手机窄口（390px：三层导航 + 底栏常驻 + 触控 ≥44px）──"
  run_page "http://127.0.0.1:$PORT/index.html?demo=1&mobile=1" "$LOGDIR/mobile.log" 30000 "390,780"
  grep -o '\[mobile\] [^"]*' "$LOGDIR/mobile.log" | sed 's/^/  /' || true
  RMOB=$(grep -o '\[mobile\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/mobile.log" | tail -1)
  if [ "$RMOB" = "[mobile] RESULT pass=$MOBILE_EXPECT fail=0" ]; then echo "  ✔ $RMOB"; else echo "  ✖ ${RMOB}（期望 pass=$MOBILE_EXPECT fail=0）"; STATUS=1; fi

  # 左栏拖宽（2026-08-26）：1920px 才有富余可拖——1440 的桌面口在这一档几何下上限离默认
  # 太近，量不出「拖到极限停住」。夹逼的上限来自 CSS 的 calc()，只有真浏览器解析得了，
  # 所以这条不能退化成纯逻辑测试（rail.test.js 管的是式子本身，这里管那个数量得对不对）。
  echo "── 左栏拖宽（1920px：夹逼上限 / 不溢出 / 落盘 / 双击归位）──"
  run_page "http://127.0.0.1:$PORT/index.html?demo=1&rail=1" "$LOGDIR/rail.log" 8000 "1920,1000"
  grep -o '\[rail\] [^"]*' "$LOGDIR/rail.log" | sed 's/^/  /' || true
  RRAIL=$(grep -o '\[rail\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/rail.log" | tail -1)
  if [ "$RRAIL" = "[rail] RESULT pass=$RAIL_EXPECT fail=0" ]; then echo "  ✔ $RRAIL"; else echo "  ✖ ${RRAIL}（期望 pass=$RAIL_EXPECT fail=0）"; STATUS=1; fi

  # mermaid 沙箱渲图（#188 M1）：渲染在跨进程 iframe 里，单独一支、给足虚拟时间预算
  echo "── mermaid 沙箱渲图（好图成 figure>img[blob:] / 坏图留源码+错误行 / sandbox 恰为 allow-scripts）──"
  run_page "http://127.0.0.1:$PORT/index.html?demo=1&mm=1" "$LOGDIR/mm.log" real
  grep -o '\[mm\] [^"]*' "$LOGDIR/mm.log" | sed 's/^/  /' || true
  RMM=$(grep -o '\[mm\] RESULT pass=[0-9]* fail=[0-9]*' "$LOGDIR/mm.log" | tail -1)
  if [ "$RMM" = "[mm] RESULT pass=$MM_EXPECT fail=0" ]; then echo "  ✔ $RMM"; else echo "  ✖ ${RMM}（期望 pass=$MM_EXPECT fail=0）"; STATUS=1; fi
fi

exit $STATUS
