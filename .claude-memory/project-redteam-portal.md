---
name: project-redteam-portal
description: "Red Team Orchestration Portal - automated red teaming with human-in-the-loop approval, built with FastAPI + React + PostgreSQL + Redis"
metadata:
  node_type: memory
  type: project
  originSessionId: 5b029cca-c8ab-4c23-8cf1-ef0bfb6d1b0e
  modified: 2026-10-29T11:49:21.566Z
---

Red Team Orchestration Portal at ~/redteam-portal/ — automates red teaming operations with tiered human approval.

**Why:** User is building a portal to partially/fully automate red teaming for their organization (Aptean).

**Stack:** FastAPI backend, React+TypeScript frontend (Vite, Tailwind), PostgreSQL, Redis. Claude API for orchestrator intelligence.

**How to apply:** This is the user's active project. They're iterating toward production deployment. Default admin creds: admin@redteam.local / admin123. bcrypt must be pinned to 4.0.1 (passlib 1.7.4 incompatibility with bcrypt >= 4.1). asyncpg pinned to 0.30.0 (Python 3.13 compat). Architecture diagram artifact: https://claude.ai/artifact/RjdF5SC7oPty3dFHLzmhw1
