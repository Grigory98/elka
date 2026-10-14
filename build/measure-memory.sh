#!/bin/zsh
# Measures the memory of the Elka webview.
#
# Two traps this script exists to avoid:
#
#   * `pgrep -f WebContent` also matches the web content processes of every other WebKit app on the
#     machine, including ones left over from a previous launch. A leftover is often several times
#     larger than the running one, so it is easy to attribute someone else's memory to Elka.
#   * WebKit reparents its content process to launchd the moment it spawns it, so it is not a child of
#     the app and cannot be found by walking the process tree.
#
# Elka's own content process is the one WebKit started most recently and no earlier than the app, and
# that is what this picks. The first samples are taken while the bundle is still booting; the figure
# worth trusting is the last one, once the process has settled.
#
# usage: build/measure-memory.sh [seconds]

set -u
DURATION=${1:-30}
APP=$(pgrep -f "MacOS/elka" | head -1)
if [ -z "$APP" ]; then
  echo "elka is not running"
  exit 1
fi

# `ps -o etime` prints [[dd-]hh:]mm:ss, so it is folded into seconds here.
elapsed() {
  ps -o etime= -p "$1" 2>/dev/null | awk -F'[-:]' '{
    if (NF == 4)      print $1 * 86400 + $2 * 3600 + $3 * 60 + $4
    else if (NF == 3) print $1 * 3600 + $2 * 60 + $3
    else              print $1 * 60 + $2
  }'
}

now=$(date +%s)
app_start=$(( now - $(elapsed "$APP") ))

content=""
content_delta=999999
for pid in $(pgrep -f "com.apple.WebKit.WebContent$"); do
  age=$(( now - $(elapsed "$pid") ))
  delta=$(( age - app_start ))
  # The content process is spawned a moment after the app and never before it.
  if [ "$delta" -ge 0 ] && [ "$delta" -lt "$content_delta" ]; then
    content_delta=$delta
    content=$pid
  fi
done

if [ -z "$content" ]; then
  echo "no web content process started alongside elka"
  exit 1
fi

echo "elka pid $APP, web content pid $content (started ${content_delta}s after the app)"
printf '%-8s %-12s %-12s\n' "t" "rss" "footprint"
i=0
while [ $i -lt "$DURATION" ]; do
  sleep 2
  i=$((i + 2))
  rss=$(( $(ps -o rss= -p "$content" | tr -d ' ') / 1024 ))
  foot=$(vmmap -summary "$content" 2>/dev/null | sed -n 's/^Physical footprint: *//p')
  printf '%-8s %-12s %-12s\n' "${i}s" "${rss}MB" "$foot"
done
