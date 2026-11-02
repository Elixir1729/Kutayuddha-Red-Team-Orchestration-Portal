# Kutayuddha

**Covert Warfare Operations Platform**

Kutayuddha (Sanskrit: कूटयुद्ध — "covert warfare") is a red team orchestration portal that automates offensive security operations with human-in-the-loop decision making. An AI orchestrator powered by Claude plans attack chains, executes tools, and adapts strategy — while human operators retain control through a tiered approval workflow.

---

## Features

### AI-Powered Orchestration
- Claude analyzes scope and rules of engagement to generate ordered attack chains
- Processes tool output to extract findings and decide next steps (continue, branch, escalate, report)
- Falls back to deterministic planning when no API key is configured

### Tiered Approval Workflow
| Tier | Level | Gate | Example Actions |
|------|-------|------|-----------------|
| 0 | Passive | Auto-approve after timeout | Port scans, DNS recon |
| 1 | Active | Operator approval required | Service enumeration, cloud audits |
| 2 | Exploit | Senior operator required | Vulnerability exploitation |
| 3 | Lateral | Lead + dual approval | Lateral movement, privilege escalation |

### Tool Integration
| Domain | Tools | Status |
|--------|-------|--------|
| Network | Nmap (port scan, service enum, vuln scan) | Live |
| Cloud | Prowler (AWS/Azure/GCP config audit) | Live |
| AD | BloodHound, Impacket | Mock (wrappers mapped) |
| AI/LLM | Prompt injection testing | Mock (wrappers mapped) |

### Safety Guardrails
- **Scope enforcement** — CIDR matching and glob domain validation blocks out-of-scope targets
- **Kill switch** — Redis-backed instant halt for all operations in an engagement
- **Immutable audit log** — 20 action types, append-only, filterable
- **Guardrail middleware** — chained pre-execution checks: kill switch → scope → audit

### Role-Based Access Control
| Role | Permissions |
|------|------------|
| Operator | View, execute tier 0-1 operations |
| Senior Operator | Approve tier 2 (exploit) operations |
| Lead | Approve tier 3 (lateral) operations |
| Admin | Full access, user management, system config |

### Real-Time Dashboard
- Engagement statistics, operation status breakdown, findings by severity
- WebSocket live updates for operations, approvals, findings, and kill switch events
- Attack graph visualization

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Database | PostgreSQL 16 |
| Cache/PubSub | Redis 7 |
| AI | Claude API (Anthropic SDK) |
| Auth | JWT with role hierarchy |

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 16
- Redis 7
- (Optional) Docker and Docker Compose

### Option A — Docker Compose (full stack)

```bash
cp .env.example .env
# Edit .env with your values (especially ANTHROPIC_API_KEY)
docker compose up --build -d
```

Portal will be available at `http://localhost:3000`.

### Option B — Local Development (recommended for development)

**1. Start infrastructure:**

```bash
# Using Docker for just the databases
docker compose up -d postgres redis
```

Or install PostgreSQL and Redis natively. Create a database named `redteam` with user `redteam`.

**2. Configure environment:**

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
DATABASE_URL=postgresql+asyncpg://redteam:changeme@localhost:5432/redteam
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-random-secret-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here    # optional, falls back to mock planning
ORCHESTRATOR_MODEL=claude-sonnet-5-5
```

**3. Set up and start the backend:**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**4. Set up and start the frontend (in a new terminal):**

```bash
cd frontend
npm install
npm run dev
```

**5. Seed the admin user:**

```bash
curl -X POST http://localhost:8000/api/v1/auth/seed-admin
```

**6. Open the portal:**

Navigate to `http://localhost:5173` and log in:
- **Email:** `admin@redteam.local`
- **Password:** `admin123`

> Change these credentials immediately in production.

---

## Usage Guide

### 1. Create an Engagement

