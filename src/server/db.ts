import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  AdminBoothItem,
  AdminDashboardState,
  AdminUser,
  AuditAction,
  AuditEntry,
  BoothInchargeStat,
  BoothStatePayload,
  BoothStats,
  BoothSummary,
  EndOfDayReport,
  OfficerPresence,
  OfficerRole,
  VoterRecord,
  WardSummaryItem,
} from '../types/election.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'boothguard.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS booths (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    constituency TEXT NOT NULL,
    election_title TEXT NOT NULL,
    max_officers INTEGER NOT NULL DEFAULT 2,
    is_locked INTEGER NOT NULL DEFAULT 0,
    closed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS officers (
    id TEXT PRIMARY KEY,
    booth_id TEXT NOT NULL,
    username TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    passcode TEXT NOT NULL,
    active_session_token TEXT,
    last_seen_at TEXT,
    UNIQUE(booth_id, username),
    FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS voters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booth_id TEXT NOT NULL,
    serial_no INTEGER NOT NULL,
    voter_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    guardian_name TEXT NOT NULL DEFAULT '',
    age INTEGER,
    gender TEXT NOT NULL DEFAULT 'Other',
    address TEXT NOT NULL DEFAULT '',
    part_no TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'NOT_VOTED',
    voted_at TEXT,
    verified_by_officer_id TEXT,
    verified_by_officer_name TEXT,
    UNIQUE(booth_id, serial_no),
    UNIQUE(booth_id, voter_id),
    FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_voters_booth_serial ON voters(booth_id, serial_no);
  CREATE INDEX IF NOT EXISTS idx_voters_booth_voterid ON voters(booth_id, voter_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booth_id TEXT NOT NULL,
    action TEXT NOT NULL,
    voter_id TEXT,
    serial_no INTEGER,
    voter_name TEXT,
    officer_id TEXT,
    officer_name TEXT,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_audit_booth ON audit_logs(booth_id, id DESC);

  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    title TEXT NOT NULL,
    passcode TEXT NOT NULL,
    active_session_token TEXT,
    last_seen_at TEXT
  );
`);

function ensureVoterDeadColumns(): void {
  const cols = db.prepare(`PRAGMA table_info(voters)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ['marked_dead_at', 'TEXT'],
    ['marked_dead_by_officer_id', 'TEXT'],
    ['marked_dead_by_officer_name', 'TEXT'],
    ['marked_dead_by_officer_role', 'TEXT'],
    ['dead_note', 'TEXT'],
  ];
  for (const [col, def] of additions) {
    if (!names.has(col)) {
      db.exec(`ALTER TABLE voters ADD COLUMN ${col} ${def}`);
    }
  }
}

ensureVoterDeadColumns();

