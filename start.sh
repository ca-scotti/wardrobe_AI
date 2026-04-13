#!/bin/bash
# Wardrobe AI - Start Script
# Usage: ANTHROPIC_API_KEY=your_key ./start.sh
#    or: Set ANTHROPIC_API_KEY in .env.local, then run ./start.sh

cd "$(dirname "$0")"

if [ -z "$ANTHROPIC_API_KEY" ]; then
  if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
  fi
fi

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "your_api_key_here" ]; then
  echo "ERROR: Please set your ANTHROPIC_API_KEY"
  echo "  Option 1: ANTHROPIC_API_KEY=sk-ant-... ./start.sh"
  echo "  Option 2: Edit .env.local and set ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

echo "Starting Wardrobe AI on http://localhost:3000"
npm run dev
