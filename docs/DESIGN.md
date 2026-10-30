# Kutayuddha — Technical Design Document

**Version**: 1.0  
**Date**: 2026-10-21  
**Status**: Draft  
**Authors**: Security Engineering Team  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Data Model](#3-data-model)
4. [API Contract](#4-api-contract)
5. [Approval Workflow Specification](#5-approval-workflow-specification)
6. [Orchestrator Decision Engine](#6-orchestrator-decision-engine)
7. [Guardrails Specification](#7-guardrails-specification)
8. [Security Considerations](#8-security-considerations)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Executive Summary

### 1.1 Purpose

Kutayuddha (Sanskrit: "covert warfare") is a web-based platform that partially or fully automates red teaming operations while keeping a human operator in the decision loop for high-risk actions. It provides a unified interface for planning, executing, and tracking multi-stage attack simulations against enterprise infrastructure.

### 1.2 Target Users

| Role | Description |
|------|-------------|
| **Operator** | Junior red team member. Executes operations, reviews passive/active findings. |
| **Senior Operator** | Experienced red teamer. Approves exploit-tier operations, guides attack strategy. |
| **Lead** | Team lead. Approves lateral movement, activates kill switch, oversees engagements. |
| **Admin** | Platform administrator. Manages users, system configuration, deactivates kill switch. |

### 1.3 Key Value Proposition

- **Speed**: Automate reconnaissance and enumeration tasks that consume 40-60% of manual engagement time.
- **Consistency**: Every action is logged, every finding is documented, every decision is auditable.
- **Safety**: A tiered approval system prevents uncontrolled exploitation. No exploit runs without human review.
- **Intelligence**: An LLM orchestrator (Claude) plans attack chains based on discovered intelligence, suggesting next steps an operator might miss.

### 1.4 Human-in-the-Loop Philosophy

The system is built on a core principle: **automate the routine, gate the dangerous**.

- **Passive reconnaissance** (port scans, DNS enumeration, WHOIS lookups) runs autonomously after scope validation. These actions are low-risk, high-volume, and well-understood.
- **Active probing** (vulnerability scans, credential spraying) queues for human review with a configurable auto-approve timeout. Operators can batch-approve common actions.
- **Exploitation and privilege escalation** are hard-blocked until a senior operator explicitly approves. No timeout, no auto-approve.
- **Lateral movement and persistence** require dual approval from a lead plus one other reviewer. These are the actions most likely to cause operational disruption.

The orchestrator proposes. Humans dispose. At every tier above passive, a qualified human must consciously decide to proceed.

---

## 2. System Architecture

### 2.1 High-Level Architecture

The system follows a layered architecture with clear separation of concerns:

```
Portal UI (React + TypeScript)
    |
    | HTTPS / WebSocket
    v
Backend API (FastAPI)
    |
    |--- Authentication & Authorization (JWT + RBAC)
    |--- REST Endpoints
    |--- WebSocket Hub
    |
    v
Orchestrator Service
    |
    |--- Decision Engine (Claude LLM)
    |--- Context Manager
    |--- Tool Registry
    |
    v
Guardrails Layer
    |
    |--- Scope Enforcer
    |--- Approval Gate
    |--- Action Logger
    |--- Kill Switch (Redis-backed)
    |
    v
Tool Execution Domains
    |
    |--- AD Domain (BloodHound, Rubeus, Impacket)
    |--- Cloud Domain (Prowler, Pacu, ScoutSuite)
    |--- Network Domain (Nmap, Nuclei, Metasploit)
    |--- AI/LLM Domain (prompt injection, model extraction tests)
    |
    v
Persistence Layer
    |
    |--- PostgreSQL (Engagements, Operations, Findings, Audit)
    |--- Redis (Kill Switch state, WS pub/sub, Approval TTLs)
```

### 2.2 Component Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        UI[React + TypeScript SPA]
    end

    subgraph "API Layer"
        API[FastAPI Backend]
        WS[WebSocket Hub]
        AUTH[Auth Middleware<br/>JWT + RBAC]
    end

    subgraph "Orchestration Layer"
        ORCH[Orchestrator Service]
        CTX[Context Manager]
        LLM[Claude LLM<br/>Decision Engine]
        TOOLS[Tool Registry]
    end

    subgraph "Guardrails Layer"
        SCOPE[Scope Enforcer]
        GATE[Approval Gate]
        LOGGER[Action Logger]
        KILL[Kill Switch]
    end

    subgraph "Tool Domains"
        AD[AD Tools<br/>BloodHound, Rubeus,<br/>Impacket]
        CLOUD[Cloud Tools<br/>Prowler, Pacu,<br/>ScoutSuite]
        NET[Network Tools<br/>Nmap, Nuclei,<br/>Metasploit]
        AILLM[AI/LLM Tools<br/>Custom Harness]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL 16)]
        REDIS[(Redis 7)]
    end

    UI -->|HTTPS| AUTH
    UI -->|WSS| WS
    AUTH --> API
    API --> ORCH
    API --> PG
    WS --> REDIS

    ORCH --> CTX
    ORCH --> LLM
    ORCH --> TOOLS
    ORCH --> SCOPE
    ORCH --> GATE
    ORCH --> LOGGER

    GATE --> REDIS
    KILL --> REDIS
    KILL --> WS

    TOOLS --> AD
    TOOLS --> CLOUD
    TOOLS --> NET
    TOOLS --> AILLM

    LOGGER --> PG
    GATE --> PG
    CTX --> PG
```

### 2.3 Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Frontend** | React 18 + TypeScript 5 | Component-based UI, strong typing, large ecosystem |
| **UI Framework** | Tailwind CSS + shadcn/ui | Rapid development, consistent design system |
| **State Management** | Zustand + React Query | Lightweight global state + server state caching |
| **Backend** | FastAPI (Python 3.12) | Async-native, auto-generated OpenAPI docs, Pydantic validation |
| **ORM** | SQLAlchemy 2.0 (async) | Mature, type-safe queries, migration support |
| **Migrations** | Alembic | Standard for SQLAlchemy |
| **Database** | PostgreSQL 16 | JSONB support, robust constraints, mature |
| **Cache / PubSub** | Redis 7 | Kill switch propagation, WebSocket fan-out, approval TTLs |
| **LLM** | Claude (Anthropic API) | Tool use support, large context window, structured output |
| **Task Queue** | Celery + Redis broker | Async tool execution, retry/timeout handling |
| **WebSocket** | FastAPI WebSockets + Redis PubSub | Real-time event broadcasting |
| **Containerization** | Docker + Docker Compose | Reproducible dev environments |
| **Orchestration** | Kubernetes (production) | Horizontal scaling, health checks, rolling deploys |

### 2.4 Request Flow

1. **User initiates action** via the Portal UI (e.g., starts an engagement).
2. **API layer** authenticates the JWT, authorizes the role, validates the request body.
3. **Service layer** processes business logic, writes to PostgreSQL.
4. **Orchestrator** picks up the engagement, queries Claude for an attack plan.
5. **Claude returns** an ordered list of operations with targets and parameters.
6. **Each operation** passes through the Guardrails layer:
   - Scope Enforcer validates the target is in scope.
   - Approval Gate classifies the tier and routes accordingly.
   - Action Logger records the operation creation.
7. **Approved operations** are dispatched to the appropriate tool domain via Celery.
8. **Tool output** is parsed, stored, and fed back to the orchestrator.
9. **Orchestrator evaluates** output and decides: branch, escalate, or report a finding.
10. **WebSocket** broadcasts state changes to connected clients in real time.

---

## 3. Data Model

### 3.1 Entity-Relationship Overview

```mermaid
erDiagram
    User ||--o{ Engagement : creates
    User ||--o{ ApprovalRequest : requests
    User ||--o{ ApprovalRequest : reviews
    User ||--o{ AuditLog : performs

    Engagement ||--o{ Operation : contains
    Engagement ||--o{ Finding : produces

    Operation ||--o{ Operation : chains_to
    Operation ||--o| ApprovalRequest : requires
    Operation ||--o| Finding : discovers

    ApprovalRequest }o--|| Operation : gates
```

### 3.2 Entity Definitions

#### 3.2.1 User

Represents any human actor in the system.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Login email |
| `hashed_password` | `VARCHAR(255)` | NOT NULL | bcrypt hash |
| `display_name` | `VARCHAR(100)` | NOT NULL | Human-readable name |
| `role` | `VARCHAR(20)` | NOT NULL, CHECK (role IN ('OPERATOR', 'SENIOR_OPERATOR', 'LEAD', 'ADMIN')) | Authorization tier |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT TRUE | Soft disable flag |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Account creation time |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Last modification time |

**Indexes**:
- `idx_user_email` UNIQUE on `email`
- `idx_user_role` on `role`
- `idx_user_is_active` on `is_active`

#### 3.2.2 Engagement

A scoped red team engagement against a defined target set.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `name` | `VARCHAR(200)` | NOT NULL | Engagement title |
| `description` | `TEXT` | | Detailed description |
| `status` | `VARCHAR(20)` | NOT NULL, DEFAULT 'DRAFT', CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ABORTED')) | Current lifecycle state |
| `scope_config` | `JSONB` | NOT NULL | Target scope definition (see schema below) |
| `rules_of_engagement` | `TEXT` | | Free-form rules and constraints |
| `created_by` | `UUID` | FK -> User(id), NOT NULL | Creator |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation time |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Last modification time |
| `started_at` | `TIMESTAMPTZ` | | When status moved to ACTIVE |
| `completed_at` | `TIMESTAMPTZ` | | When status moved to COMPLETED or ABORTED |

**`scope_config` JSONB Schema**:

```json
{
  "cidrs": ["10.0.0.0/8", "192.168.1.0/24"],
  "domains": ["*.example.com", "api.target.io"],
  "cloud_accounts": [
    { "provider": "aws", "account_id": "123456789012" },
    { "provider": "azure", "tenant_id": "..." }
  ],
  "exclusions": {
    "cidrs": ["10.0.0.1/32"],
    "domains": ["mail.example.com"],
    "notes": "Production mail server -- do not touch"
  }
}
```

**Indexes**:
- `idx_engagement_status` on `status`
- `idx_engagement_created_by` on `created_by`
- `idx_engagement_created_at` on `created_at`
- `idx_engagement_scope_config` GIN on `scope_config` (for JSONB containment queries)

#### 3.2.3 Operation

A single atomic action executed (or proposed) as part of an engagement.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `engagement_id` | `UUID` | FK -> Engagement(id), NOT NULL | Parent engagement |
| `tool_domain` | `VARCHAR(20)` | NOT NULL, CHECK (tool_domain IN ('AD', 'CLOUD', 'NETWORK', 'AI_LLM')) | Tool category |
| `action_type` | `VARCHAR(50)` | NOT NULL | Specific action (e.g., 'port_scan', 'kerberoast') |
| `target` | `VARCHAR(500)` | NOT NULL | Target identifier (IP, domain, account, etc.) |
| `parameters` | `JSONB` | NOT NULL, DEFAULT '{}' | Tool-specific parameters |
| `status` | `VARCHAR(20)` | NOT NULL, DEFAULT 'PLANNED', CHECK (status IN ('PLANNED', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED')) | Execution state |
| `output` | `JSONB` | | Raw tool output |
| `error_message` | `TEXT` | | Error details on FAILED |
| `parent_operation_id` | `UUID` | FK -> Operation(id), NULLABLE | Links to parent in attack chain |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation time |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Last modification time |
| `started_at` | `TIMESTAMPTZ` | | Execution start time |
| `completed_at` | `TIMESTAMPTZ` | | Execution completion time |

**Indexes**:
- `idx_operation_engagement_id` on `engagement_id`
- `idx_operation_status` on `status`
- `idx_operation_tool_domain` on `tool_domain`
- `idx_operation_action_type` on `action_type`
- `idx_operation_parent_id` on `parent_operation_id`
- `idx_operation_created_at` on `created_at`
- `idx_operation_engagement_status` on `(engagement_id, status)` -- composite for filtered queries

#### 3.2.4 ApprovalRequest

Gates an operation behind human review.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `operation_id` | `UUID` | FK -> Operation(id), NOT NULL, UNIQUE | One approval per operation |
| `tier` | `SMALLINT` | NOT NULL, CHECK (tier IN (0, 1, 2, 3)) | Approval tier level |
| `status` | `VARCHAR(20)` | NOT NULL, DEFAULT 'PENDING', CHECK (status IN ('PENDING', 'APPROVED', 'DENIED', 'AUTO_APPROVED', 'EXPIRED')) | Decision state |
| `requested_by` | `UUID` | FK -> User(id), NOT NULL | Who (or which service account) created the request |
| `reviewer_id` | `UUID` | FK -> User(id), NULLABLE | Primary reviewer |
| `second_reviewer_id` | `UUID` | FK -> User(id), NULLABLE | Second reviewer (Tier 3 only) |
| `decision_notes` | `TEXT` | | Reviewer's notes on the decision |
| `auto_approve_at` | `TIMESTAMPTZ` | | Tier 1 only: when auto-approval fires |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Request creation time |
| `decided_at` | `TIMESTAMPTZ` | | When a decision was made |

**Indexes**:
- `idx_approval_operation_id` UNIQUE on `operation_id`
- `idx_approval_status` on `status`
- `idx_approval_tier` on `tier`
- `idx_approval_auto_approve_at` on `auto_approve_at` WHERE `status = 'PENDING'` (partial index for timeout worker)
- `idx_approval_created_at` on `created_at`
- `idx_approval_tier_status` on `(tier, status)` -- composite for queue queries

**Constraints**:
- `chk_auto_approve_tier`: CHECK (`auto_approve_at IS NULL OR tier = 1`) -- only Tier 1 gets auto-approve
- `chk_second_reviewer_tier`: CHECK (`second_reviewer_id IS NULL OR tier = 3`) -- only Tier 3 gets dual approval
- `chk_reviewer_not_requester`: CHECK (`reviewer_id IS NULL OR reviewer_id != requested_by`) -- cannot approve own request

#### 3.2.5 Finding

A security finding discovered during an engagement.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `engagement_id` | `UUID` | FK -> Engagement(id), NOT NULL | Parent engagement |
| `operation_id` | `UUID` | FK -> Operation(id), NULLABLE | Operation that discovered this (NULL for manual findings) |
| `title` | `VARCHAR(300)` | NOT NULL | Finding title |
| `description` | `TEXT` | NOT NULL | Detailed description |
| `severity` | `VARCHAR(10)` | NOT NULL, CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) | Severity rating |
| `evidence` | `JSONB` | NOT NULL, DEFAULT '{}' | Supporting evidence |
| `cvss_score` | `DECIMAL(3,1)` | NULLABLE, CHECK (cvss_score >= 0.0 AND cvss_score <= 10.0) | CVSS v3.1 base score |
| `affected_asset` | `VARCHAR(500)` | NOT NULL | Impacted resource identifier |
| `remediation` | `TEXT` | | Recommended fix |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Discovery time |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Last modification time |

**`evidence` JSONB Schema**:

```json
{
  "screenshots": [
    { "filename": "da_pwned.png", "storage_key": "s3://findings/..." }
  ],
  "raw_output": "NT AUTHORITY\\SYSTEM",
  "proof": "Successfully obtained domain admin credentials via Kerberoasting",
  "tool_output": { ... },
  "reproduction_steps": [
    "Run Rubeus kerberoast against SVC_SQL account",
    "Crack TGS ticket with hashcat -m 13100"
  ]
}
```

**Indexes**:
- `idx_finding_engagement_id` on `engagement_id`
- `idx_finding_severity` on `severity`
- `idx_finding_operation_id` on `operation_id`
- `idx_finding_created_at` on `created_at`
- `idx_finding_engagement_severity` on `(engagement_id, severity)` -- composite for filtered queries

#### 3.2.6 AuditLog

Immutable record of every action in the system. This table enforces append-only semantics at the database level.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `actor_id` | `UUID` | FK -> User(id), NOT NULL | Who performed the action |
| `action` | `VARCHAR(50)` | NOT NULL | Action performed (see enum below) |
| `resource_type` | `VARCHAR(50)` | NOT NULL | Entity type affected |
| `resource_id` | `UUID` | NOT NULL | Entity ID affected |
| `details` | `JSONB` | NOT NULL, DEFAULT '{}' | Action-specific context |
| `ip_address` | `INET` | | Client IP address |
| `user_agent` | `VARCHAR(500)` | | Client User-Agent header |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Timestamp (immutable) |

**Action Enum Values**:

```
engagement.create, engagement.update, engagement.start, engagement.pause,
engagement.stop, engagement.delete,
operation.create, operation.approve, operation.deny, operation.execute,
operation.complete, operation.fail, operation.cancel, operation.block,
approval.create, approval.approve, approval.deny, approval.auto_approve,
approval.expire, approval.bulk_approve,
finding.create, finding.update,
kill_switch.activate, kill_switch.deactivate,
user.login, user.logout, user.create, user.update, user.deactivate
```

**Indexes**:
- `idx_audit_actor_id` on `actor_id`
- `idx_audit_action` on `action`
- `idx_audit_resource_type` on `resource_type`
- `idx_audit_resource_id` on `resource_id`
- `idx_audit_created_at` on `created_at`
- `idx_audit_actor_action` on `(actor_id, action)` -- composite for user activity queries
- `idx_audit_created_at_brin` BRIN on `created_at` -- space-efficient for time-range scans on large tables

**Immutability Enforcement** (PostgreSQL triggers):

```sql
-- Prevent UPDATE on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'UPDATE not permitted on audit_log table';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_update();

-- Prevent DELETE on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DELETE not permitted on audit_log table';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_delete();
```

### 3.3 Relationship Summary

| Relationship | Cardinality | FK Location | ON DELETE |
|-------------|-------------|-------------|----------|
| User -> Engagement | 1:N | Engagement.created_by | RESTRICT |
| Engagement -> Operation | 1:N | Operation.engagement_id | CASCADE |
| Operation -> Operation (parent) | 1:N | Operation.parent_operation_id | SET NULL |
| Operation -> ApprovalRequest | 1:0..1 | ApprovalRequest.operation_id | CASCADE |
| User -> ApprovalRequest (requester) | 1:N | ApprovalRequest.requested_by | RESTRICT |
| User -> ApprovalRequest (reviewer) | 1:N | ApprovalRequest.reviewer_id | SET NULL |
| User -> ApprovalRequest (2nd reviewer) | 1:N | ApprovalRequest.second_reviewer_id | SET NULL |
| Engagement -> Finding | 1:N | Finding.engagement_id | CASCADE |
| Operation -> Finding | 1:N | Finding.operation_id | SET NULL |
| User -> AuditLog | 1:N | AuditLog.actor_id | RESTRICT |

---

## 4. API Contract

All endpoints are prefixed with `/api/v1`. All request/response bodies are JSON. Timestamps are ISO 8601 with timezone (UTC). UUIDs are string-formatted.

### 4.1 Authentication

#### POST /api/v1/auth/login

Authenticate a user and receive tokens.

**Request Body**:

```json
{
  "email": "operator@example.com",
  "password": "string"
}
```

**Response 200**:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 900
}
```

**Response 401**: `{ "detail": "Invalid credentials" }`

#### POST /api/v1/auth/refresh

Exchange a refresh token for a new access token.

**Request Body**:

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 200**: Same shape as login response.  
**Response 401**: `{ "detail": "Invalid or expired refresh token" }`

#### POST /api/v1/auth/logout

Revoke the current refresh token.

**Headers**: `Authorization: Bearer <access_token>`  
**Response 204**: No content.

---

### 4.2 Engagements

All engagement endpoints require `Authorization: Bearer <access_token>`.

#### POST /api/v1/engagements

Create a new engagement. Requires role >= OPERATOR.

**Request Body**:

```json
{
  "name": "Q4 Internal Pentest",
  "description": "Full-scope internal penetration test of corporate network",
  "scope_config": {
    "cidrs": ["10.0.0.0/8"],
    "domains": ["*.corp.example.com"],
    "cloud_accounts": [],
    "exclusions": {
      "cidrs": ["10.0.0.1/32"],
      "domains": [],
      "notes": "Domain controller -- fragile, avoid DoS"
    }
  },
  "rules_of_engagement": "No denial of service. Operating window: 08:00-18:00 UTC weekdays."
}
```

**Response 201**:

```json
{
  "id": "a1b2c3d4-...",
  "name": "Q4 Internal Pentest",
  "description": "...",
  "status": "DRAFT",
  "scope_config": { ... },
  "rules_of_engagement": "...",
  "created_by": { "id": "...", "display_name": "Jane Doe" },
  "created_at": "2026-10-21T10:00:00Z",
  "updated_at": "2026-10-21T10:00:00Z",
  "started_at": null,
  "completed_at": null
}
```

**Response 422**: Validation errors (missing required fields, invalid CIDR format, etc.)

#### GET /api/v1/engagements

List engagements. Requires role >= OPERATOR.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | | Filter by status |
| `page` | int | 1 | Page number (1-based) |
| `per_page` | int | 20 | Items per page (max 100) |

**Response 200**:

```json
{
  "items": [ { ... engagement objects ... } ],
  "total": 42,
  "page": 1,
  "per_page": 20,
  "pages": 3
}
```

#### GET /api/v1/engagements/{id}

Get engagement details. Requires role >= OPERATOR.

**Response 200**: Full engagement object (same shape as create response) with additional computed fields:

```json
{
  ...engagement fields...,
  "operation_counts": {
    "total": 150,
    "by_status": { "COMPLETED": 120, "EXECUTING": 5, "PENDING_APPROVAL": 3, ... }
  },
  "finding_counts": {
    "total": 12,
    "by_severity": { "CRITICAL": 2, "HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1 }
  }
}
```

**Response 404**: `{ "detail": "Engagement not found" }`

#### PATCH /api/v1/engagements/{id}

Update engagement. Only DRAFT or PAUSED engagements can be edited. Requires role >= OPERATOR. Status cannot be changed via this endpoint.

**Request Body** (all fields optional):

```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "scope_config": { ... },
  "rules_of_engagement": "..."
}
```

**Response 200**: Updated engagement object.  
**Response 404**: Not found.  
**Response 409**: `{ "detail": "Cannot edit engagement in ACTIVE status" }`

#### POST /api/v1/engagements/{id}/start

Transition engagement from DRAFT or PAUSED to ACTIVE. Triggers the orchestrator to begin (or resume) planning. Requires role >= SENIOR_OPERATOR.

**Request Body**: None.

**Response 200**: Updated engagement object with `status: "ACTIVE"`, `started_at` populated.  
**Response 409**: `{ "detail": "Cannot start engagement in COMPLETED status" }`

#### POST /api/v1/engagements/{id}/pause

Pause an ACTIVE engagement. All PENDING_APPROVAL operations remain queued. All EXECUTING operations run to completion but no new operations are dispatched. Requires role >= SENIOR_OPERATOR.

**Request Body**: None.

**Response 200**: Updated engagement object with `status: "PAUSED"`.  
**Response 409**: `{ "detail": "Engagement is not active" }`

#### POST /api/v1/engagements/{id}/stop

Stop and complete an engagement. All PENDING and PLANNED operations are cancelled. EXECUTING operations run to completion. Requires role >= LEAD.

**Request Body**:

```json
{
  "reason": "Engagement objectives achieved"
}
```

**Response 200**: Updated engagement object with `status: "COMPLETED"`, `completed_at` populated.  
**Response 409**: `{ "detail": "Engagement is not active or paused" }`

#### DELETE /api/v1/engagements/{id}

Soft-delete a DRAFT engagement (sets `status` to a hidden `DELETED` state; row is retained for audit). Requires role >= LEAD. Only DRAFT engagements can be deleted.

**Response 204**: No content.  
**Response 409**: `{ "detail": "Only DRAFT engagements can be deleted" }`

---

### 4.3 Operations

#### GET /api/v1/operations

List operations. Requires role >= OPERATOR.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `engagement_id` | UUID | | Filter by engagement (required) |
| `status` | string | | Filter by status |
| `domain` | string | | Filter by tool_domain |
| `action_type` | string | | Filter by action_type |
| `page` | int | 1 | Page number |
| `per_page` | int | 50 | Items per page (max 200) |

**Response 200**:

```json
{
  "items": [
    {
      "id": "...",
      "engagement_id": "...",
      "tool_domain": "NETWORK",
      "action_type": "port_scan",
      "target": "10.0.0.0/24",
      "parameters": { "ports": "1-1000", "scan_type": "SYN" },
      "status": "COMPLETED",
      "output": null,
      "error_message": null,
      "parent_operation_id": null,
      "created_at": "...",
      "updated_at": "...",
      "started_at": "...",
      "completed_at": "...",
      "approval": {
        "id": "...",
        "tier": 0,
        "status": "AUTO_APPROVED"
      }
    }
  ],
  "total": 150,
  "page": 1,
  "per_page": 50,
  "pages": 3
}
```

Note: The `output` field is omitted in list responses for performance. Use the detail endpoint for full output.

#### GET /api/v1/operations/{id}

Get operation with full output. Requires role >= OPERATOR.

**Response 200**: Full operation object including `output` JSONB and nested `approval` object (if any), plus `parent_operation` summary and `child_operations` list.

```json
{
  ...operation fields...,
  "output": {
    "hosts_discovered": 24,
    "open_ports": [
      { "host": "10.0.0.5", "port": 445, "service": "microsoft-ds" },
      { "host": "10.0.0.5", "port": 88, "service": "kerberos" }
    ]
  },
  "approval": { ... full approval object ... },
  "parent_operation": { "id": "...", "action_type": "dns_enum", "status": "COMPLETED" },
  "child_operations": [
    { "id": "...", "action_type": "vuln_scan", "status": "PENDING_APPROVAL" }
  ]
}
```

**Response 404**: Not found.

#### POST /api/v1/operations/{id}/cancel

Cancel a PLANNED, PENDING_APPROVAL, or APPROVED operation. Requires role >= OPERATOR (own engagement) or >= SENIOR_OPERATOR (any engagement).

**Request Body**:

```json
{
  "reason": "False positive, target is out of scope"
}
```

**Response 200**: Updated operation object with `status: "CANCELLED"`.  
**Response 409**: `{ "detail": "Cannot cancel operation in EXECUTING status" }`

---

### 4.4 Approvals

#### GET /api/v1/approvals

List the approval queue. Requires role >= OPERATOR.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `tier` | int | | Filter by tier (0-3) |
| `status` | string | PENDING | Filter by status |
| `engagement_id` | UUID | | Filter by engagement |
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page (max 100) |

**Response 200**:

```json
{
  "items": [
    {
      "id": "...",
      "operation_id": "...",
      "tier": 2,
      "status": "PENDING",
      "requested_by": { "id": "...", "display_name": "Orchestrator" },
      "reviewer_id": null,
      "second_reviewer_id": null,
      "decision_notes": null,
      "auto_approve_at": null,
      "created_at": "...",
      "decided_at": null,
      "operation_summary": {
        "tool_domain": "AD",
        "action_type": "kerberoast",
        "target": "SVC_SQL@corp.example.com",
        "engagement_name": "Q4 Internal Pentest"
      }
    }
  ],
  "total": 3,
  "page": 1,
  "per_page": 20,
  "pages": 1
}
```

#### GET /api/v1/approvals/{id}

Get approval detail with full operation context. Requires role >= OPERATOR.

**Response 200**:

```json
{
  ...approval fields...,
  "operation": {
    ...full operation object (without output)...,
    "engagement": { "id": "...", "name": "...", "scope_config": { ... } }
  },
  "attack_chain": [
    { "id": "...", "action_type": "bloodhound_collection", "status": "COMPLETED" },
    { "id": "...", "action_type": "kerberoast", "status": "PENDING_APPROVAL" }
  ]
}
```

The `attack_chain` field walks the `parent_operation_id` chain to show the full sequence leading to this operation, helping the reviewer understand context.

#### POST /api/v1/approvals/{id}/approve

Approve an operation. Tier-based role enforcement:
- Tier 0/1: role >= OPERATOR
- Tier 2: role >= SENIOR_OPERATOR
- Tier 3: role >= LEAD (first approval) or role >= SENIOR_OPERATOR (second approval)

**Request Body**:

```json
{
  "notes": "Verified target is in scope. SVC_SQL is a known service account."
}
```

**Response 200**: Updated approval object with `status: "APPROVED"` (or `status: "PENDING"` if Tier 3 and only one of two approvals collected).

```json
{
  ...approval fields...,
  "status": "APPROVED",
  "reviewer_id": "...",
  "decided_at": "2026-10-21T10:30:00Z",
  "decision_notes": "Verified target is in scope..."
}
```

**Response 403**: `{ "detail": "Insufficient role for Tier 2 approval" }`  
**Response 409**: `{ "detail": "Approval is not in PENDING status" }`

#### POST /api/v1/approvals/{id}/deny

Deny an operation. Requires the same role minimums as approve. `notes` is required for denials to document the reasoning.

**Request Body**:

```json
{
  "notes": "Target host is explicitly excluded in the rules of engagement."
}
```

**Response 200**: Updated approval object with `status: "DENIED"`.  
**Response 422**: `{ "detail": "notes field is required for denials" }`

#### POST /api/v1/approvals/bulk-approve

Approve multiple operations in a single action. Only applicable to Tier 0 and Tier 1 operations. Requires role >= OPERATOR.

**Request Body**:

```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"],
  "notes": "Batch approved -- all targets verified in scope"
}
```

**Response 200**:

```json
{
  "approved": ["uuid-1", "uuid-2"],
  "failed": [
    { "id": "uuid-3", "reason": "Approval is Tier 2, cannot bulk approve" }
  ]
}
```

**Response 422**: `{ "detail": "ids array is required and must not be empty" }`

---

### 4.5 Findings

#### POST /api/v1/findings

Create a finding manually or via the orchestrator. Requires role >= OPERATOR.

**Request Body**:

```json
{
  "engagement_id": "...",
  "operation_id": "...",
  "title": "Kerberoastable Service Account with Weak Password",
  "description": "The SVC_SQL service account has a TGS ticket encrypted with RC4...",
  "severity": "HIGH",
  "evidence": {
    "raw_output": "$krb5tgs$23$*SVC_SQL$CORP.EXAMPLE.COM$...",
    "proof": "Password cracked in 4 minutes using hashcat with rockyou.txt",
    "reproduction_steps": [
      "Run: Rubeus.exe kerberoast /user:SVC_SQL",
      "Run: hashcat -m 13100 ticket.hash rockyou.txt"
    ]
  },
  "cvss_score": 7.5,
  "affected_asset": "SVC_SQL@corp.example.com",
  "remediation": "1. Change SVC_SQL password to 25+ character random string. 2. Convert to gMSA. 3. Enforce AES-only Kerberos encryption."
}
```

**Response 201**: Full finding object.  
**Response 422**: Validation errors.

#### GET /api/v1/findings

List findings. Requires role >= OPERATOR.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `engagement_id` | UUID | | Filter by engagement |
| `severity` | string | | Filter by severity |
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page (max 100) |

**Response 200**: Paginated finding list.

#### GET /api/v1/findings/{id}

Get finding detail. Requires role >= OPERATOR.

**Response 200**: Full finding object with nested operation summary.  
**Response 404**: Not found.

#### PATCH /api/v1/findings/{id}

Update finding. Requires role >= OPERATOR.

**Request Body**: Any subset of finding fields (except `id`, `engagement_id`, `created_at`).

**Response 200**: Updated finding object.  
**Response 404**: Not found.

#### GET /api/v1/findings/export

Export all findings for an engagement as JSON. Requires role >= OPERATOR.

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `engagement_id` | UUID | Yes | Engagement to export |

**Response 200**:

```json
{
  "engagement": {
    "id": "...",
    "name": "Q4 Internal Pentest",
    "status": "COMPLETED"
  },
  "exported_at": "2026-10-21T18:00:00Z",
  "findings": [
    { ...full finding objects... }
  ],
  "summary": {
    "total": 12,
    "by_severity": { "CRITICAL": 2, "HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1 }
  }
}
```

**Response Headers**: `Content-Disposition: attachment; filename="findings-{engagement_name}-{date}.json"`

---

### 4.6 Dashboard

#### GET /api/v1/dashboard/stats

Aggregated statistics for the dashboard. Requires role >= OPERATOR.

**Response 200**:

```json
{
  "engagements": {
    "active": 2,
    "paused": 1,
    "completed": 15,
    "total": 18
  },
  "operations": {
    "executing": 5,
    "pending_approval": 3,
    "completed_today": 47,
    "failed_today": 2
  },
  "approvals": {
    "pending_total": 3,
    "pending_by_tier": { "0": 0, "1": 2, "2": 1, "3": 0 },
    "avg_approval_time_minutes": 4.2
  },
  "findings": {
    "total": 45,
    "critical": 5,
    "high": 12,
    "discovered_today": 3
  }
}
```

#### GET /api/v1/dashboard/live-status

Current state of all active engagements. Requires role >= OPERATOR.

**Response 200**:

```json
{
  "active_engagements": [
    {
      "id": "...",
      "name": "Q4 Internal Pentest",
      "started_at": "2026-10-20T08:00:00Z",
      "current_phase": "exploitation",
      "operations_executing": 2,
      "operations_pending_approval": 1,
      "latest_finding": {
        "title": "Kerberoastable Service Account",
        "severity": "HIGH",
        "discovered_at": "2026-10-21T09:15:00Z"
      },
      "kill_switch_active": false
    }
  ]
}
```

---

### 4.7 Audit

#### GET /api/v1/audit

List audit log entries. Requires role >= LEAD (sensitive data).

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `actor_id` | UUID | | Filter by actor |
| `action` | string | | Filter by action type |
| `resource_type` | string | | Filter by resource type |
| `resource_id` | UUID | | Filter by specific resource |
| `date_from` | ISO datetime | | Start of time range |
| `date_to` | ISO datetime | | End of time range |
| `page` | int | 1 | Page number |
| `per_page` | int | 50 | Items per page (max 200) |

**Response 200**: Paginated list of audit log entries with actor display names joined.

---

### 4.8 Kill Switch

#### POST /api/v1/kill-switch/activate

Activate the kill switch. Requires role >= LEAD.

**Request Body**:

```json
{
  "engagement_id": "...",
  "reason": "Detected unexpected production impact"
}
```

If `engagement_id` is omitted, the kill switch applies globally to all engagements.

**Response 200**:

```json
{
  "activated": true,
  "scope": "engagement",
  "engagement_id": "...",
  "activated_by": "...",
  "activated_at": "2026-10-21T14:30:00Z",
  "operations_cancelled": 7,
  "approvals_expired": 3
}
```

#### POST /api/v1/kill-switch/deactivate

Deactivate the kill switch. Requires role >= ADMIN.

**Request Body**:

```json
{
  "engagement_id": "...",
  "reason": "False alarm, impact was expected behavior"
}
```

**Response 200**:

```json
{
  "activated": false,
  "deactivated_by": "...",
  "deactivated_at": "2026-10-21T14:45:00Z"
}
```

#### GET /api/v1/kill-switch/status

Get current kill switch state. Requires role >= OPERATOR.

**Response 200**:

```json
{
  "global": { "active": false },
  "engagements": {
    "a1b2c3d4-...": {
      "active": true,
      "activated_by": "...",
      "activated_at": "...",
      "reason": "..."
    }
  }
}
```

---

### 4.9 WebSocket

#### WS /api/v1/ws

Persistent WebSocket connection for real-time event streaming.

**Authentication**: Either pass the JWT as a query parameter (`?token=<jwt>`) or send it as the first message after connection:

```json
{ "type": "auth", "token": "<jwt>" }
```

**Subscription**: After authentication, subscribe to specific engagements:

```json
{ "type": "subscribe", "engagement_ids": ["uuid-1", "uuid-2"] }
```

Omitting `engagement_ids` subscribes to all engagements the user has access to.

**Server-Sent Event Format**:

```json
{
  "type": "operation_update",
  "data": {
    "operation_id": "...",
    "engagement_id": "...",
    "status": "COMPLETED",
    "action_type": "port_scan",
    "target": "10.0.0.0/24"
  },
  "timestamp": "2026-10-21T10:05:00Z"
}
```

**Event Types**:

| Event Type | Trigger | Data Payload |
|-----------|---------|--------------|
| `operation_update` | Operation status changes | operation_id, engagement_id, status, action_type, target |
| `approval_required` | New approval enters the queue | approval_id, operation summary, tier, engagement_name |
| `approval_decided` | Approval approved or denied | approval_id, operation_id, decision, reviewer_name |
| `finding_discovered` | New finding created | finding_id, title, severity, affected_asset, engagement_name |
| `kill_switch_activated` | Kill switch turned on | engagement_id (null if global), activated_by, reason |
| `kill_switch_deactivated` | Kill switch turned off | engagement_id (null if global), deactivated_by |
| `engagement_status_change` | Engagement starts, pauses, stops | engagement_id, old_status, new_status |

**Heartbeat**: Server sends `{ "type": "ping" }` every 30 seconds. Client must respond with `{ "type": "pong" }` within 10 seconds or the connection is closed.

---

### 4.10 Common Response Patterns

**Error Response Format** (all endpoints):

```json
{
  "detail": "Human-readable error message",
  "code": "SCOPE_VIOLATION",
  "context": { ... }
}
```

**Standard HTTP Status Codes**:

| Code | Usage |
|------|-------|
| 200 | Success (GET, PATCH, POST actions) |
| 201 | Created (POST create) |
| 204 | No content (DELETE) |
| 400 | Malformed request |
| 401 | Missing or invalid authentication |
| 403 | Insufficient authorization |
| 404 | Resource not found |
| 409 | Conflict (invalid state transition) |
| 422 | Validation error |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## 5. Approval Workflow Specification

### 5.1 Tier Classification

The approval tier determines how an operation is routed through the human review process.

| Tier | Level | Example Actions | Approval Mechanism | Auto-Timeout | Min. Reviewer Role |
|------|-------|-----------------|--------------------|--------------|-------------------|
| 0 | PASSIVE | `port_scan`, `dns_enum`, `whois`, `bloodhound_collection`, `cloud_audit`, `config_review`, `cert_enum`, `subdomain_enum`, `osint_lookup`, `banner_grab` | Auto-approve if target is within engagement scope | N/A | None |
| 1 | ACTIVE | `vuln_scan`, `credential_spray`, `brute_force`, `service_enum`, `cloud_enum`, `web_crawl`, `api_fuzz`, `directory_brute`, `smb_enum`, `snmp_walk` | Queued for human review; auto-approves on configurable timeout | 15 min (configurable per engagement) | OPERATOR |
| 2 | EXPLOIT | `exploit`, `privilege_escalation`, `credential_dump`, `token_theft`, `kerberoast`, `asreproast`, `password_crack`, `golden_ticket`, `dcsync`, `sql_injection` | Hard block until human approves | Never | SENIOR_OPERATOR |
| 3 | LATERAL | `lateral_movement`, `pivot`, `persistence`, `c2_setup`, `data_exfiltration`, `domain_admin_attack`, `trust_abuse`, `forest_compromise`, `ransomware_simulation` | Hard block + dual approval | Never | LEAD + any SENIOR_OPERATOR or higher |

### 5.2 Tier Classification Logic

The tier is determined by a lookup table from `action_type`. If an `action_type` is unknown, it defaults to Tier 2 (EXPLOIT) to fail safe. The classification table is stored in a configuration file and can be updated by ADMINs without code changes.

```python
# Pseudocode for tier classification
def classify_tier(action_type: str) -> int:
    tier = TIER_LOOKUP.get(action_type)
    if tier is None:
        log.warning(f"Unknown action_type '{action_type}', defaulting to Tier 2")
        return 2  # Fail safe: unknown actions require EXPLOIT-level approval
    return tier
```

### 5.3 Workflow State Machine

```mermaid
stateDiagram-v2
    [*] --> PLANNED: Orchestrator creates operation

    PLANNED --> SCOPE_CHECK: Orchestrator submits for execution

    SCOPE_CHECK --> BLOCKED: Target out of scope
    SCOPE_CHECK --> AUTO_APPROVED: Tier 0 + in scope
    SCOPE_CHECK --> PENDING_APPROVAL: Tier 1/2/3 + in scope

    AUTO_APPROVED --> EXECUTING: Immediate dispatch

    PENDING_APPROVAL --> APPROVED: Reviewer approves
    PENDING_APPROVAL --> APPROVED: Tier 1 timeout expires
    PENDING_APPROVAL --> DENIED: Reviewer denies
    PENDING_APPROVAL --> CANCELLED: Kill switch activated

    APPROVED --> EXECUTING: Dispatched to tool

    EXECUTING --> COMPLETED: Tool returns success
    EXECUTING --> FAILED: Tool returns error
    EXECUTING --> CANCELLED: Kill switch activated

    BLOCKED --> [*]
    DENIED --> [*]
    CANCELLED --> [*]
    COMPLETED --> [*]
    FAILED --> [*]
```

### 5.4 Detailed State Transitions

#### Transition: PLANNED -> SCOPE_CHECK

- **Trigger**: Orchestrator calls the execution service for this operation.
- **Action**: Scope Enforcer validates `operation.target` against `engagement.scope_config`.
- **Validation**:
  - IP targets: parsed and checked against `scope_config.cidrs` using CIDR containment. Checked against `scope_config.exclusions.cidrs`.
  - Domain targets: checked against `scope_config.domains` with wildcard matching. Checked against `scope_config.exclusions.domains`.
  - Cloud targets: account ID matched against `scope_config.cloud_accounts`.
  - If ANY exclusion matches, the operation is BLOCKED regardless of inclusion matches.

#### Transition: SCOPE_CHECK -> AUTO_APPROVED (Tier 0)

- **Condition**: `classify_tier(operation.action_type) == 0 AND target_in_scope(operation.target, engagement.scope_config)`
- **Action**: ApprovalRequest created with `tier=0, status=AUTO_APPROVED`. Operation status set to APPROVED then immediately to EXECUTING.
- **Audit**: `approval.auto_approve` logged.

#### Transition: SCOPE_CHECK -> PENDING_APPROVAL (Tier 1)

- **Condition**: `classify_tier(operation.action_type) == 1`
- **Action**: ApprovalRequest created with `tier=1, status=PENDING`. `auto_approve_at` set to `NOW() + engagement.auto_approve_timeout` (default 15 minutes).
- **Side Effect**: WebSocket event `approval_required` broadcast.
- **Timeout Worker**: A Celery beat task runs every 60 seconds, querying `SELECT * FROM approval_request WHERE status='PENDING' AND auto_approve_at IS NOT NULL AND auto_approve_at <= NOW()`. Matching approvals transition to AUTO_APPROVED.

#### Transition: SCOPE_CHECK -> PENDING_APPROVAL (Tier 2)

- **Condition**: `classify_tier(operation.action_type) == 2`
- **Action**: ApprovalRequest created with `tier=2, status=PENDING, auto_approve_at=NULL`.
- **Side Effect**: WebSocket event `approval_required` broadcast.
- **Hard Block**: No timeout. Stays PENDING until a SENIOR_OPERATOR or higher explicitly approves or denies.

#### Transition: SCOPE_CHECK -> PENDING_APPROVAL (Tier 3)

- **Condition**: `classify_tier(operation.action_type) == 3`
- **Action**: ApprovalRequest created with `tier=3, status=PENDING, auto_approve_at=NULL`.
- **Side Effect**: WebSocket event `approval_required` broadcast.
- **Dual Approval**: Requires TWO approvals from qualified reviewers:
  1. First approval: role >= LEAD. Sets `reviewer_id`.
  2. Second approval: role >= SENIOR_OPERATOR and `second_reviewer_id != reviewer_id`. Sets `second_reviewer_id`.
  3. Only after BOTH are recorded does status transition to APPROVED.
- **Hard Block**: No timeout. No auto-approve.

#### Transition: PENDING_APPROVAL -> DENIED

- **Trigger**: Reviewer calls `POST /api/v1/approvals/{id}/deny`.
- **Action**: ApprovalRequest status set to DENIED. Operation status set to DENIED. `decision_notes` required.
- **Terminal State**: The operation cannot be re-submitted. A new operation must be created if the orchestrator wants to retry.

#### Transition: APPROVED -> EXECUTING

- **Trigger**: Approval completed (single or dual).
- **Action**: Operation dispatched to the tool execution queue (Celery). `operation.started_at` set.
- **Tool Dispatch**: The Celery task loads the tool adapter for `operation.tool_domain`, passes `operation.action_type`, `operation.target`, and `operation.parameters`.

#### Transition: EXECUTING -> COMPLETED

- **Trigger**: Tool adapter returns success.
- **Action**: `operation.output` populated with parsed tool results. `operation.completed_at` set. `operation.status` set to COMPLETED.
- **Side Effect**: Orchestrator notified to evaluate the output and decide next steps.

#### Transition: EXECUTING -> FAILED

- **Trigger**: Tool adapter raises an exception or returns an error.
- **Action**: `operation.error_message` populated. `operation.completed_at` set. `operation.status` set to FAILED.
- **Side Effect**: Orchestrator notified. It may retry with different parameters or mark the chain as failed.

#### Transition: * -> CANCELLED (Kill Switch)

- **Trigger**: Kill switch activated for this engagement (or globally).
- **Action**: ALL operations in PLANNED, PENDING_APPROVAL, or APPROVED status are set to CANCELLED. EXECUTING operations receive a cancel signal via Celery revoke (with `terminate=True` and `signal=SIGTERM`). All PENDING approvals are set to EXPIRED.
- **Side Effect**: WebSocket event `kill_switch_activated` broadcast.

### 5.5 Escalation Rules

| Condition | Action | Notification Target |
|-----------|--------|-------------------|
| Tier 1 approval pending > 10 minutes | Escalation notification | All SENIOR_OPERATORs |
| Tier 2 approval pending > 30 minutes | Escalation notification | All LEADs |
| Tier 3 approval pending > 30 minutes | Escalation notification | All LEADs + ADMINs |
| Tier 3 first approval granted, second pending > 15 minutes | Reminder notification | All SENIOR_OPERATORs + LEADs |
| Any 5 Tier 1 approvals pending simultaneously | Batch review prompt | All OPERATORs |

Escalation notifications are delivered via WebSocket event and optionally via email (configurable per user).

### 5.6 Approval Queue Ordering

The approval queue is ordered by:

1. **Tier** descending (Tier 3 first -- most critical)
2. **Created timestamp** ascending (oldest first -- FIFO within tier)
3. **Engagement priority** (configurable per engagement, default: normal)

This ensures that the most dangerous pending actions are always visible at the top of the queue.

---

## 6. Orchestrator Decision Engine

### 6.1 Overview

The orchestrator is the "brain" of the system. It uses Claude as its LLM backbone to plan multi-step attack chains, interpret tool output, and decide the next action. It does NOT have the authority to execute anything directly -- every action it proposes passes through the Guardrails layer.

### 6.2 Planning Phase

When an engagement transitions to ACTIVE, the orchestrator initiates a planning cycle:

1. **Context Assembly**: Gather the engagement scope, rules of engagement, and tool inventory.
2. **Initial Plan Generation**: Call Claude with a structured prompt:

```
You are a red team orchestrator. Given the following engagement scope, generate
an ordered list of operations to execute.

Engagement: {engagement.name}
Scope:
  - CIDRs: {scope_config.cidrs}
  - Domains: {scope_config.domains}
  - Cloud Accounts: {scope_config.cloud_accounts}
  - Exclusions: {scope_config.exclusions}
Rules of Engagement: {engagement.rules_of_engagement}

Available tool domains: AD, CLOUD, NETWORK, AI_LLM
Available actions per domain: {tool_registry.list_actions()}

Generate a phased attack plan. For each operation, specify:
- tool_domain
- action_type
- target
- parameters
- rationale
- dependencies (which operations must complete first)

Start with reconnaissance and enumeration. Do not plan exploitation until
reconnaissance data is available.
```

3. **Plan Parsing**: Claude's response is parsed into a list of Operation objects with dependencies expressed as a DAG (directed acyclic graph).
4. **Phase 1 Dispatch**: All operations with no dependencies (root nodes of the DAG) are submitted for execution.

### 6.3 Decision Loop

After each operation completes, the orchestrator runs a decision cycle:

```
Input: completed_operation, its output, engagement context, all findings so far

Decision options:
  1. CONTINUE  - proceed with the next planned operation in the chain
  2. BRANCH    - the output reveals a new attack path; create additional operations
  3. ESCALATE  - the output indicates a high-value target; adjust priority
  4. REPORT    - the output contains a reportable finding; create a Finding
  5. RETRY     - the operation failed in a recoverable way; retry with adjusted params
  6. HALT      - the chain is exhausted or blocked; stop this branch
```

The orchestrator calls Claude with the operation output and context:

```
Operation completed:
  Type: {operation.action_type}
  Target: {operation.target}
  Output: {operation.output}

Current findings: {summarized_findings}
Remaining planned operations: {planned_ops}
Engagement scope: {scope_summary}

Based on this output, what should happen next? Choose one or more:
- CONTINUE with planned operations
- BRANCH to new attack path (specify operations)
- ESCALATE a target to higher priority
- REPORT a finding (specify title, severity, evidence)
- RETRY with different parameters
- HALT this chain

Respond in the specified JSON schema.
```

### 6.4 Context Window Management

Claude has a finite context window. The orchestrator manages this by:

1. **Summarization**: After every 10 completed operations, a summarizer call condenses all findings and operation history into a compressed format. The full details are stored in PostgreSQL but only the summary is kept in the LLM context.

2. **Scope Pinning**: The engagement scope and rules of engagement are always included in the system prompt. These are never summarized or truncated.

3. **Sliding Window**: The last 5 operations (with full output) are included verbatim. Older operations are included as one-line summaries: `"[COMPLETED] port_scan on 10.0.0.0/24 -- found 24 hosts, 156 open ports"`.

4. **Finding Index**: All findings are included as a title + severity index. Full finding details are only included when the orchestrator explicitly requests them for a specific finding.

### 6.5 Tool Output Parsing

Each tool domain defines a JSON schema for its output. The orchestrator expects tool adapters to normalize raw tool output into this schema.

**Network Domain Output Schema**:

```json
{
  "tool": "nmap",
  "action": "port_scan",
  "results": {
    "hosts_discovered": 24,
    "hosts": [
      {
        "ip": "10.0.0.5",
        "hostname": "dc01.corp.example.com",
        "os_guess": "Windows Server 2019",
        "ports": [
          { "port": 445, "state": "open", "service": "microsoft-ds", "version": "..." },
          { "port": 88, "state": "open", "service": "kerberos", "version": "..." }
        ]
      }
    ]
  },
  "raw_output": "...(optional full nmap XML)..."
}
```

**AD Domain Output Schema**:

```json
{
  "tool": "bloodhound",
  "action": "bloodhound_collection",
  "results": {
    "users_collected": 1250,
    "computers_collected": 340,
    "groups_collected": 89,
    "paths_to_da": 3,
    "kerberoastable_users": ["SVC_SQL", "SVC_BACKUP"],
    "asreproastable_users": ["jdoe_test"],
    "unconstrained_delegation": ["WEB01.corp.example.com"]
  }
}
```

**Cloud Domain Output Schema**:

```json
{
  "tool": "prowler",
  "action": "cloud_audit",
  "results": {
    "checks_passed": 142,
    "checks_failed": 23,
    "critical_findings": [
      {
        "check_id": "s3_bucket_public_access",
        "resource": "arn:aws:s3:::internal-reports",
        "description": "S3 bucket has public read access enabled"
      }
    ],
    "high_findings": [ ... ]
  }
}
```

### 6.6 Attack Chain Examples

#### Example 1: Active Directory Compromise Chain

```
Phase 1 (Tier 0 - Auto-approved):
  ├── [NETWORK] port_scan → 10.0.0.0/24 → discovers DC at 10.0.0.5
  ├── [NETWORK] dns_enum → corp.example.com → maps internal DNS
  └── [AD] bloodhound_collection → corp.example.com → finds 3 paths to DA

Phase 2 (Tier 1 - Queued):
  └── [NETWORK] vuln_scan → 10.0.0.5 → finds MS17-010

Orchestrator Decision: BloodHound shows kerberoastable SVC_SQL with path to DA.
Branch: add kerberoast operation.

Phase 3 (Tier 2 - Hard block, SENIOR_OPERATOR approval):
  └── [AD] kerberoast → SVC_SQL@corp.example.com → obtains TGS ticket

Phase 4 (Tier 2 - Hard block):
  └── [AD] password_crack → TGS ticket → cracks password in 4 minutes

Orchestrator Decision: SVC_SQL has local admin on WEB01 which has unconstrained
delegation. Path to DA confirmed.

Phase 5 (Tier 3 - Hard block, dual approval):
  └── [AD] lateral_movement → WEB01.corp.example.com → via SVC_SQL creds
  └── [AD] token_theft → WEB01 → extract TGT from memory
  └── [AD] domain_admin_attack → DC01 → using unconstrained delegation TGT

Finding: Domain Admin achieved via kerberoasting + unconstrained delegation chain.
Severity: CRITICAL. CVSS: 9.8.
```

#### Example 2: Cloud Misconfiguration Chain

```
Phase 1 (Tier 0 - Auto-approved):
  └── [CLOUD] cloud_audit → AWS account 123456789012 → Prowler scan

Orchestrator Decision: Prowler finds public S3 bucket and overly permissive IAM role.

Phase 2 (Tier 1 - Queued):
  ├── [CLOUD] cloud_enum → arn:aws:s3:::internal-reports → enumerate contents
  └── [CLOUD] cloud_enum → arn:aws:iam::123456789012:role/LambdaExec → enumerate policies

Phase 3 (Tier 2 - Hard block):
  └── [CLOUD] exploit → LambdaExec role → Pacu iam__privesc_scan
  └── [CLOUD] privilege_escalation → iam:PassRole + lambda:CreateFunction → privesc to admin

Finding: Full AWS account compromise via IAM misconfiguration.
Severity: CRITICAL. CVSS: 10.0.
```

#### Example 3: Network Exploitation Chain

```
Phase 1 (Tier 0 - Auto-approved):
  ├── [NETWORK] port_scan → 192.168.1.0/24 → discovers 40 hosts
  ├── [NETWORK] subdomain_enum → target.io → finds api.target.io, staging.target.io
  └── [NETWORK] cert_enum → target.io → discovers additional subdomains from CT logs

Phase 2 (Tier 1 - Queued):
  ├── [NETWORK] vuln_scan → 192.168.1.0/24 → Nuclei scan finds CVE-2024-XXXXX on 192.168.1.20
  ├── [NETWORK] web_crawl → https://api.target.io → discovers unauthenticated endpoints
  └── [NETWORK] api_fuzz → https://api.target.io/v2 → finds SQL injection in /users endpoint

Phase 3 (Tier 2 - Hard block):
  └── [NETWORK] exploit → 192.168.1.20 → Metasploit module for CVE-2024-XXXXX → shell obtained
  └── [NETWORK] sql_injection → api.target.io/v2/users → extract user table (proof of concept only)

Phase 4 (Tier 2 - Hard block):
  └── [NETWORK] privilege_escalation → 192.168.1.20 → local privesc to root

Phase 5 (Tier 3 - Dual approval):
  └── [NETWORK] pivot → from 192.168.1.20 → scan internal 10.x network via SOCKS proxy

Findings:
  1. RCE via CVE-2024-XXXXX. Severity: CRITICAL.
  2. SQL injection in public API. Severity: HIGH.
  3. Internal network accessible from DMZ host. Severity: HIGH.
```

---

## 7. Guardrails Specification

### 7.1 Scope Enforcer

The Scope Enforcer is the first check every operation passes through. It validates that the operation's target falls within the engagement's approved scope.

**Implementation**:

```python
import ipaddress
import fnmatch

class ScopeEnforcer:
    def validate(self, target: str, scope_config: dict) -> ScopeResult:
        """
        Returns ScopeResult with is_valid, reason, and match_type.
        """
        # Step 1: Check exclusions first (exclusions always win)
        if self._matches_exclusion(target, scope_config.get("exclusions", {})):
            return ScopeResult(
                is_valid=False,
                reason=f"Target '{target}' matches exclusion list",
                match_type="EXCLUDED"
            )

        # Step 2: Check CIDR inclusion
        if self._is_ip_or_cidr(target):
            return self._check_cidr(target, scope_config.get("cidrs", []))

        # Step 3: Check domain inclusion
        if self._is_domain(target):
            return self._check_domain(target, scope_config.get("domains", []))

        # Step 4: Check cloud account inclusion
        if self._is_cloud_resource(target):
            return self._check_cloud(target, scope_config.get("cloud_accounts", []))

        # Step 5: Unknown target type -- reject
        return ScopeResult(
            is_valid=False,
            reason=f"Cannot classify target '{target}' as IP, domain, or cloud resource",
            match_type="UNKNOWN"
        )

    def _check_cidr(self, target: str, cidrs: list[str]) -> ScopeResult:
        target_addr = ipaddress.ip_address(target)
        for cidr in cidrs:
            if target_addr in ipaddress.ip_network(cidr, strict=False):
                return ScopeResult(is_valid=True, reason=f"Matches CIDR {cidr}", match_type="CIDR")
        return ScopeResult(is_valid=False, reason=f"IP {target} not in any scope CIDR", match_type="CIDR")

    def _check_domain(self, target: str, domains: list[str]) -> ScopeResult:
        for pattern in domains:
            if fnmatch.fnmatch(target.lower(), pattern.lower()):
                return ScopeResult(is_valid=True, reason=f"Matches pattern {pattern}", match_type="DOMAIN")
        return ScopeResult(is_valid=False, reason=f"Domain {target} not in scope", match_type="DOMAIN")
```

**Scope Violation Handling**:

- Operation status set to BLOCKED.
- AuditLog entry created with action `operation.block`, details including the failed scope check reason.
- Orchestrator notified so it can remove the blocked operation from its plan.
- No user notification (scope violations are expected during automated planning).

### 7.2 Human Approval Gate

The Approval Gate is the central enforcement point for the tiered approval system. It is implemented at the service layer and cannot be bypassed by the orchestrator.

**Enforcement Architecture**:

```
Orchestrator
    |
    v
OperationService.submit_for_execution(operation_id)
    |
    v
ScopeEnforcer.validate(target, scope)  -- if invalid, BLOCKED
    |
    v
ApprovalGate.route(operation)
    |
    ├── Tier 0: ApprovalService.auto_approve(operation) -> EXECUTING
    ├── Tier 1: ApprovalService.queue_with_timeout(operation, timeout) -> PENDING
    ├── Tier 2: ApprovalService.queue_hard_block(operation) -> PENDING
    └── Tier 3: ApprovalService.queue_dual_approval(operation) -> PENDING
```

**Key Design Principle**: The orchestrator has no `execute` method. It can only call `submit_for_execution`, which always passes through the Approval Gate. There is no alternative code path.

**Approval Gate Service Interface**:

```python
class ApprovalGate:
    async def route(self, operation: Operation) -> ApprovalRequest:
        tier = self.tier_classifier.classify(operation.action_type)
        match tier:
            case 0:
                return await self._auto_approve(operation, tier)
            case 1:
                timeout = operation.engagement.auto_approve_timeout or DEFAULT_TIMEOUT
                return await self._queue_with_timeout(operation, tier, timeout)
            case 2:
                return await self._queue_hard_block(operation, tier)
            case 3:
                return await self._queue_dual_approval(operation, tier)
```

### 7.3 Action Logger

Every state change in the system is recorded in the AuditLog. The logger is implemented as middleware and service-layer decorators.

**What is Logged**:

| Event Category | Events | Logged Details |
|---------------|--------|----------------|
| Authentication | login, logout, token_refresh | IP, user agent, success/failure |
| Engagement lifecycle | create, update, start, pause, stop, delete | Old and new values for updates |
| Operation lifecycle | create, submit, approve, deny, execute, complete, fail, cancel, block | Full operation state, approval details |
| Approval decisions | approve, deny, auto_approve, expire, bulk_approve | Reviewer, notes, tier, time-to-decision |
| Finding management | create, update | Severity, affected asset |
| Kill switch | activate, deactivate | Scope, reason, operations affected |
| System events | orchestrator_plan_generated, tool_execution_started, tool_execution_completed | Plan summary, tool output summary |

**Logger Implementation**:

```python
class ActionLogger:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        actor_id: UUID,
        action: str,
        resource_type: str,
        resource_id: UUID,
        details: dict = None,
        ip_address: str = None,
        user_agent: str = None,
    ) -> AuditLog:
        entry = AuditLog(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(entry)
        await self.db.flush()  # Write immediately, don't wait for commit
        return entry
```

The logger flushes immediately so that audit entries are persisted even if the enclosing transaction rolls back. This is achieved by using a separate database connection for audit writes.

### 7.4 Kill Switch

The kill switch is the emergency stop mechanism. It is backed by Redis for instant propagation and PostgreSQL for durable state.

**Architecture**:

```
                     Kill Switch Activation
                            |
            +---------------+---------------+
            |               |               |
            v               v               v
     Redis SET          PostgreSQL       WebSocket
     kill_switch:       AuditLog         Broadcast
     {engagement_id}    entry            kill_switch_activated
            |                               |
            v                               v
     Celery Workers                    All Connected
     check Redis on                    UI Clients
     every task start
```

**Redis Key Schema**:

```
kill_switch:global          -> "1" or absent
kill_switch:{engagement_id} -> "1" or absent
```

**Activation Sequence**:

1. LEAD or ADMIN calls `POST /api/v1/kill-switch/activate`.
2. Redis key `kill_switch:{engagement_id}` (or `kill_switch:global`) is SET.
3. All EXECUTING operations for the engagement are identified:
   - Celery tasks are revoked with `terminate=True, signal='SIGTERM'`.
   - Operation statuses are set to CANCELLED in PostgreSQL.
4. All PENDING approvals for the engagement are set to EXPIRED.
5. All PLANNED and APPROVED operations are set to CANCELLED.
6. The orchestrator's event loop for this engagement is halted (it checks the Redis key at the top of each iteration).
7. WebSocket event `kill_switch_activated` is broadcast to all subscribed clients.
8. AuditLog entry created: `kill_switch.activate`.

**Deactivation**:

- Requires ADMIN role (stricter than activation).
- Redis key is deleted.
- WebSocket event `kill_switch_deactivated` broadcast.
- The orchestrator does NOT automatically resume. The engagement must be explicitly restarted via `POST /api/v1/engagements/{id}/start`.

**Worker-Side Check**:

Every Celery task checks the kill switch before starting and periodically during long-running operations:

```python
@celery_app.task(bind=True)
def execute_tool(self, operation_id: str):
    operation = load_operation(operation_id)

    # Pre-execution kill switch check
    if redis.exists(f"kill_switch:{operation.engagement_id}") or redis.exists("kill_switch:global"):
        mark_cancelled(operation)
        return

    adapter = get_tool_adapter(operation.tool_domain, operation.action_type)
    for progress in adapter.execute(operation.target, operation.parameters):
        # Periodic check during execution
        if redis.exists(f"kill_switch:{operation.engagement_id}") or redis.exists("kill_switch:global"):
            adapter.abort()
            mark_cancelled(operation)
            return

    # ... process results ...
```

---

## 8. Security Considerations

### 8.1 Authentication

- **Access Tokens**: JWT (HS256) with 15-minute expiry. Contains `user_id`, `role`, `exp`, `iat`.
- **Refresh Tokens**: Opaque, stored hashed in PostgreSQL, 7-day expiry, single-use (rotated on each refresh).
- **Token Revocation**: Refresh tokens are tracked in a `refresh_token` table. On logout, the token is deleted. On password change, all tokens for the user are deleted.
- **Password Policy**: Minimum 12 characters, must include uppercase, lowercase, digit, and special character. Passwords are hashed with bcrypt (cost factor 12).

### 8.2 Authorization (RBAC)

| Endpoint / Action | OPERATOR | SENIOR_OPERATOR | LEAD | ADMIN |
|-------------------|----------|-----------------|------|-------|
| Create/view engagements | Yes | Yes | Yes | Yes |
| Start/pause engagements | No | Yes | Yes | Yes |
| Stop engagements | No | No | Yes | Yes |
| View operations | Yes | Yes | Yes | Yes |
| Approve Tier 0-1 | Yes | Yes | Yes | Yes |
| Approve Tier 2 | No | Yes | Yes | Yes |
| Approve Tier 3 (first) | No | No | Yes | Yes |
| Approve Tier 3 (second) | No | Yes | Yes | Yes |
| Create/edit findings | Yes | Yes | Yes | Yes |
| View audit logs | No | No | Yes | Yes |
| Activate kill switch | No | No | Yes | Yes |
| Deactivate kill switch | No | No | No | Yes |
| Manage users | No | No | No | Yes |

Authorization is enforced at the API layer via FastAPI dependency injection:

```python
def require_role(minimum_role: UserRole):
    async def dependency(current_user: User = Depends(get_current_user)):
        role_hierarchy = {
            UserRole.OPERATOR: 0,
            UserRole.SENIOR_OPERATOR: 1,
            UserRole.LEAD: 2,
            UserRole.ADMIN: 3,
        }
        if role_hierarchy[current_user.role] < role_hierarchy[minimum_role]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return dependency
```

### 8.3 Audit Trail Integrity

- The `audit_log` table has database-level triggers preventing UPDATE and DELETE (see Section 3.2.6).
- The application's SQLAlchemy model for AuditLog does NOT expose `update()` or `delete()` methods.
- Audit log entries are written on a separate database connection to ensure persistence even if the parent transaction rolls back.
- In production, the database user for the application has `INSERT` and `SELECT` grants only on the `audit_log` table (no `UPDATE` or `DELETE`).

### 8.4 Secrets Management

- Tool credentials (API keys, SSH keys, service account tokens) are stored in a dedicated secrets store (HashiCorp Vault in production, encrypted environment variables in development).
- Credentials are loaded at tool execution time by the Celery worker, never passed through the API layer or stored in the orchestrator's LLM context.
- The orchestrator sees tool names and capabilities, never credentials.
- Tool output is sanitized to remove credentials or tokens before being stored in the `operation.output` JSONB field.

### 8.5 Network Isolation

- Tool execution workers run in a separate network segment with access to target infrastructure.
- The API server and frontend have NO direct access to target infrastructure.
- Communication between the API layer and tool workers is via the Celery/Redis message queue only.
- In Kubernetes: tool workers run in a dedicated namespace with NetworkPolicy restricting ingress to the Redis pod and egress to target CIDRs only.

### 8.6 Rate Limiting

| Endpoint Pattern | Limit | Window |
|-----------------|-------|--------|
| `POST /api/v1/auth/login` | 5 requests | per minute per IP |
| `POST /api/v1/auth/refresh` | 10 requests | per minute per user |
| `POST /api/v1/engagements` | 10 requests | per minute per user |
| `GET /api/v1/*` (read endpoints) | 100 requests | per minute per user |
| `POST /api/v1/approvals/*/approve` | 30 requests | per minute per user |
| `WS /api/v1/ws` | 5 connections | per user |

Rate limiting is implemented via Redis-backed sliding window counters.

### 8.7 Input Validation

- All request bodies are validated by Pydantic models with strict type checking.
- UUIDs are validated as proper UUID v4 format.
- CIDR strings are validated using Python's `ipaddress` module.
- Domain wildcards are limited to `*` at the start only (e.g., `*.example.com` is valid, `exam*.com` is not).
- JSONB fields (`scope_config`, `parameters`, `evidence`, `output`) are validated against JSON schemas.
- All database queries use SQLAlchemy's parameterized query builder. No raw SQL is constructed from user input.

### 8.8 WebSocket Security

- WebSocket connections require a valid JWT (passed as query parameter or first message).
- Each connection is scoped to engagements the user has access to.
- Subscription changes are validated against the user's role and engagement membership.
- Malformed messages result in connection termination.
- Idle connections (no pong response to server ping within 10 seconds) are terminated.

---

## 9. Deployment Architecture

### 9.1 Development Environment (Docker Compose)

```yaml
# docker-compose.yml (simplified)
services:
  api:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql+asyncpg://redteam:redteam@postgres:5432/redteam
      - REDIS_URL=redis://redis:6379/0
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on: [postgres, redis]

  worker:
    build: ./backend
    command: celery -A app.worker worker -l info -Q tool_execution
    environment: # same as api
    depends_on: [postgres, redis]

  beat:
    build: ./backend
    command: celery -A app.worker beat -l info
    environment: # same as api
    depends_on: [postgres, redis]

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      - VITE_API_URL=http://localhost:8000

  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      - POSTGRES_DB=redteam
      - POSTGRES_USER=redteam
      - POSTGRES_PASSWORD=redteam
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
```

### 9.2 Production Architecture (Kubernetes)

```
                         ┌──────────────┐
                         │   Ingress    │
                         │  (nginx)     │
                         └──────┬───────┘
                                │
                   ┌────────────┴────────────┐
                   │                         │
            ┌──────┴──────┐          ┌───────┴───────┐
            │  Frontend   │          │   API Server  │
            │  (Nginx +   │          │   (FastAPI)   │
            │   React)    │          │   3 replicas  │
            │  2 replicas │          └───────┬───────┘
            └─────────────┘                  │
                                    ┌────────┴────────┐
                                    │                 │
                            ┌───────┴──────┐  ┌──────┴───────┐
                            │   PgBouncer  │  │    Redis 7   │
                            │  Connection  │  │   (Sentinel  │
                            │    Pool      │  │    HA)       │
                            └───────┬──────┘  └──────┬───────┘
                                    │                 │
                            ┌───────┴──────┐  ┌──────┴───────┐
                            │ PostgreSQL   │  │    Celery     │
                            │   16 (HA)    │  │   Workers     │
                            │  Primary +   │  │   5 replicas  │
                            │  Replica     │  └──────────────┘
                            └──────────────┘
```

**Kubernetes Resources**:

| Component | Resource | Replicas | CPU Request | Memory Request |
|-----------|----------|----------|-------------|----------------|
| Frontend | Deployment | 2 | 100m | 128Mi |
| API Server | Deployment | 3 | 500m | 512Mi |
| Celery Worker | Deployment | 5 | 1000m | 1Gi |
| Celery Beat | Deployment | 1 | 100m | 128Mi |
| PgBouncer | Deployment | 2 | 200m | 256Mi |
| PostgreSQL | StatefulSet | 2 (primary + replica) | 2000m | 4Gi |
| Redis Sentinel | StatefulSet | 3 | 200m | 256Mi |

**Namespaces**:

| Namespace | Contents | Network Policy |
|-----------|----------|----------------|
| `redteam-app` | Frontend, API server, PgBouncer | Ingress from ingress-controller; egress to redteam-data, redteam-workers |
| `redteam-data` | PostgreSQL, Redis | Ingress from redteam-app, redteam-workers only |
| `redteam-workers` | Celery workers, Celery beat | Ingress from redteam-data (Redis); egress to redteam-data, target networks |

### 9.3 Database

- **PostgreSQL 16** with streaming replication (primary + 1 synchronous replica).
- **PgBouncer** for connection pooling: max 200 connections pooled, transaction-level pooling.
- **Backup**: pg_dump daily to S3-compatible object storage. WAL archiving for point-in-time recovery.
- **Retention**: Audit logs retained for 7 years (regulatory compliance). Engagement data retained for 3 years. Configurable per deployment.

### 9.4 Cache and Message Queue

- **Redis 7** with Sentinel for high availability (3-node Sentinel quorum).
- **Data Stored in Redis**:
  - Kill switch state: `kill_switch:*` keys
  - WebSocket pub/sub channels: `ws:engagement:{id}`, `ws:global`
  - Approval timeout tracking: `approval_timeout:{id}` with TTL
  - Rate limiting counters: `rate:{user_id}:{endpoint}` with TTL
  - Celery task queue: `celery` default queue + `tool_execution` named queue
- **Persistence**: Redis AOF (append-only file) enabled for kill switch state durability. All other data is ephemeral.

### 9.5 Monitoring and Observability

**Structured Logging** (JSON format):

```json
{
  "timestamp": "2026-10-21T10:05:00.123Z",
  "level": "INFO",
  "service": "api",
  "message": "Operation submitted for execution",
  "operation_id": "...",
  "engagement_id": "...",
  "action_type": "port_scan",
  "tier": 0,
  "trace_id": "abc123",
  "span_id": "def456"
}
```

**Prometheus Metrics**:

| Metric | Type | Description |
|--------|------|-------------|
| `redteam_operations_total` | Counter | Total operations by status, domain, tier |
| `redteam_operations_duration_seconds` | Histogram | Tool execution duration |
| `redteam_approvals_pending` | Gauge | Current pending approvals by tier |
| `redteam_approvals_decision_seconds` | Histogram | Time from request to decision |
| `redteam_findings_total` | Counter | Findings by severity |
| `redteam_kill_switch_activations_total` | Counter | Kill switch activations |
| `redteam_ws_connections` | Gauge | Active WebSocket connections |
| `redteam_api_request_duration_seconds` | Histogram | API endpoint latency |
| `redteam_orchestrator_decisions_total` | Counter | Orchestrator decisions by type |

**Grafana Dashboards**:

1. **Operations Overview**: Operation throughput, status breakdown, execution duration percentiles.
2. **Approval Pipeline**: Pending queue depth by tier, approval latency, auto-approve rate.
3. **Engagement Progress**: Per-engagement operation counts, finding severity distribution.
4. **System Health**: API latency, error rates, WebSocket connections, Redis memory, PostgreSQL connections.

**Alerting Rules**:

| Alert | Condition | Severity |
|-------|-----------|----------|
| HighApprovalQueueDepth | Pending approvals > 10 for > 5 minutes | Warning |
| KillSwitchActivated | Kill switch key set in Redis | Critical |
| OperationFailureSpike | > 5 failed operations in 5 minutes for one engagement | Warning |
| APIHighLatency | p99 latency > 2s for > 5 minutes | Warning |
| WorkerQueueBacklog | Celery queue depth > 50 | Warning |

### 9.6 Backup and Recovery

| Data | Backup Method | Frequency | Retention |
|------|--------------|-----------|-----------|
| PostgreSQL (full) | pg_dump to S3 | Daily at 02:00 UTC | 90 days |
| PostgreSQL (WAL) | Continuous WAL archiving | Continuous | 30 days |
| Audit logs | Export to object storage | Weekly | 7 years |
| Redis (AOF) | AOF rewrite | Automatic (Redis-managed) | N/A (ephemeral except kill switch) |
| Application config | Git repository | Per-change | Indefinite |

**Recovery Objectives**:
- **RPO** (Recovery Point Objective): 1 hour (WAL-based recovery)
- **RTO** (Recovery Time Objective): 4 hours (full cluster rebuild from backup)

---

## 10. Future Enhancements

### 10.1 Ticketing System Integration

- Bidirectional sync with Jira and ServiceNow.
- Findings automatically create tickets in the configured project.
- Ticket status updates (e.g., "Fixed") reflected in the finding status.
- Engagement completion triggers a summary ticket with all findings linked.

### 10.2 Custom Tool Plugin System

- Plugin interface: Python class implementing `ToolAdapter` abstract base class.
- Methods: `validate_params()`, `execute()`, `parse_output()`, `abort()`.
- Plugins register in the tool registry with their tier classification and supported actions.
- Hot-reloadable: new plugins can be added without restarting the system.
- Plugin marketplace for community-contributed tool adapters.

### 10.3 Machine Learning on Historical Engagements

- Train models on historical engagement data (action sequences, findings, success rates).
- Predict which attack chains are most likely to succeed given initial reconnaissance data.
- Optimize operation ordering to minimize time-to-finding.
- Anomaly detection: flag when an engagement deviates significantly from historical patterns.

### 10.4 Multi-Tenant Support

- Tenant isolation at the database level (schema-per-tenant or row-level security).
- Tenant-specific scope configurations and tool inventories.
- Per-tenant billing and usage tracking.
- Managed Security Service Provider (MSSP) mode: one operator manages multiple client engagements.

### 10.5 Compliance Report Templates

- Pre-built report templates for PCI DSS, SOC 2, ISO 27001, NIST 800-53, and HIPAA.
- Findings automatically mapped to relevant compliance controls.
- Executive summary generation using Claude.
- PDF export with customizable branding.

### 10.6 Automated Retesting

- Schedule periodic retesting of previously discovered vulnerabilities.
- Compare results: finding still present, partially remediated, or fully fixed.
- Generate remediation progress reports over time.
- Integrate with CI/CD pipelines for security regression testing.

### 10.7 Collaborative Features

- Real-time collaborative notes per engagement (CRDT-based).
- Operator assignment per engagement with workload balancing.
- In-app chat tied to specific operations or findings.
- Screen sharing of tool output for collaborative analysis.

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Engagement** | A scoped red team assessment against defined targets |
| **Operation** | A single atomic action (scan, exploit, pivot) within an engagement |
| **Attack Chain** | A sequence of linked operations where each builds on the previous |
| **Tier** | Risk classification (0-3) determining the approval requirements |
| **Kill Switch** | Emergency mechanism to halt all operations instantly |
| **Orchestrator** | The LLM-powered decision engine that plans and sequences operations |
| **Guardrails** | The collective safety mechanisms (scope, approval, logging, kill switch) |
| **Tool Domain** | Category of security tools (AD, Cloud, Network, AI/LLM) |
| **Finding** | A discovered security vulnerability or misconfiguration |
| **Scope** | The authorized targets (CIDRs, domains, cloud accounts) for an engagement |

## Appendix B: Configuration Defaults

| Setting | Default | Description |
|---------|---------|-------------|
| `APPROVAL_TIER1_TIMEOUT_MINUTES` | 15 | Auto-approve timeout for Tier 1 |
| `ESCALATION_TIER1_NOTIFY_MINUTES` | 10 | When to notify senior operators |
| `ESCALATION_TIER2_NOTIFY_MINUTES` | 30 | When to notify leads |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | 15 | Access token lifetime |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | 7 | Refresh token lifetime |
| `WS_PING_INTERVAL_SECONDS` | 30 | WebSocket heartbeat interval |
| `WS_PONG_TIMEOUT_SECONDS` | 10 | Pong response deadline |
| `ORCHESTRATOR_CONTEXT_WINDOW_OPS` | 5 | Full operations kept in LLM context |
| `ORCHESTRATOR_SUMMARIZE_INTERVAL` | 10 | Operations before summarization |
| `MAX_CONCURRENT_OPERATIONS` | 10 | Per-engagement execution limit |
| `CELERY_TASK_SOFT_TIME_LIMIT` | 3600 | Soft timeout for tool execution (seconds) |
| `CELERY_TASK_HARD_TIME_LIMIT` | 3900 | Hard timeout for tool execution (seconds) |