function hashPasscode(passcode: string): string {
  return crypto.createHash('sha256').update(passcode.trim()).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function seedDemoBoothIfEmpty(): void {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM booths').get() as { cnt: number };
  if (row.cnt > 0) {
    return;
  }

  const boothId = 'BOOTH-042';
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO booths (id, name, constituency, election_title, max_officers, is_locked, created_at)
     VALUES (?, ?, ?, ?, 2, 0, ?)`
  ).run(
    boothId,
    'Booth 042 · Central Public School (East Wing)',
    'Assembly Constituency 14 · Ward 12',
    'Municipal General Election 2026',
    createdAt
  );

  const insertOfficer = db.prepare(
    `INSERT INTO officers (id, booth_id, username, full_name, role, passcode)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  insertOfficer.run(
    'OFF-042-1',
    boothId,
    'officer1',
    'Raghavendra Rao',
    'Presiding Officer',
    hashPasscode('1001')
  );
  insertOfficer.run(
    'OFF-042-2',
    boothId,
    'officer2',
    'Meenakshi Iyer',
    'Polling Officer',
    hashPasscode('1002')
  );

  const sampleVoters: Array<{
    serial: number;
    epic: string;
    name: string;
    guardian: string;
    age: number;
    gender: string;
    address: string;
    voted: boolean;
    hourOffset?: number;
    officerIdx?: number;
  }> = [
    { serial: 1, epic: 'VTR2042001', name: 'Aarav Sharma', guardian: 'Rajesh Sharma', age: 34, gender: 'Male', address: 'H.No 12-1-401, Gandhi Nagar', voted: true, hourOffset: 8, officerIdx: 1 },
    { serial: 2, epic: 'VTR2042002', name: 'Priya Nair', guardian: 'Suresh Nair', age: 29, gender: 'Female', address: 'H.No 12-1-402, Gandhi Nagar', voted: true, hourOffset: 8, officerIdx: 2 },
    { serial: 3, epic: 'VTR2042003', name: 'Vikram Patel', guardian: 'Mahesh Patel', age: 47, gender: 'Male', address: 'H.No 12-1-405, Gandhi Nagar', voted: false },
    { serial: 4, epic: 'VTR2042004', name: 'Ananya Deshmukh', guardian: 'Prakash Deshmukh', age: 23, gender: 'Female', address: 'H.No 12-1-409, Gandhi Nagar', voted: true, hourOffset: 8, officerIdx: 1 },
    { serial: 5, epic: 'VTR2042005', name: 'Mohammed Farooq', guardian: 'Abdul Kareem', age: 58, gender: 'Male', address: 'H.No 12-1-412, Station Road', voted: true, hourOffset: 9, officerIdx: 2 },
    { serial: 6, epic: 'VTR2042006', name: 'Zainab Begum', guardian: 'Mohammed Farooq', age: 52, gender: 'Female', address: 'H.No 12-1-412, Station Road', voted: false },
    { serial: 7, epic: 'VTR2042007', name: 'Karthik Reddy', guardian: 'Venkatesh Reddy', age: 31, gender: 'Male', address: 'H.No 12-2-104, Park Lane', voted: true, hourOffset: 9, officerIdx: 1 },
    { serial: 8, epic: 'VTR2042008', name: 'Deepika Kulkarni', guardian: 'Anil Kulkarni', age: 41, gender: 'Female', address: 'H.No 12-2-108, Park Lane', voted: false },
    { serial: 9, epic: 'VTR2042009', name: 'Siddharth Verma', guardian: 'Ramesh Verma', age: 64, gender: 'Male', address: 'H.No 12-2-115, Park Lane', voted: true, hourOffset: 9, officerIdx: 1 },
    { serial: 10, epic: 'VTR2042010', name: 'Lakshmi Narayanan', guardian: 'Subramanian K', age: 71, gender: 'Female', address: 'H.No 12-2-119, Temple Street', voted: true, hourOffset: 9, officerIdx: 2 },
    { serial: 11, epic: 'VTR2042011', name: 'Rohan Malhotra', guardian: 'Sanjay Malhotra', age: 26, gender: 'Male', address: 'H.No 12-2-122, Temple Street', voted: false },
    { serial: 12, epic: 'VTR2042012', name: 'Sneha Chatterjee', guardian: 'Debashish Chatterjee', age: 36, gender: 'Female', address: 'H.No 12-2-130, Lake View', voted: true, hourOffset: 10, officerIdx: 2 },
    { serial: 13, epic: 'VTR2042013', name: 'Arjun Menon', guardian: 'Gopalakrishnan Menon', age: 45, gender: 'Male', address: 'H.No 12-3-201, Lake View', voted: false },
    { serial: 14, epic: 'VTR2042014', name: 'Kavitha Krishnan', guardian: 'Murali Krishnan', age: 39, gender: 'Female', address: 'H.No 12-3-205, Lake View', voted: true, hourOffset: 10, officerIdx: 1 },
    { serial: 15, epic: 'VTR2042015', name: 'Prashant Joshi', guardian: 'Harish Joshi', age: 53, gender: 'Male', address: 'H.No 12-3-210, School Road', voted: false },
    { serial: 16, epic: 'VTR2042016', name: 'Neha Agarwal', guardian: 'Vinod Agarwal', age: 28, gender: 'Female', address: 'H.No 12-3-214, School Road', voted: true, hourOffset: 10, officerIdx: 2 },
    { serial: 17, epic: 'VTR2042017', name: 'Suresh Babu', guardian: 'Narasimha Rao', age: 62, gender: 'Male', address: 'H.No 12-3-218, School Road', voted: false },
    { serial: 18, epic: 'VTR2042018', name: 'Padma Kumari', guardian: 'Suresh Babu', age: 57, gender: 'Female', address: 'H.No 12-3-218, School Road', voted: false },
    { serial: 19, epic: 'VTR2042019', name: 'Nikhil Gupta', guardian: 'Ashok Gupta', age: 21, gender: 'Male', address: 'H.No 12-4-301, Market Square', voted: true, hourOffset: 11, officerIdx: 1 },
    { serial: 20, epic: 'VTR2042020', name: 'Pooja Bansal', guardian: 'Manoj Bansal', age: 33, gender: 'Female', address: 'H.No 12-4-305, Market Square', voted: false },
    { serial: 21, epic: 'VTR2042021', name: 'Harshavardhan K', guardian: 'Srinivas K', age: 44, gender: 'Male', address: 'H.No 12-4-310, Market Square', voted: true, hourOffset: 11, officerIdx: 2 },
    { serial: 22, epic: 'VTR2042022', name: 'Divya Bharathi', guardian: 'Rajan T', age: 27, gender: 'Female', address: 'H.No 12-4-312, Market Square', voted: false },
    { serial: 23, epic: 'VTR2042023', name: 'Manish Tiwari', guardian: 'Dinesh Tiwari', age: 49, gender: 'Male', address: 'H.No 12-5-102, Civil Lines', voted: false },
    { serial: 24, epic: 'VTR2042024', name: 'Ritika Sen', guardian: 'Subhash Sen', age: 35, gender: 'Female', address: 'H.No 12-5-108, Civil Lines', voted: true, hourOffset: 11, officerIdx: 1 },
    { serial: 25, epic: 'VTR2042025', name: 'Gautam Choudhary', guardian: 'Baldev Choudhary', age: 68, gender: 'Male', address: 'H.No 12-5-114, Civil Lines', voted: false },
    { serial: 26, epic: 'VTR2042026', name: 'Shruti Hegde', guardian: 'Raghavendra Hegde', age: 30, gender: 'Female', address: 'H.No 12-5-120, Civil Lines', voted: false },
    { serial: 27, epic: 'VTR2042027', name: 'Tarun Kapoor', guardian: 'Vikas Kapoor', age: 38, gender: 'Male', address: 'H.No 12-6-201, Nehru Colony', voted: true, hourOffset: 12, officerIdx: 2 },
    { serial: 28, epic: 'VTR2042028', name: 'Meera Sundaram', guardian: 'Balaji Sundaram', age: 55, gender: 'Female', address: 'H.No 12-6-206, Nehru Colony', voted: false },
    { serial: 29, epic: 'VTR2042029', name: 'Aditya Deshpande', guardian: 'Milind Deshpande', age: 24, gender: 'Male', address: 'H.No 12-6-211, Nehru Colony', voted: false },
    { serial: 30, epic: 'VTR2042030', name: 'Swathi Menon', guardian: 'Pradeep Menon', age: 42, gender: 'Female', address: 'H.No 12-6-219, Nehru Colony', voted: false },
    { serial: 31, epic: 'VTR2042031', name: 'Kiran Kumar', guardian: 'Satyanarayana', age: 51, gender: 'Male', address: 'H.No 12-7-401, Azad Road', voted: true, hourOffset: 12, officerIdx: 1 },
    { serial: 32, epic: 'VTR2042032', name: 'Nandini Rao', guardian: 'Kiran Kumar', age: 46, gender: 'Female', address: 'H.No 12-7-401, Azad Road', voted: false },
    { serial: 33, epic: 'VTR2042033', name: 'Vivek Saxena', guardian: 'Rajendra Saxena', age: 32, gender: 'Male', address: 'H.No 12-7-407, Azad Road', voted: false },
    { serial: 34, epic: 'VTR2042034', name: 'Anjali Mishra', guardian: 'Santosh Mishra', age: 29, gender: 'Female', address: 'H.No 12-7-412, Azad Road', voted: false },
    { serial: 35, epic: 'VTR2042035', name: 'Ramesh Yadav', guardian: 'Ram Prasad Yadav', age: 60, gender: 'Male', address: 'H.No 12-8-501, Shastri Nagar', voted: false },
    { serial: 36, epic: 'VTR2042036', name: 'Geeta Devi', guardian: 'Ramesh Yadav', age: 54, gender: 'Female', address: 'H.No 12-8-501, Shastri Nagar', voted: false },
    { serial: 37, epic: 'VTR2042037', name: 'Pranav Gokhale', guardian: 'Sharad Gokhale', age: 22, gender: 'Male', address: 'H.No 12-8-509, Shastri Nagar', voted: false },
    { serial: 38, epic: 'VTR2042038', name: 'Bhavna Chauhan', guardian: 'Rajvir Chauhan', age: 37, gender: 'Female', address: 'H.No 12-8-514, Shastri Nagar', voted: false },
    { serial: 39, epic: 'VTR2042039', name: 'Imran Siddiqui', guardian: 'Tariq Siddiqui', age: 40, gender: 'Male', address: 'H.No 12-9-602, Rose Enclave', voted: false },
    { serial: 40, epic: 'VTR2042040', name: 'Farha Naaz', guardian: 'Imran Siddiqui', age: 35, gender: 'Female', address: 'H.No 12-9-602, Rose Enclave', voted: false },
  ];

  const insertVoter = db.prepare(
    `INSERT INTO voters (
      booth_id, serial_no, voter_id, full_name, guardian_name, age, gender, address, part_no,
      status, voted_at, verified_by_officer_id, verified_by_officer_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PART-12A', ?, ?, ?, ?)`
  );

  const insertAudit = db.prepare(
    `INSERT INTO audit_logs (booth_id, action, voter_id, serial_no, voter_name, officer_id, officer_name, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const today = new Date();
  for (const v of sampleVoters) {
    let votedAt: string | null = null;
    let offId: string | null = null;
    let offName: string | null = null;

    if (v.voted) {
      const d = new Date(today);
      d.setHours(v.hourOffset ?? 9, (v.serial * 7) % 55, 0, 0);
      votedAt = d.toISOString();
      offId = v.officerIdx === 2 ? 'OFF-042-2' : 'OFF-042-1';
      offName = v.officerIdx === 2 ? 'Meenakshi Iyer' : 'Raghavendra Rao';
    }

    insertVoter.run(
      boothId,
      v.serial,
      v.epic,
      v.name,
      v.guardian,
      v.age,
      v.gender,
      v.address,
      v.voted ? 'VOTED' : 'NOT_VOTED',
      votedAt,
      offId,
      offName
    );

    if (v.voted && votedAt && offId && offName) {
      insertAudit.run(
        boothId,
        'MARK_VOTED',
        v.epic,
        v.serial,
        v.name,
        offId,
        offName,
        `Verified Serial #${v.serial} (${v.epic})`,
        votedAt
      );
    }
  }
}