1. Navigate to **Engagements** → **New Engagement**
2. Enter engagement details:
   - **Name** — descriptive name (e.g., "Q4 Internal Pentest")
   - **Scope** — define allowed CIDRs, domains, and hosts
   - **Exclusions** — systems to avoid
   - **Rules of Engagement** — constraints and boundaries
3. Save as draft

### 2. Start the Engagement

1. Click **Start** on the engagement detail page
2. The AI orchestrator analyzes the scope and ROE
3. An ordered attack chain is generated automatically:
   - Reconnaissance operations (tier 0 — auto-approved)
   - Enumeration operations (tier 1 — needs operator approval)
   - Exploitation operations (tier 2 — needs senior approval)
   - Lateral movement (tier 3 — needs lead + dual approval)

### 3. Review and Approve Operations

1. Go to **Approvals** to see pending operations
2. Each operation shows:
   - Tool and action to be executed
   - Target systems
   - Risk tier and required approver role
   - AI rationale for the operation
3. **Approve** or **Deny** with notes

### 4. Monitor Execution

- **Dashboard** — real-time stats and operation status
- **Live Operations** — WebSocket-fed live feed
- **Attack Graph** — visual representation of the attack chain
- Operations transition through: `PLANNED → PENDING_APPROVAL → APPROVED → EXECUTING → COMPLETED/FAILED`

### 5. Review Findings

- Findings are auto-extracted from tool output by Claude
- Severity levels: INFO, LOW, MEDIUM, HIGH, CRITICAL
- Each finding includes CVSS score, affected asset, and evidence
- Export findings as JSON

### 6. Emergency Kill Switch

- Available on the dashboard and engagement detail page
- Instantly stops all running operations for an engagement
- Propagates via Redis for sub-second halt
- Logged to the immutable audit trail

### 7. Audit Trail

- Every action is logged: logins, approvals, denials, tool executions, kill switch activations
- Filter by actor, action type, resource, and date range
- Immutable — entries cannot be modified or deleted

---

## API Reference

The API is available at `http://localhost:8000/api/v1`. Interactive docs at `http://localhost:8000/docs`.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register a new user |
| POST | `/api/v1/auth/login` | Login, returns JWT |
| GET | `/api/v1/auth/me` | Get current user |
| POST | `/api/v1/auth/refresh` | Refresh JWT token |
| POST | `/api/v1/auth/seed-admin` | Create default admin (empty DB only) |

### Engagements
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/engagements` | List engagements |
| POST | `/api/v1/engagements` | Create engagement |
| GET | `/api/v1/engagements/:id` | Get engagement detail |
| PATCH | `/api/v1/engagements/:id` | Update engagement |
| POST | `/api/v1/engagements/:id/start` | Start engagement |
| POST | `/api/v1/engagements/:id/pause` | Pause engagement |
| POST | `/api/v1/engagements/:id/stop` | Stop (kill switch) |

### Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/operations` | List operations |
| GET | `/api/v1/operations/:id` | Get operation detail |

### Approvals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/approvals` | List approval requests |
| POST | `/api/v1/approvals/:id/approve` | Approve operation |
| POST | `/api/v1/approvals/:id/deny` | Deny operation |

### Findings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/findings` | List findings |
| GET | `/api/v1/findings/:id` | Get finding detail |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard/stats` | Aggregated statistics |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `ws://localhost:8000/ws` | Real-time events (operations, approvals, findings, kill switch) |

---

## Project Structure

