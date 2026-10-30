export enum ToolDomain {
  AD = 'AD',
  CLOUD = 'CLOUD',
  NETWORK = 'NETWORK',
  AI_LLM = 'AI_LLM',
}

export enum EngagementStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ABORTED = 'ABORTED',
}

export enum OperationStatus {
  PLANNED = 'PLANNED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  BLOCKED = 'BLOCKED',
}

export enum ApprovalTier {
  PASSIVE = 0,
  ACTIVE = 1,
  EXPLOIT = 2,
  LATERAL = 3,
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  AUTO_APPROVED = 'AUTO_APPROVED',
  EXPIRED = 'EXPIRED',
}

export enum FindingSeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ScopeConfig {
  cidrs: string[];
  domains: string[];
  cloud_accounts: string[];
  exclusions: string[];
}

export interface Engagement {
  id: string;
  name: string;
  status: EngagementStatus;
  scope_config: ScopeConfig;
  rules_of_engagement: string;
  created_at: string;
  started_at?: string;
}

export interface Operation {
  id: string;
  engagement_id: string;
  tool_domain: ToolDomain;
  action_type: string;
  target: string;
  parameters: Record<string, any>;
  status: OperationStatus;
  output?: Record<string, any>;
  parent_operation_id?: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  operation_id: string;
  operation: Operation;
  tier: ApprovalTier;
  status: ApprovalStatus;
  reviewer_id?: string;
  decision_notes?: string;
  auto_approve_at?: string;
  created_at: string;
}

export interface Finding {
  id: string;
  engagement_id: string;
  operation_id?: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  evidence: Record<string, any>;
  cvss_score?: number;
  affected_asset: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any>;
  ip_address: string;
  created_at: string;
}

export interface WebSocketEvent {
  type: 'operation_update' | 'approval_required' | 'finding_discovered' | 'kill_switch_activated';
  data: Operation | ApprovalRequest | Finding | { engagement_id: string };
}

export interface ApiResponse<T> {
  data: T;
  total?: number;
  page?: number;
  per_page?: number;
}

export enum UserRole {
  OPERATOR = 'OPERATOR',
  SENIOR_OPERATOR = 'SENIOR_OPERATOR',
  LEAD = 'LEAD',
  ADMIN = 'ADMIN',
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}