seedDemoBoothIfEmpty();

function seedAdminAndWardBooths(): void {
  const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM admins').get() as { cnt: number };
  if (adminCount.cnt > 0) {
    return;
  }

  db.prepare(
    `INSERT INTO admins (id, username, full_name, title, passcode)
     VALUES (?, ?, ?, ?, ?)`
  ).run('ADMIN-01', 'admin', 'S. Venkataramana', 'Ward Returning Officer', hashPasscode('9999'));

  const extraBooths: Array<{
    id: string;
    name: string;
    constituency: string;
    maxOfficers: number;
    officers: Array<{ id: string; username: string; fullName: string; role: OfficerRole; pin: string }>;
    totalVoters: number;
    votedCount: number;
  }> = [
    {
      id: 'BOOTH-043',
      name: 'Booth 043 · Municipal Girls High School',
      constituency: 'Assembly Constituency 14 · Ward 12',
      maxOfficers: 2,
      officers: [
        { id: 'OFF-043-1', username: 'officer43a', fullName: 'K. Satish Kumar', role: 'Presiding Officer', pin: '1001' },
        { id: 'OFF-043-2', username: 'officer43b', fullName: 'Anitha Reddy', role: 'Polling Officer', pin: '1002' },
      ],
      totalVoters: 30,
      votedCount: 19,
    },
    {
      id: 'BOOTH-044',
      name: 'Booth 044 · Community Library Hall',
      constituency: 'Assembly Constituency 14 · Ward 12',
      maxOfficers: 1,
      officers: [
        { id: 'OFF-044-1', username: 'officer44', fullName: 'M. Prakash Rao', role: 'Presiding Officer', pin: '1001' },
      ],
      totalVoters: 25,
      votedCount: 11,
    },
  ];

  const firstNames = [
    'Surya', 'Kavya', 'Nitin', 'Swathi', 'Balaji', 'Revathi', 'Dinesh', 'Shalini',
    'Manoj', 'Padma', 'Rakesh', 'Jyothi', 'Kishore', 'Sunitha', 'Gopal', 'Meena',
    'Vamsi', 'Latha', 'Sandeep', 'Usha', 'Naveen', 'Rekha', 'Tarun', 'Divya', 'Prasad',
    'Keerthi', 'Harish', 'Anjali', 'Suresh', 'Nandini',
  ];
  const lastNames = ['Rao', 'Sharma', 'Reddy', 'Nair', 'Patel', 'Verma', 'Iyer', 'Kulkarni'];

  const insertBooth = db.prepare(
    `INSERT INTO booths (id, name, constituency, election_title, max_officers, is_locked, created_at)
     VALUES (?, ?, ?, 'Municipal General Election 2026', ?, 0, ?)`
  );
  const insertOfficer = db.prepare(
    `INSERT INTO officers (id, booth_id, username, full_name, role, passcode)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertVoter = db.prepare(
    `INSERT INTO voters (
      booth_id, serial_no, voter_id, full_name, guardian_name, age, gender, address, part_no,
      status, voted_at, verified_by_officer_id, verified_by_officer_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAudit = db.prepare(
    `INSERT INTO audit_logs (booth_id, action, voter_id, serial_no, voter_name, officer_id, officer_name, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const today = new Date();

  for (const b of extraBooths) {
    const exists = db.prepare('SELECT id FROM booths WHERE id = ?').get(b.id);
    if (exists) continue;

    insertBooth.run(b.id, b.name, b.constituency, b.maxOfficers, nowIso());
    for (const o of b.officers) {
      insertOfficer.run(o.id, b.id, o.username, o.fullName, o.role, hashPasscode(o.pin));
    }

    for (let i = 1; i <= b.totalVoters; i += 1) {
      const fn = firstNames[(i - 1) % firstNames.length];
      const ln = lastNames[(i + b.totalVoters) % lastNames.length];
      const fullName = `${fn} ${ln}`;
      const guardian = `R. ${ln}`;
      const gender = i % 2 === 0 ? 'Female' : 'Male';
      const age = 21 + ((i * 3) % 48);
      const epic = `VTR${b.id.replace('BOOTH-', '2')}${String(i).padStart(3, '0')}`;
      const address = `H.No 12-${b.id.slice(-2)}-${100 + i}, Ward 12`;
      const isVoted = i <= b.votedCount;

      let votedAt: string | null = null;
      let offId: string | null = null;
      let offName: string | null = null;

      if (isVoted) {
        const off = b.officers[i % b.officers.length];
        const d = new Date(today);
        d.setHours(8 + (i % 5), (i * 9) % 55, 0, 0);
        votedAt = d.toISOString();
        offId = off.id;
        offName = off.fullName;
      }

      insertVoter.run(
        b.id,
        i,
        epic,
        fullName,
        guardian,
        age,
        gender,
        address,
        `PART-${b.id.slice(-2)}`,
        isVoted ? 'VOTED' : 'NOT_VOTED',
        votedAt,
        offId,
        offName
      );

      if (isVoted && votedAt && offId && offName) {
        insertAudit.run(
          b.id,
          'MARK_VOTED',
          epic,
          i,
          fullName,
          offId,
          offName,
          `Verified Serial #${i} (${epic})`,
          votedAt
        );
      }
    }
  }
}

