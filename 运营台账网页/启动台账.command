#!/bin/zsh
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  node server.js
elif [ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" server.js
else
  echo "没有找到 Node.js。请先安装 Node.js，或让我帮你改成别的启动方式。"
  read -k 1 "?按任意键退出"
fi