```
kutayuddha/
├── backend/
│   ├── app/
│   │   ├── api/              # Route handlers
│   │   │   ├── auth.py       # JWT authentication
│   │   │   ├── engagements.py
│   │   │   ├── operations.py
│   │   │   ├── approvals.py
│   │   │   ├── findings.py
│   │   │   ├── dashboard.py
│   │   │   ├── audit.py
│   │   │   ├── ws.py         # WebSocket endpoint
│   │   │   └── deps.py       # Auth dependencies
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Business logic
│   │   │   ├── orchestrator.py    # Claude AI orchestrator
│   │   │   ├── approval_engine.py # Tier classification
│   │   │   ├── prompts.py         # AI prompt templates
│   │   │   ├── report_generator.py
│   │   │   ├── scope_validator.py
│   │   │   └── tool_executor.py
│   │   ├── guardrails/       # Safety systems
│   │   │   ├── kill_switch.py     # Redis-backed emergency stop
│   │   │   ├── scope_enforcer.py  # Target validation
│   │   │   ├── action_logger.py   # Immutable audit
│   │   │   └── middleware.py      # Chained guardrail checks
│   │   ├── tools/            # Tool wrappers
│   │   │   ├── nmap_wrapper.py
│   │   │   ├── prowler_wrapper.py
│   │   │   └── registry.py       # Domain→wrapper mapping
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/       # React components
│       │   ├── Dashboard/    # Stats, live ops, attack graph
│       │   ├── Engagement/   # CRUD, setup wizard, scope editor
│       │   ├── Approval/     # Queue, cards, detail view
│       │   ├── Findings/     # Timeline, cards, detail
│       │   ├── AuditLog/     # Entry list, filters
│       │   ├── Auth/         # Login, register
│       │   ├── Layout/       # Header, sidebar, shell
│       │   └── common/       # Badge, modal, kill switch, status
│       ├── services/         # API client, WebSocket manager
│       ├── contexts/         # Auth context provider
│       ├── hooks/            # useApi, useWebSocket
│       └── types/            # TypeScript interfaces
├── docs/
│   └── DESIGN.md             # Technical design document (~850 lines)
├── docker-compose.yml
├── Makefile
├── .env.example
└── .gitignore
```

---

## Configuration

All configuration is via environment variables (`.env` file):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL async connection string | — (required) |
| `REDIS_URL` | Redis connection string | — (required) |
| `SECRET_KEY` | JWT signing secret | — (required) |
| `ANTHROPIC_API_KEY` | Claude API key | — (optional, falls back to mock) |
| `ORCHESTRATOR_MODEL` | Claude model for planning | `claude-sonnet-5-5` |
| `CORS_ORIGINS` | Allowed CORS origins (JSON array) | `["http://localhost:5173"]` |
| `TIER0_AUTO_APPROVE_SECONDS` | Timeout before tier-0 auto-approval | `300` |

---

## Known Limitations

- **AD and AI/LLM tools** return mock data (wrappers are mapped but not connected to real tools)
- **Dual approval** for tier 3 operations is not yet enforced
- **Report export** is JSON only (no PDF/HTML)
- **WebSocket authentication** accepts tokens but does not validate them
- **No database migrations** — tables are auto-created on startup (use Alembic for production)
- **No TLS/HTTPS** — use a reverse proxy (nginx/Caddy) in production
- **No rate limiting** — add middleware or use a reverse proxy

---

## Roadmap

- [ ] Real AD tool wrappers (BloodHound, Impacket)
- [ ] Real AI/LLM probing tool wrappers
- [ ] PDF/HTML report generation
- [ ] Enforce dual approval for lateral movement
- [ ] Celery task queue for async tool execution
- [ ] Alembic database migrations
- [ ] TLS and rate limiting
- [ ] Jira/ServiceNow integration for findings
- [ ] Custom tool plugin system with hot-reload
- [ ] Compliance report templates (PCI DSS, SOC 2, ISO 27001)
- [ ] Automated retesting and remediation tracking
- [ ] Multi-tenant support

---

## Security Notice

This platform is designed for **authorized security testing only**. Ensure you have:

- Written authorization for all target systems
- Clearly defined scope and rules of engagement
- Appropriate legal agreements in place
- Compliance with all applicable laws and regulations

Unauthorized use of this tool against systems you do not own or have permission to test is illegal.

---