seedAdminAndWardBooths();

export function listBooths(): BoothSummary[] {
  const rows = db
    .prepare(
      `SELECT
         b.*,
         (SELECT COUNT(*) FROM officers o WHERE o.booth_id = b.id) as officer_count,
         (SELECT COUNT(*) FROM officers o WHERE o.booth_id = b.id AND o.active_session_token IS NOT NULL) as active_logins
       FROM booths b
       ORDER BY b.created_at DESC`
    )
    .all() as Array<{
    id: string;
    name: string;
    constituency: string;
    election_title: string;
    max_officers: number;
    is_locked: number;
    closed_at: string | null;
    created_at: string;
    officer_count: number;
    active_logins: number;
  }>;

  return rows.map((r) => ({
    ...r,
    is_locked: Boolean(r.is_locked),
  }));
}

export function getBoothSummary(boothId: string): BoothSummary | null {
  const row = db
    .prepare(
      `SELECT
         b.*,
         (SELECT COUNT(*) FROM officers o WHERE o.booth_id = b.id) as officer_count,
         (SELECT COUNT(*) FROM officers o WHERE o.booth_id = b.id AND o.active_session_token IS NOT NULL) as active_logins
       FROM booths b
       WHERE b.id = ?`
    )
    .get(boothId) as
    | {
        id: string;
        name: string;
        constituency: string;
        election_title: string;
        max_officers: number;
        is_locked: number;
        closed_at: string | null;
        created_at: string;
        officer_count: number;
        active_logins: number;
      }
    | undefined;

  if (!row) return null;
  return {
    ...row,
    is_locked: Boolean(row.is_locked),
  };
}

export function createBoothWithOfficers(input: {
  id: string;
  name: string;
  constituency: string;
  electionTitle: string;
  officers: Array<{
    username: string;
    fullName: string;
    role: OfficerRole;
    passcode: string;
  }>;
}): { booth: BoothSummary } {
  const cleanBoothId = input.id.trim().toUpperCase().replace(/\s+/g, '-');
  if (!cleanBoothId) {
    throw new Error('Booth ID is required.');
  }
  if (input.officers.length < 1 || input.officers.length > 2) {
    throw new Error('Each booth must have 1 or 2 authorized officer logins.');
  }

  const existing = db.prepare('SELECT id FROM booths WHERE id = ?').get(cleanBoothId);
  if (existing) {
    throw new Error(`Booth ${cleanBoothId} already exists.`);
  }

  const createdAt = nowIso();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO booths (id, name, constituency, election_title, max_officers, is_locked, created_at)
       VALUES (?, ?, ?, ?, 2, 0, ?)`
    ).run(
      cleanBoothId,
      input.name.trim(),
      input.constituency.trim() || 'General Constituency',
      input.electionTitle.trim() || 'Booth Election 2026',
      createdAt
    );

    const insertOfficer = db.prepare(
      `INSERT INTO officers (id, booth_id, username, full_name, role, passcode)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    input.officers.forEach((off, idx) => {
      const offId = `OFF-${cleanBoothId}-${idx + 1}`;
      insertOfficer.run(
        offId,
        cleanBoothId,
        off.username.trim().toLowerCase(),
        off.fullName.trim(),
        off.role,
        hashPasscode(off.passcode)
      );
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const booth = getBoothSummary(cleanBoothId);
  if (!booth) {
    throw new Error('Failed to create booth.');
  }
  return { booth };
}

export function loginOfficer(
  boothId: string,
  username: string,
  passcode: string,
  forceTakeover = false
): {
  token: string;
  booth: BoothSummary;
  officer: { id: string; username: string; full_name: string; role: OfficerRole };
} {
  const booth = getBoothSummary(boothId);
  if (!booth) {
    throw new Error('Selected booth was not found.');
  }

  const officerRow = db
    .prepare(
      `SELECT id, booth_id, username, full_name, role, passcode, active_session_token
       FROM officers
       WHERE booth_id = ? AND lower(username) = lower(?)`
    )
    .get(boothId, username.trim()) as
    | {
        id: string;
        booth_id: string;
        username: string;
        full_name: string;
        role: OfficerRole;
        passcode: string;
        active_session_token: string | null;
      }
    | undefined;

  if (!officerRow || officerRow.passcode !== hashPasscode(passcode)) {
    throw new Error('Invalid officer username or passcode.');
  }

  // Enforce max 2 active logins per booth
  const activeOtherOfficers = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM officers
       WHERE booth_id = ? AND active_session_token IS NOT NULL AND id != ?`
    )
    .get(boothId, officerRow.id) as { cnt: number };

  if (activeOtherOfficers.cnt >= booth.max_officers) {
    throw new Error(
      `Booth ${boothId} already has the maximum of ${booth.max_officers} active officer logins.`
    );
  }

  if (officerRow.active_session_token && !forceTakeover) {
    // Allow same officer credential re-login smoothly by rotating session token
  }

  const token = crypto.randomBytes(24).toString('hex');
  const ts = nowIso();

  db.prepare(
    `UPDATE officers SET active_session_token = ?, last_seen_at = ? WHERE id = ?`
  ).run(token, ts, officerRow.id);

  insertAuditLog(
    boothId,
    'OFFICER_LOGIN',
    null,
    null,
    null,
    officerRow.id,
    officerRow.full_name,
    `${officerRow.role} (${officerRow.username}) signed in to booth terminal`
  );

  const updatedBooth = getBoothSummary(boothId)!;
  return {
    token,
    booth: updatedBooth,
    officer: {
      id: officerRow.id,
      username: officerRow.username,
      full_name: officerRow.full_name,
      role: officerRow.role,
    },
  };
}

export function getOfficerByToken(token: string): {
  id: string;
  booth_id: string;
  username: string;
  full_name: string;
  role: OfficerRole;
} | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT id, booth_id, username, full_name, role
       FROM officers WHERE active_session_token = ?`
    )
    .get(token) as
    | {
        id: string;
        booth_id: string;
        username: string;
        full_name: string;
        role: OfficerRole;
      }
    | undefined;

  if (!row) return null;
  db.prepare(`UPDATE officers SET last_seen_at = ? WHERE id = ?`).run(nowIso(), row.id);
  return row;
}

export function logoutOfficer(token: string): string | null {
  const officer = getOfficerByToken(token);
  if (!officer) return null;

  db.prepare(`UPDATE officers SET active_session_token = NULL WHERE id = ?`).run(officer.id);
  insertAuditLog(
    officer.booth_id,
    'OFFICER_LOGOUT',
    null,
    null,
    null,
    officer.id,
    officer.full_name,
    `${officer.role} (${officer.username}) signed out`
  );
  return officer.booth_id;
}

export function getOfficersPresence(
  boothId: string,
  onlineOfficerIds: Set<string> = new Set()
): OfficerPresence[] {
  const rows = db
    .prepare(
      `SELECT id, booth_id, username, full_name, role, active_session_token, last_seen_at
       FROM officers WHERE booth_id = ? ORDER BY id ASC`
    )
    .all(boothId) as Array<{
    id: string;
    booth_id: string;
    username: string;
    full_name: string;
    role: OfficerRole;
    active_session_token: string | null;
    last_seen_at: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    booth_id: r.booth_id,
    username: r.username,
    full_name: r.full_name,
    role: r.role,
    is_logged_in: Boolean(r.active_session_token),
    is_online: onlineOfficerIds.has(r.id),
    last_seen_at: r.last_seen_at,
  }));
}

