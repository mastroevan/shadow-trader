#!/bin/bash

SESSION="shadow-trader"
PROJECT="$HOME/Desktop/code/shadow-trader"

# Kill old session if it exists
tmux kill-session -t $SESSION 2>/dev/null

# Create new detached session
tmux new-session -d -s $SESSION -c "$PROJECT"

# WEB
tmux rename-window -t $SESSION:0 "web"
tmux send-keys -t $SESSION:0 "cd apps/web && npm install && npm run dev" C-m

# API
tmux new-window -t $SESSION -n "api"
tmux send-keys -t $SESSION:1 "cd apps/api && npm install && npm run dev" C-m

# AGENT
tmux new-window -t $SESSION -n "agent"
tmux send-keys -t $SESSION:2 "cd apps/agent && source venv/bin/activate && uvicorn server:app --reload --port 8000" C-m

# LOGS
tmux new-window -t $SESSION -n "logs"
tmux send-keys -t $SESSION:3 "cd $PROJECT && find . -name '*.log' | xargs tail -f" C-m

# Attach to session
tmux attach -t $SESSION