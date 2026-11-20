export type VoteStatus = 'VOTED' | 'NOT_VOTED' | 'DEAD';

export type OfficerRole = 'Presiding Officer' | 'Polling Officer';

export interface BoothSummary {
  id: string;
  name: string;
  constituency: string;
  election_title: string;
  max_officers: number;
  is_locked: boolean;
  closed_at: string | null;
  created_at: string;
  officer_count: number;
  active_logins: number;
}

export interface OfficerPresence {
  id: string;
  booth_id: string;
  username: string;
  full_name: string;
  role: OfficerRole;
  is_logged_in: boolean;
  is_online: boolean;
  last_seen_at: string | null;
}

export interface VoterRecord {
  id: number;
  booth_id: string;
  serial_no: number;
  voter_id: string;
  full_name: string;
  guardian_name: string;
  age: number | null;
  gender: string;
  address: string;
  part_no: string;
  status: VoteStatus;
  voted_at: string | null;
  verified_by_officer_id: string | null;
  verified_by_officer_name: string | null;
  marked_dead_at: string | null;
  marked_dead_by_officer_id: string | null;
  marked_dead_by_officer_name: string | null;
  marked_dead_by_officer_role: string | null;
  dead_note: string | null;
}

export interface BoothStats {
  total_voters: number;
  voted_count: number;
  dead_count: number;
  remaining_count: number;
  completion_percentage: number;
  duplicate_attempts_blocked: number;
  reverted_count: number;
  last_vote_at: string | null;
}

export type AuditAction =
  | 'MARK_VOTED'
  | 'MARK_DEAD'
  | 'DUPLICATE_BLOCKED'
  | 'DEAD_VOTER_BLOCKED'
  | 'REVERT_VOTE'
  | 'ROLL_UPLOADED'
  | 'OFFICER_LOGIN'
  | 'OFFICER_LOGOUT'
  | 'POLL_CLOSED'
  | 'POLL_REOPENED';

export interface AuditEntry {
  id: number;
  booth_id: string;
  action: AuditAction;
  voter_id: string | null;
  serial_no: number | null;
  voter_name: string | null;
  officer_id: string | null;
  officer_name: string | null;
  details: string;
  created_at: string;
}

export interface BoothStatePayload {
  booth: BoothSummary;
  officers: OfficerPresence[];
  voters: VoterRecord[];
  stats: BoothStats;
  audit_logs: AuditEntry[];
}

export interface AuthSession {
  token: string;
  booth: BoothSummary;
  officer: {
    id: string;
    username: string;
    full_name: string;
    role: OfficerRole;
  };
}

export interface ImportPreviewColumnMap {
  serial_no: string;
  voter_id: string;
  full_name: string;
  guardian_name: string;
  age: string;
  gender: string;
  address: string;
  part_no: string;
}

export interface ImportPreviewResponse {
  fileName: string;
  sheetName: string;
  headers: string[];
  detectedMap: ImportPreviewColumnMap;
  totalRows: number;
  rawRows: Record<string, unknown>[];
}

export interface EndOfDayReport {
  generated_at: string;
  booth: BoothSummary;
  stats: BoothStats;
  gender_breakdown: Array<{
    gender: string;
    total: number;
    voted: number;
    remaining: number;
    percentage: number;
  }>;
  age_breakdown: Array<{
    bracket: string;
    total: number;
    voted: number;
    percentage: number;
  }>;
  hourly_turnout: Array<{
    hour: string;
    count: number;
    cumulative: number;
  }>;
  officer_activity: Array<{
    officer_id: string;
    officer_name: string;
    role: string;
    votes_verified: number;
    dead_marked: number;
    duplicates_blocked: number;
  }>;
  dead_voters: VoterRecord[];
  audit_logs: AuditEntry[];
}

export interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  title: string;
}

export interface AdminSession {
  kind: 'admin';
  token: string;
  admin: AdminUser;
}

export interface BoothInchargeStat extends OfficerPresence {
  votes_verified: number;
  dead_marked: number;
  duplicates_blocked: number;
}

export interface AdminBoothItem {
  booth: BoothSummary;
  stats: BoothStats;
  incharges: BoothInchargeStat[];
}

export interface WardSummaryItem {
  constituency: string;
  booth_count: number;
  open_booths: number;
  closed_booths: number;
  total_voters: number;
  voted_count: number;
  dead_count: number;
  remaining_count: number;
  completion_percentage: number;
  duplicate_attempts_blocked: number;
}

export interface AdminDashboardState {
  generated_at: string;
  overall: {
    total_booths: number;
    open_booths: number;
    closed_booths: number;
    total_voters: number;
    voted_count: number;
    dead_count: number;
    remaining_count: number;
    completion_percentage: number;
    duplicate_attempts_blocked: number;
    online_incharges: number;
    total_incharges: number;
  };
  wards: WardSummaryItem[];
  booths: AdminBoothItem[];
  recent_audit_logs: Array<AuditEntry & { booth_name: string }>;
}

export type WsServerEvent =
  | {
      type: 'init';
      state: BoothStatePayload;
      onlineOfficerIds: string[];
    }
  | {
      type: 'voter:updated';
      voter: VoterRecord;
      stats: BoothStats;
      auditEntry: AuditEntry;
    }
  | {
      type: 'fraud:blocked';
      voter: VoterRecord;
      attemptedBy: string;
      auditEntry: AuditEntry;
      stats: BoothStats;
    }
  | {
      type: 'roll:replaced';
      stats: BoothStats;
      voters: VoterRecord[];
      auditEntry: AuditEntry;
    }
  | {
      type: 'presence:updated';
      officers: OfficerPresence[];
    }
  | {
      type: 'booth:updated';
      booth: BoothSummary;
      auditEntry: AuditEntry;
    }
  | {
      type: 'admin:init';
      state: AdminDashboardState;
    }
  | {
      type: 'admin:updated';
      state: AdminDashboardState;
    };