export function getBoothStats(boothId: string): BoothStats {
  const counts = db
    .prepare(
      `SELECT
         COUNT(*) as total_voters,
         SUM(CASE WHEN status = 'VOTED' THEN 1 ELSE 0 END) as voted_count,
         SUM(CASE WHEN status = 'DEAD' THEN 1 ELSE 0 END) as dead_count,
         SUM(CASE WHEN status = 'NOT_VOTED' THEN 1 ELSE 0 END) as remaining_count,
         MAX(voted_at) as last_vote_at
       FROM voters WHERE booth_id = ?`
    )
    .get(boothId) as {
    total_voters: number;
    voted_count: number | null;
    dead_count: number | null;
    remaining_count: number | null;
    last_vote_at: string | null;
  };

  const auditCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN action IN ('DUPLICATE_BLOCKED', 'DEAD_VOTER_BLOCKED') THEN 1 ELSE 0 END) as duplicate_attempts_blocked,
         SUM(CASE WHEN action = 'REVERT_VOTE' THEN 1 ELSE 0 END) as reverted_count
       FROM audit_logs WHERE booth_id = ?`
    )
    .get(boothId) as {
    duplicate_attempts_blocked: number | null;
    reverted_count: number | null;
  };

  const total = counts.total_voters ?? 0;
  const voted = counts.voted_count ?? 0;
  const dead = counts.dead_count ?? 0;
  const remaining = counts.remaining_count ?? Math.max(0, total - voted - dead);
  const pct = total > 0 ? Number(((voted / total) * 100).toFixed(2)) : 0;

  return {
    total_voters: total,
    voted_count: voted,
    dead_count: dead,
    remaining_count: remaining,
    completion_percentage: pct,
    duplicate_attempts_blocked: auditCounts.duplicate_attempts_blocked ?? 0,
    reverted_count: auditCounts.reverted_count ?? 0,
    last_vote_at: counts.last_vote_at ?? null,
  };
}

export function getVoters(boothId: string): VoterRecord[] {
  return db
    .prepare(
      `SELECT id, booth_id, serial_no, voter_id, full_name, guardian_name, age, gender, address, part_no,
              status, voted_at, verified_by_officer_id, verified_by_officer_name,
              marked_dead_at, marked_dead_by_officer_id, marked_dead_by_officer_name,
              marked_dead_by_officer_role, dead_note
       FROM voters WHERE booth_id = ? ORDER BY serial_no ASC`
    )
    .all(boothId) as unknown as VoterRecord[];
}

export function getAuditLogs(boothId: string, limit = 100): AuditEntry[] {
  return db
    .prepare(
      `SELECT id, booth_id, action, voter_id, serial_no, voter_name, officer_id, officer_name, details, created_at
       FROM audit_logs WHERE booth_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(boothId, limit) as unknown as AuditEntry[];
}

export function insertAuditLog(
  boothId: string,
  action: AuditAction,
  voterId: string | null,
  serialNo: number | null,
  voterName: string | null,
  officerId: string | null,
  officerName: string | null,
  details: string
): AuditEntry {
  const createdAt = nowIso();
  const result = db
    .prepare(
      `INSERT INTO audit_logs (booth_id, action, voter_id, serial_no, voter_name, officer_id, officer_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(boothId, action, voterId, serialNo, voterName, officerId, officerName, details, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    booth_id: boothId,
    action,
    voter_id: voterId,
    serial_no: serialNo,
    voter_name: voterName,
    officer_id: officerId,
    officer_name: officerName,
    details,
    created_at: createdAt,
  };
}

export function getBoothState(
  boothId: string,
  onlineOfficerIds: Set<string> = new Set()
): BoothStatePayload | null {
  const booth = getBoothSummary(boothId);
  if (!booth) return null;
  return {
    booth,
    officers: getOfficersPresence(boothId, onlineOfficerIds),
    voters: getVoters(boothId),
    stats: getBoothStats(boothId),
    audit_logs: getAuditLogs(boothId, 120),
  };
}

export function markVoterAsVoted(
  boothId: string,
  voterRecordId: number,
  officer: { id: string; full_name: string }
):
  | { ok: true; voter: VoterRecord; stats: BoothStats; auditEntry: AuditEntry }
  | {
      ok: false;
      code: 'LOCKED' | 'NOT_FOUND' | 'ALREADY_VOTED' | 'MARKED_DEAD';
      voter?: VoterRecord;
      auditEntry?: AuditEntry;
      stats?: BoothStats;
    } {
  const booth = getBoothSummary(boothId);
  if (!booth) return { ok: false, code: 'NOT_FOUND' };
  if (booth.is_locked) return { ok: false, code: 'LOCKED' };

  const existing = db
    .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
    .get(boothId, voterRecordId) as unknown as VoterRecord | undefined;

  if (!existing) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  const votedAt = nowIso();
  const res = db
    .prepare(
      `UPDATE voters
       SET status = 'VOTED', voted_at = ?, verified_by_officer_id = ?, verified_by_officer_name = ?
       WHERE booth_id = ? AND id = ? AND status = 'NOT_VOTED'`
    )
    .run(votedAt, officer.id, officer.full_name, boothId, voterRecordId);

  if (res.changes === 0) {
    const current = db
      .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
      .get(boothId, voterRecordId) as unknown as VoterRecord;

    if (current.status === 'DEAD') {
      const auditEntry = insertAuditLog(
        boothId,
        'DEAD_VOTER_BLOCKED',
        current.voter_id,
        current.serial_no,
        current.full_name,
        officer.id,
        officer.full_name,
        `Blocked vote attempt on voter marked DEAD by ${current.marked_dead_by_officer_name ?? 'an officer'}${current.marked_dead_by_officer_role ? ` (${current.marked_dead_by_officer_role})` : ''} at ${current.marked_dead_at ?? 'earlier'}.`
      );

      return {
        ok: false,
        code: 'MARKED_DEAD',
        voter: current,
        auditEntry,
        stats: getBoothStats(boothId),
      };
    }

    // Fraud protection: voter was already marked voted!
    const auditEntry = insertAuditLog(
      boothId,
      'DUPLICATE_BLOCKED',
      current.voter_id,
      current.serial_no,
      current.full_name,
      officer.id,
      officer.full_name,
      `Blocked duplicate vote attempt. Already verified by ${current.verified_by_officer_name ?? 'another officer'} at ${current.voted_at ?? 'earlier'}.`
    );

    return {
      ok: false,
      code: 'ALREADY_VOTED',
      voter: current,
      auditEntry,
      stats: getBoothStats(boothId),
    };
  }

  const updated = db
    .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
    .get(boothId, voterRecordId) as unknown as VoterRecord;

  const auditEntry = insertAuditLog(
    boothId,
    'MARK_VOTED',
    updated.voter_id,
    updated.serial_no,
    updated.full_name,
    officer.id,
    officer.full_name,
    `Marked Serial #${updated.serial_no} (${updated.voter_id}) as VOTED`
  );

  return {
    ok: true,
    voter: updated,
    stats: getBoothStats(boothId),
    auditEntry,
  };
}

