// src-tauri/src/persistence.rs

use rusqlite::{params, Connection, Result, OptionalExtension};
use crate::difficulty::PidState;

pub struct Persistence {
    conn: Connection,
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct Pattern {
    pub id: String,
    pub domain: String,
    pub difficulty: f32,
    pub content: String,
    pub source: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct Run {
    pub id: String,
    pub pattern_id: String,
    pub timestamp: u64,
    pub wpm: f32,
    pub accuracy: f32,
    pub was_completed: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ReplayLog {
    pub timestamps: Vec<u32>,
    pub wpm: f32,
    pub accuracy: f32,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub enum Aggressiveness {
    Low,
    Medium,
    Fast,
}

impl Aggressiveness {
    pub fn multiplier(&self) -> f32 {
        match self {
            Self::Low => 0.7,
            Self::Medium => 1.0,
            Self::Fast => 1.6,
        }
    }
}

impl Persistence {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 5000;
        ")?;
        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    pub fn run_migrations(&self) -> Result<()> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS patterns (
                id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                difficulty REAL NOT NULL CHECK (difficulty >= 0.0 AND difficulty <= 1.0),
                content TEXT NOT NULL,
                source TEXT,
                last_used_at INTEGER,
                success_rate REAL DEFAULT 0.5,
                attempt_count INTEGER DEFAULT 0,
                chroma_id TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_patterns_domain_diff
                ON patterns (domain, difficulty);

            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                pattern_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                wpm REAL NOT NULL,
                accuracy REAL NOT NULL,
                was_completed BOOLEAN NOT NULL DEFAULT 1,
                FOREIGN KEY (pattern_id) REFERENCES patterns(id)
            );
            CREATE INDEX IF NOT EXISTS idx_runs_pattern_ts
                ON runs (pattern_id, timestamp DESC);

            CREATE TABLE IF NOT EXISTS pid_states (
                domain TEXT PRIMARY KEY,
                p_gain REAL NOT NULL DEFAULT 0.15,
                i_gain REAL NOT NULL DEFAULT 0.02,
                d_gain REAL NOT NULL DEFAULT 0.08,
                integral_term REAL NOT NULL DEFAULT 0.0,
                last_error REAL NOT NULL DEFAULT 0.0,
                current_difficulty REAL NOT NULL DEFAULT 0.25,
                runs_count INTEGER NOT NULL DEFAULT 0,
                aggressiveness TEXT NOT NULL DEFAULT 'Medium'
            );

            CREATE TABLE IF NOT EXISTS replay_logs (
                run_id TEXT PRIMARY KEY,
                pattern_id TEXT NOT NULL,
                character_timestamps TEXT NOT NULL,
                wpm REAL NOT NULL,
                accuracy REAL NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (run_id) REFERENCES runs(id)
            );
            CREATE INDEX IF NOT EXISTS idx_replay_pattern
                ON replay_logs (pattern_id, wpm DESC);

            CREATE TABLE IF NOT EXISTS failure_vectors (
                id TEXT PRIMARY KEY,
                pattern_id TEXT NOT NULL,
                domain TEXT NOT NULL,
                death_token_idx INTEGER,
                embedding_json TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (pattern_id) REFERENCES patterns(id)
            );
            CREATE INDEX IF NOT EXISTS idx_failure_domain
                ON failure_vectors (domain, created_at DESC);

            CREATE TABLE IF NOT EXISTS user_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pid_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                domain TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                current_diff REAL NOT NULL,
                integral_term REAL NOT NULL,
                last_error REAL NOT NULL,
                runs_count INTEGER NOT NULL,
                wpm REAL NOT NULL,
                error_rate REAL NOT NULL,
                new_diff REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_domain_ts
                ON pid_snapshots (domain, timestamp DESC);

            INSERT OR IGNORE INTO pid_states (domain, current_difficulty)
                VALUES ('default', 0.25);
        ")?;
        Ok(())
    }

    // ── Pattern Queries ──

    pub fn fetch_pattern_candidates(
        &self,
        domain: &str,
        target_diff: f32,
        tolerance: f32,
        limit: usize,
    ) -> Result<Vec<Pattern>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, domain, difficulty, content, source
             FROM patterns
             WHERE domain = ?1
               AND difficulty BETWEEN ?2 AND ?3
             ORDER BY
               attempt_count ASC,
               ABS(difficulty - ?4) ASC
             LIMIT ?5"
        )?;
        let rows = stmt.query_map(
            params![domain, target_diff - tolerance, target_diff + tolerance, target_diff, limit as u32],
            |row| Ok(Pattern {
                id: row.get(0)?,
                domain: row.get(1)?,
                difficulty: row.get(2)?,
                content: row.get(3)?,
                source: row.get(4)?,
            }),
        )?;
        rows.collect()
    }

    pub fn fetch_all_domain_patterns(
        &self,
        domain: &str,
        limit: usize,
    ) -> Result<Vec<Pattern>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, domain, difficulty, content, source
             FROM patterns
             WHERE domain = ?1
             ORDER BY attempt_count ASC, difficulty ASC
             LIMIT ?2"
        )?;
        let rows = stmt.query_map(
            params![domain, limit as u32],
            |row| Ok(Pattern {
                id: row.get(0)?,
                domain: row.get(1)?,
                difficulty: row.get(2)?,
                content: row.get(3)?,
                source: row.get(4)?,
            }),
        )?;
        rows.collect()
    }

    pub fn update_pattern_stats(&self, pattern_id: &str, was_completed: bool) -> Result<()> {
        self.conn.execute(
            "UPDATE patterns SET
                attempt_count = attempt_count + 1,
                last_used_at = strftime('%s', 'now'),
                success_rate = CASE
                    WHEN attempt_count = 0 THEN ?2
                    ELSE (success_rate * attempt_count + ?2) / (attempt_count + 1.0)
                END
             WHERE id = ?1",
            params![pattern_id, if was_completed { 1.0f32 } else { 0.0f32 }],
        )?;
        Ok(())
    }

    // ── Run History ──

    pub fn record_run(&self, run: &Run) -> Result<()> {
        self.conn.execute(
            "INSERT INTO runs (id, pattern_id, timestamp, wpm, accuracy, was_completed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![run.id, run.pattern_id, run.timestamp, run.wpm, run.accuracy, run.was_completed],
        )?;
        Ok(())
    }

    // ── PID State ──

    pub fn load_pid_state(&self, domain: &str) -> Result<(PidState, Aggressiveness)> {
        let row = self.conn.query_row(
            "SELECT current_difficulty, integral_term, last_error, runs_count, aggressiveness
             FROM pid_states WHERE domain = ?1",
            params![domain],
            |row| {
                let agg_str: String = row.get(4)?;
                let agg = match agg_str.as_str() {
                    "Low" => Aggressiveness::Low,
                    "Fast" => Aggressiveness::Fast,
                    _ => Aggressiveness::Medium,
                };
                Ok((PidState {
                    current_diff: row.get(0)?,
                    integral_term: row.get(1)?,
                    last_error: row.get(2)?,
                    runs_count: row.get(3)?,
                }, agg))
            },
        )?;
        Ok(row)
    }

    pub fn save_pid_state(&self, domain: &str, state: &PidState, agg: Aggressiveness) -> Result<()> {
        let agg_str = match agg {
            Aggressiveness::Low => "Low",
            Aggressiveness::Medium => "Medium",
            Aggressiveness::Fast => "Fast",
        };
        self.conn.execute(
            "INSERT OR REPLACE INTO pid_states
                (domain, current_difficulty, integral_term, last_error, runs_count, aggressiveness)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![domain, state.current_diff, state.integral_term, state.last_error, state.runs_count, agg_str],
        )?;
        Ok(())
    }

    // ── Ghost Replay ──

    pub fn save_replay_log(
        &self, run_id: &str, pattern_id: &str,
        timestamps: &[u32], wpm: f32, accuracy: f32,
    ) -> Result<()> {
        let json = serde_json::to_string(timestamps).unwrap_or_default();
        self.conn.execute(
            "INSERT INTO replay_logs (run_id, pattern_id, character_timestamps, wpm, accuracy, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s', 'now'))",
            params![run_id, pattern_id, json, wpm, accuracy],
        )?;
        Ok(())
    }

    pub fn get_personal_best(&self, pattern_id: &str) -> Result<Option<ReplayLog>> {
        self.conn.query_row(
            "SELECT character_timestamps, wpm, accuracy
             FROM replay_logs WHERE pattern_id = ?1
             ORDER BY wpm DESC LIMIT 1",
            params![pattern_id],
            |row| {
                let json: String = row.get(0)?;
                let ts: Vec<u32> = serde_json::from_str(&json).unwrap_or_default();
                Ok(ReplayLog { timestamps: ts, wpm: row.get(1)?, accuracy: row.get(2)? })
            },
        ).optional()
    }

    // ── PID Snapshots (for LangSmith tracing) ──

    pub fn save_pid_snapshot(
        &self,
        snapshot: &crate::difficulty::PidSnapshot,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO pid_snapshots (domain, timestamp, current_diff, integral_term, last_error, runs_count, wpm, error_rate, new_diff)
             VALUES (?1, strftime('%s', 'now'), ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                snapshot.domain, snapshot.current_diff, snapshot.integral_term,
                snapshot.last_error, snapshot.runs_count, snapshot.wpm,
                snapshot.error_rate, snapshot.new_diff
            ],
        )?;
        Ok(())
    }

    pub fn get_pid_convergence_data(&self, domain: &str, limit: usize) -> Result<Vec<(f32, f32, f32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT current_diff, wpm, error_rate FROM pid_snapshots
             WHERE domain = ?1 ORDER BY timestamp DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![domain, limit as u32], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        rows.collect()
    }

    // ── Failure Vectors ──

    pub fn save_failure_vector(
        &self, pattern_id: &str, domain: &str,
        death_token_idx: Option<i32>, embedding_json: Option<&str>,
    ) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO failure_vectors (id, pattern_id, domain, death_token_idx, embedding_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s', 'now'))",
            params![id, pattern_id, domain, death_token_idx, embedding_json],
        )?;
        Ok(())
    }

    pub fn get_failure_domains(&self) -> Result<Vec<(String, u32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT domain, COUNT(*) as cnt FROM failure_vectors
             GROUP BY domain ORDER BY cnt DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;
        rows.collect()
    }

    // ── Stats ──

    pub fn get_user_stats(&self) -> Result<(u32, f32, f32, f32)> {
        self.conn.query_row(
            "SELECT COUNT(*), COALESCE(AVG(wpm),0), COALESCE(AVG(accuracy),0), COALESCE(MAX(wpm),0)
             FROM runs",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
    }

    pub fn get_domain_stats(&self) -> Result<Vec<(String, u32, f32, f32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.domain, COUNT(r.id), AVG(r.wpm), AVG(r.accuracy)
             FROM runs r JOIN patterns p ON r.pattern_id = p.id
             GROUP BY p.domain ORDER BY COUNT(r.id) DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        rows.collect()
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        self.conn.query_row(
            "SELECT value FROM user_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).optional()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO user_settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }
}
