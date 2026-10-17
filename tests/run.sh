#!/bin/sh
#
# Run the view test harnesses.  Requires node (any recent version); the LuCI
# runtime (E, fs, poll, L, baseclass, view) is stubbed, no router needed.
#
# Usage: tests/run.sh
#
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

command -v node >/dev/null 2>&1 || {
	echo "node is required to run the tests" >&2
	exit 1
}

for t in "$DIR"/test-*.js; do
	echo "=== $(basename "$t")"
	node "$t"
	echo
done

echo "all tests passed"
