#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AegisOps — Full Stack Startup Script
# Starts: Node.js Express server (port 18090) + ML Engine (port 18091)
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "════════════════════════════════════════════════════"
echo "  AegisOps Local AI — Enterprise Integration Platform"
echo "════════════════════════════════════════════════════"
echo ""

# 1. Check Python and install ML dependencies
echo "[1/3] Checking ML Engine dependencies..."
if command -v python3 &> /dev/null; then
    if [ -f "requirements.txt" ]; then
        pip3 install -q -r requirements.txt 2>/dev/null || \
        pip install -q -r requirements.txt 2>/dev/null || \
        echo "  ⚠ Could not install Python dependencies — ML Engine will run in demo mode"
    fi
else
    echo "  ⚠ Python3 not found — ML Engine will not start"
fi

# 2. Start ML Engine (background)
ML_PID=""
if command -v python3 &> /dev/null; then
    echo "[2/3] Starting ML Engine on port 18091..."
    cd "$SCRIPT_DIR"
    python3 -m ml_engine.api.main &
    ML_PID=$!
    sleep 2
    # Check if ML Engine started
    if kill -0 "$ML_PID" 2>/dev/null; then
        echo "  ✅ ML Engine started (PID: $ML_PID)"
    else
        echo "  ⚠ ML Engine failed to start — running without ML features"
        ML_PID=""
    fi
else
    echo "[2/3] Skipping ML Engine (no Python3)"
fi

# 3. Start Node.js server
echo "[3/3] Starting AegisOps Server on port 18090..."
cd "$SCRIPT_DIR/aegisops_app"
node server/standalone.js &
NODE_PID=$!

# Graceful shutdown
cleanup() {
    echo ""
    echo "Shutting down..."
    [ -n "$NODE_PID" ] && kill "$NODE_PID" 2>/dev/null
    [ -n "$ML_PID" ] && kill "$ML_PID" 2>/dev/null
    wait 2>/dev/null
    echo "Done."
    exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "════════════════════════════════════════════════════"
echo "  ✅ AegisOps is running:"
echo "     • Web UI:      http://localhost:18090"
echo "     • ML Engine:   http://localhost:18091"
echo "     • API Docs:    http://localhost:18091/docs"
echo "════════════════════════════════════════════════════"
echo "  Press Ctrl+C to stop"
echo ""

wait