export function markVoterAsDead(
  boothId: string,
  voterRecordId: number,
  note: string,
  officer: { id: string; full_name: string; role: OfficerRole }
):
  | { ok: true; voter: VoterRecord; stats: BoothStats; auditEntry: AuditEntry }
  | {
      ok: false;
      code: 'LOCKED' | 'NOT_FOUND' | 'ALREADY_VOTED' | 'ALREADY_DEAD';
      voter?: VoterRecord;
    } {
  const booth = getBoothSummary(boothId);
  if (!booth) return { ok: false, code: 'NOT_FOUND' };
  if (booth.is_locked) return { ok: false, code: 'LOCKED' };

  const existing = db
    .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
    .get(boothId, voterRecordId) as unknown as VoterRecord | undefined;

  if (!existing) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  const cleanNote = note.trim();
  const markedAt = nowIso();
  const res = db
    .prepare(
      `UPDATE voters
       SET status = 'DEAD',
           marked_dead_at = ?,
           marked_dead_by_officer_id = ?,
           marked_dead_by_officer_name = ?,
           marked_dead_by_officer_role = ?,
           dead_note = ?
       WHERE booth_id = ? AND id = ? AND status = 'NOT_VOTED'`
    )
    .run(
      markedAt,
      officer.id,
      officer.full_name,
      officer.role,
      cleanNote || null,
      boothId,
      voterRecordId
    );

  if (res.changes === 0) {
    const current = db
      .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
      .get(boothId, voterRecordId) as unknown as VoterRecord;

    return {
      ok: false,
      code: current.status === 'DEAD' ? 'ALREADY_DEAD' : 'ALREADY_VOTED',
      voter: current,
    };
  }

  const updated = db
    .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
    .get(boothId, voterRecordId) as unknown as VoterRecord;

  const auditEntry = insertAuditLog(
    boothId,
    'MARK_DEAD',
    updated.voter_id,
    updated.serial_no,
    updated.full_name,
    officer.id,
    officer.full_name,
    `Marked Serial #${updated.serial_no} (${updated.voter_id}) as DEAD by ${officer.full_name} (${officer.role})${cleanNote ? `. Note: ${cleanNote}` : ''}`
  );

  return {
    ok: true,
    voter: updated,
    stats: getBoothStats(boothId),
    auditEntry,
  };
}

export function revertVoterStatus(
  boothId: string,
  voterRecordId: number,
  reason: string,
  officer: { id: string; full_name: string; role: OfficerRole }
): { voter: VoterRecord; stats: BoothStats; auditEntry: AuditEntry } {
  const booth = getBoothSummary(boothId);
  if (!booth) {
    throw new Error('Booth not found.');
  }
  if (booth.is_locked) {
    throw new Error('Poll is closed for the day. Reopen poll to make corrections.');
  }
  if (officer.role !== 'Presiding Officer') {
    throw new Error('Only a Presiding Officer can revert a recorded voter status.');
  }
  const cleanReason = reason.trim();
  if (cleanReason.length < 4) {
    throw new Error('A clear correction reason (at least 4 characters) is required for the audit trail.');
  }

  const existing = db
    .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
    .get(boothId, voterRecordId) as unknown as VoterRecord | undefined;

  if (!existing) {
    throw new Error('Voter record not found.');
  }
  if (existing.status === 'NOT_VOTED') {
    throw new Error('Voter is already marked as Not Voted.');
  }

  const previousStatusLabel = existing.status === 'DEAD' ? 'DEAD' : 'VOTED';

  db.prepare(
    `UPDATE voters
     SET status = 'NOT_VOTED',
         voted_at = NULL,
         verified_by_officer_id = NULL,
         verified_by_officer_name = NULL,
         marked_dead_at = NULL,
         marked_dead_by_officer_id = NULL,
         marked_dead_by_officer_name = NULL,
         marked_dead_by_officer_role = NULL,
         dead_note = NULL
     WHERE booth_id = ? AND id = ?`
  ).run(boothId, voterRecordId);

  const updated = db
    .prepare(`SELECT * FROM voters WHERE booth_id = ? AND id = ?`)
    .get(boothId, voterRecordId) as unknown as VoterRecord;

  const auditEntry = insertAuditLog(
    boothId,
    'REVERT_VOTE',
    updated.voter_id,
    updated.serial_no,
    updated.full_name,
    officer.id,
    officer.full_name,
    `Reverted Serial #${updated.serial_no} (${updated.voter_id}) from ${previousStatusLabel} to NOT VOTED. Reason: ${cleanReason}`
  );

  return {
    voter: updated,
    stats: getBoothStats(boothId),
    auditEntry,
  };
}

