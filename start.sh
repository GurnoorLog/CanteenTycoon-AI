#!/bin/bash
set -e

# Start ML server (LightGBM) in background
python app.py &

# Start web server in foreground using Render's PORT
python server.py
