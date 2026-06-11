#!/usr/bin/env bash
# Stop and remove the local Postgres container.
set -euo pipefail

docker rm -f arther-postgres >/dev/null 2>&1 && echo "arther-postgres removed" || echo "arther-postgres not running"
