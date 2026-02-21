#!/bin/bash
echo "[StartScript] Cleaning up stale Xvfb locks..."
rm -f /tmp/.X99-lock

echo "[StartScript] Starting Xvfb..."
# Export display for any process that needs it
export DISPLAY=:99

# Start Xvfb in the background
Xvfb :99 -screen 0 1280x720x24 &
sleep 2

echo "[StartScript] Starting Bot Worker..."
npm start