export function replaceElectoralRoll(
  boothId: string,
  rows: Array<{
    serial_no: number;
    voter_id: string;
    full_name: string;
    guardian_name: string;
    age: number | null;
    gender: string;
    address: string;
    part_no: string;
    initial_voted?: boolean;
  }>,
  fileName: string,
  officer: { id: string; full_name: string }
): { voters: VoterRecord[]; stats: BoothStats; auditEntry: AuditEntry } {
  const booth = getBoothSummary(boothId);
  if (!booth) throw new Error('Booth not found.');
  if (booth.is_locked) throw new Error('Cannot replace voter roll while poll is closed.');
  if (rows.length === 0) throw new Error('No valid voter rows found in uploaded spreadsheet.');

  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM voters WHERE booth_id = ?`).run(boothId);

    const insertVoter = db.prepare(
      `INSERT INTO voters (
        booth_id, serial_no, voter_id, full_name, guardian_name, age, gender, address, part_no,
        status, voted_at, verified_by_officer_id, verified_by_officer_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const ts = nowIso();
    for (const r of rows) {
      const voted = Boolean(r.initial_voted);
      insertVoter.run(
        boothId,
        r.serial_no,
        r.voter_id,
        r.full_name,
        r.guardian_name,
        r.age,
        r.gender,
        r.address,
        r.part_no,
        voted ? 'VOTED' : 'NOT_VOTED',
        voted ? ts : null,
        voted ? officer.id : null,
        voted ? officer.full_name : null
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const auditEntry = insertAuditLog(
    boothId,
    'ROLL_UPLOADED',
    null,
    null,
    null,
    officer.id,
    officer.full_name,
    `Imported ${rows.length} voters from ${fileName}`
  );

  return {
    voters: getVoters(boothId),
    stats: getBoothStats(boothId),
    auditEntry,
  };
}

export function setBoothLock(
  boothId: string,
  locked: boolean,
  officer: { id: string; full_name: string; role: OfficerRole }
): { booth: BoothSummary; auditEntry: AuditEntry } {
  if (officer.role !== 'Presiding Officer') {
    throw new Error('Only a Presiding Officer can close or reopen the booth poll.');
  }
  const closedAt = locked ? nowIso() : null;
  db.prepare(`UPDATE booths SET is_locked = ?, closed_at = ? WHERE id = ?`).run(
    locked ? 1 : 0,
    closedAt,
    boothId
  );

  const auditEntry = insertAuditLog(
    boothId,
    locked ? 'POLL_CLOSED' : 'POLL_REOPENED',
    null,
    null,
    null,
    officer.id,
    officer.full_name,
    locked
      ? 'Presiding Officer closed the booth poll and locked vote marking for End-of-Day certification.'
      : 'Presiding Officer reopened the booth poll.'
  );

  const booth = getBoothSummary(boothId)!;
  return { booth, auditEntry };
}

export function generateEndOfDayReport(boothId: string): EndOfDayReport {
  const booth = getBoothSummary(boothId);
  if (!booth) {
    throw new Error('Booth not found.');
  }

  const voters = getVoters(boothId);
  const stats = getBoothStats(boothId);
  const auditLogs = getAuditLogs(boothId, 250);

  // Gender breakdown
  const genderMap = new Map<string, { total: number; voted: number }>();
  for (const v of voters) {
    const g = v.gender?.trim() || 'Other';
    const curr = genderMap.get(g) ?? { total: 0, voted: 0 };
    curr.total += 1;
    if (v.status === 'VOTED') curr.voted += 1;
    genderMap.set(g, curr);
  }
  const gender_breakdown = Array.from(genderMap.entries()).map(([gender, d]) => ({
    gender,
    total: d.total,
    voted: d.voted,
    remaining: d.total - d.voted,
    percentage: d.total > 0 ? Number(((d.voted / d.total) * 100).toFixed(1)) : 0,
  }));

  // Age bracket breakdown
  const ageBuckets: Array<{ label: string; min: number; max: number }> = [
    { label: '18–25', min: 18, max: 25 },
    { label: '26–40', min: 26, max: 40 },
    { label: '41–60', min: 41, max: 60 },
    { label: '61+', min: 61, max: 150 },
  ];
  const age_breakdown = ageBuckets.map((b) => {
    const matching = voters.filter((v) => v.age !== null && v.age >= b.min && v.age <= b.max);
    const voted = matching.filter((v) => v.status === 'VOTED').length;
    return {
      bracket: b.label,
      total: matching.length,
      voted,
      percentage: matching.length > 0 ? Number(((voted / matching.length) * 100).toFixed(1)) : 0,
    };
  });

  // Hourly turnout velocity
  const hourMap = new Map<string, number>();
  for (const v of voters) {
    if (v.status === 'VOTED' && v.voted_at) {
      const dt = new Date(v.voted_at);
      const hr = `${String(dt.getHours()).padStart(2, '0')}:00`;
      hourMap.set(hr, (hourMap.get(hr) ?? 0) + 1);
    }
  }
  const sortedHours = Array.from(hourMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let cumulative = 0;
  const hourly_turnout = sortedHours.map(([hour, count]) => {
    cumulative += count;
    return { hour, count, cumulative };
  });

  // Officer activity summary
  const officers = getOfficersPresence(boothId);
  const officer_activity = officers.map((o) => {
    const votes_verified = voters.filter(
      (v) => v.status === 'VOTED' && v.verified_by_officer_id === o.id
    ).length;
    const dead_marked = voters.filter(
      (v) => v.status === 'DEAD' && v.marked_dead_by_officer_id === o.id
    ).length;
    const duplicates_blocked = auditLogs.filter(
      (a) =>
        (a.action === 'DUPLICATE_BLOCKED' || a.action === 'DEAD_VOTER_BLOCKED') &&
        a.officer_id === o.id
    ).length;
    return {
      officer_id: o.id,
      officer_name: o.full_name,
      role: o.role,
      votes_verified,
      dead_marked,
      duplicates_blocked,
    };
  });

  const dead_voters = voters.filter((v) => v.status === 'DEAD');

  return {
    generated_at: nowIso(),
    booth,
    stats,
    gender_breakdown,
    age_breakdown,
    hourly_turnout,
    officer_activity,
    dead_voters,
    audit_logs: auditLogs,
  };
}

// --- Ward Admin Authentication & Real-Time Aggregation ---

export function loginAdmin(
  username: string,
  passcode: string
): { kind: 'admin'; token: string; admin: AdminUser } {
  const row = db
    .prepare(
      `SELECT id, username, full_name, title, passcode
       FROM admins WHERE lower(username) = lower(?)`
    )
    .get(username.trim()) as
    | {
        id: string;
        username: string;
        full_name: string;
        title: string;
        passcode: string;
      }
    | undefined;

  if (!row || row.passcode !== hashPasscode(passcode)) {
    throw new Error('Invalid admin username or passcode.');
  }

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`UPDATE admins SET active_session_token = ?, last_seen_at = ? WHERE id = ?`).run(
    token,
    nowIso(),
    row.id
  );

  return {
    kind: 'admin',
    token,
    admin: {
      id: row.id,
      username: row.username,
      full_name: row.full_name,
      title: row.title,
    },
  };
}

export function getAdminByToken(token: string): AdminUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT id, username, full_name, title
       FROM admins WHERE active_session_token = ?`
    )
    .get(token) as AdminUser | undefined;

  if (!row) return null;
  db.prepare(`UPDATE admins SET last_seen_at = ? WHERE id = ?`).run(nowIso(), row.id);
  return row;
}

export function logoutAdmin(token: string): boolean {
  const admin = getAdminByToken(token);
  if (!admin) return false;
  db.prepare(`UPDATE admins SET active_session_token = NULL WHERE id = ?`).run(admin.id);
  return true;
}

export function getAdminDashboardState(
  onlineOfficerIdsByBooth: Map<string, Set<string>> = new Map()
): AdminDashboardState {
  const allBooths = listBooths();
  const boothItems: AdminBoothItem[] = [];
  const wardMap = new Map<string, WardSummaryItem>();

  let overallTotalVoters = 0;
  let overallVotedCount = 0;
  let overallDeadCount = 0;
  let overallRemainingCount = 0;
  let overallDuplicates = 0;
  let overallOpenBooths = 0;
  let overallClosedBooths = 0;
  let overallOnlineIncharges = 0;
  let overallTotalIncharges = 0;

  for (const booth of allBooths) {
    const stats = getBoothStats(booth.id);
    const onlineSet = onlineOfficerIdsByBooth.get(booth.id) ?? new Set<string>();
    const officers = getOfficersPresence(booth.id, onlineSet);

    const voteCountsRows = db
      .prepare(
        `SELECT verified_by_officer_id as officer_id, COUNT(*) as cnt
         FROM voters
         WHERE booth_id = ? AND status = 'VOTED' AND verified_by_officer_id IS NOT NULL
         GROUP BY verified_by_officer_id`
      )
      .all(booth.id) as Array<{ officer_id: string; cnt: number }>;
    const votesByOfficer = new Map(voteCountsRows.map((r) => [r.officer_id, r.cnt]));

    const deadCountsRows = db
      .prepare(
        `SELECT marked_dead_by_officer_id as officer_id, COUNT(*) as cnt
         FROM voters
         WHERE booth_id = ? AND status = 'DEAD' AND marked_dead_by_officer_id IS NOT NULL
         GROUP BY marked_dead_by_officer_id`
      )
      .all(booth.id) as Array<{ officer_id: string; cnt: number }>;
    const deadByOfficer = new Map(deadCountsRows.map((r) => [r.officer_id, r.cnt]));

    const dupRows = db
      .prepare(
        `SELECT officer_id, COUNT(*) as cnt
         FROM audit_logs
         WHERE booth_id = ? AND action IN ('DUPLICATE_BLOCKED', 'DEAD_VOTER_BLOCKED') AND officer_id IS NOT NULL
         GROUP BY officer_id`
      )
      .all(booth.id) as Array<{ officer_id: string; cnt: number }>;
    const dupsByOfficer = new Map(dupRows.map((r) => [r.officer_id, r.cnt]));

    const incharges: BoothInchargeStat[] = officers.map((o) => ({
      ...o,
      votes_verified: votesByOfficer.get(o.id) ?? 0,
      dead_marked: deadByOfficer.get(o.id) ?? 0,
      duplicates_blocked: dupsByOfficer.get(o.id) ?? 0,
    }));

    boothItems.push({ booth, stats, incharges });

    overallTotalVoters += stats.total_voters;
    overallVotedCount += stats.voted_count;
    overallDeadCount += stats.dead_count;
    overallRemainingCount += stats.remaining_count;
    overallDuplicates += stats.duplicate_attempts_blocked;
    if (booth.is_locked) {
      overallClosedBooths += 1;
    } else {
      overallOpenBooths += 1;
    }
    overallTotalIncharges += incharges.length;
    overallOnlineIncharges += incharges.filter((i) => i.is_online || i.is_logged_in).length;

    const wardKey = booth.constituency || 'General Ward';
    const existingWard = wardMap.get(wardKey) ?? {
      constituency: wardKey,
      booth_count: 0,
      open_booths: 0,
      closed_booths: 0,
      total_voters: 0,
      voted_count: 0,
      dead_count: 0,
      remaining_count: 0,
      completion_percentage: 0,
      duplicate_attempts_blocked: 0,
    };

    existingWard.booth_count += 1;
    if (booth.is_locked) existingWard.closed_booths += 1;
    else existingWard.open_booths += 1;
    existingWard.total_voters += stats.total_voters;
    existingWard.voted_count += stats.voted_count;
    existingWard.dead_count += stats.dead_count;
    existingWard.remaining_count += stats.remaining_count;
    existingWard.duplicate_attempts_blocked += stats.duplicate_attempts_blocked;
    existingWard.completion_percentage =
      existingWard.total_voters > 0
        ? Number(((existingWard.voted_count / existingWard.total_voters) * 100).toFixed(2))
        : 0;
    wardMap.set(wardKey, existingWard);
  }

  const recentAuditRows = db
    .prepare(
      `SELECT a.*, b.name as booth_name
       FROM audit_logs a
       JOIN booths b ON b.id = a.booth_id
       ORDER BY a.id DESC
       LIMIT 60`
    )
    .all() as unknown as Array<AuditEntry & { booth_name: string }>;

  const overallPct =
    overallTotalVoters > 0
      ? Number(((overallVotedCount / overallTotalVoters) * 100).toFixed(2))
      : 0;

  return {
    generated_at: nowIso(),
    overall: {
      total_booths: allBooths.length,
      open_booths: overallOpenBooths,
      closed_booths: overallClosedBooths,
      total_voters: overallTotalVoters,
      voted_count: overallVotedCount,
      dead_count: overallDeadCount,
      remaining_count: overallRemainingCount,
      completion_percentage: overallPct,
      duplicate_attempts_blocked: overallDuplicates,
      online_incharges: overallOnlineIncharges,
      total_incharges: overallTotalIncharges,
    },
    wards: Array.from(wardMap.values()),
    booths: boothItems,
    recent_audit_logs: recentAuditRows,
  };
}
