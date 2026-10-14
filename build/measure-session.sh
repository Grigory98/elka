#!/bin/zsh
# Walks through the memory of one session and records the whole curve.
#
# The single number printed after one scenario does not say much: a terminal that is opened, filled,
# scrolled and closed passes through a peak that has already collapsed by the time anyone thinks to
# look. This samples every second for the whole run and keeps the peak, so the shape is visible:
# a plateau is memory being held, a spike is a peak nobody waited for.
#
# usage: build/measure-session.sh [seconds-per-step]

set -u
STEP=${1:-8}
APP=$(pgrep -f "MacOS/elka" | head -1)
if [ -z "$APP" ]; then
  echo "elka is not running"
  exit 1
fi

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
  if [ "$delta" -ge 0 ] && [ "$delta" -lt "$content_delta" ]; then
    content_delta=$delta
    content=$pid
  fi
done

if [ -z "$content" ]; then
  echo "no web content process started alongside elka"
  exit 1
fi

echo "elka pid $APP, web content pid $content"
echo "Do the steps below, one per prompt. Footprint is what settles; rss moves on its own."
echo

peak=0
sample() {
  local foot rss
  # vmmap reports one decimal ("51.5M"), so the peak is kept in tenths to compare against it.
  foot=$(vmmap -summary "$content" 2>/dev/null | sed -n 's/^Physical footprint: *//p' | tr -dc '0-9.')
  rss=$(( $(ps -o rss= -p "$content" | tr -d ' ') / 1024 ))
  tenths=$(awk -v v="$foot" 'BEGIN { printf "%d", v * 10 + 0.5 }')
  [ -n "$tenths" ] && [ "$tenths" -gt "$peak" ] && peak=$tenths
  peak_mb=$(awk -v v="$peak" 'BEGIN { printf "%.1f", v / 10 }')
  printf '  %-28s rss=%-7s footprint=%-9s peak=%sMB\n' "$1" "${rss}MB" "${foot}M" "$peak_mb"
}

step() {
  echo
  echo "--- $1"
  local i=0
  while [ $i -lt "$STEP" ]; do
    sleep 1
    i=$((i + 1))
    sample ""
  done
}

sample "start"
for name in \
  "1. hosts page" \
  "2. open a terminal" \
  "3. print 10000 lines" \
  "4. scroll through them" \
  "5. close the tab" \
  "6. back on hosts, scroll" \
  "7. idle"
do
  read -r "?  $name  (Enter when done)" _
  step "$name"
done

echo
peak_mb=$(awk -v v="$peak" 'BEGIN { printf "%.1f", v / 10 }')
echo "peak during the run: ${peak_mb}MB, current: $(vmmap -summary "$content" 2>/dev/null | sed -n 's/^Physical footprint: *//p')"
