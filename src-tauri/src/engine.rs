// src-tauri/src/engine.rs
// DifficultyEngine orchestrator

use crate::persistence::{Persistence, Run};
use crate::difficulty::{PidConfig, RunMetrics, update_difficulty, create_snapshot};
use crate::generator::RunGenerator;

#[derive(serde::Serialize, Clone)]
pub struct PatternForFrontend {
    pub id: String,
    pub domain: String,
    pub difficulty: f32,
    pub content: String,
}

pub struct DifficultyEngine {
    pub persistence: Persistence,
}

impl DifficultyEngine {
    pub fn new(db_path: &str) -> Self {
        let persistence = Persistence::new(db_path).expect("Failed to open DB");
        Self { persistence }
    }

    pub fn generate_run_patterns(&self, domain: &str, count: usize) -> Result<Vec<PatternForFrontend>, String> {
        let (pid_state, _) = self.persistence.load_pid_state(domain)
            .map_err(|e| e.to_string())?;

        let target_diff = pid_state.current_diff;

        // Try with tolerance first, fallback to all domain patterns
        let mut candidates = self.persistence.fetch_pattern_candidates(domain, target_diff, 0.18, 40)
            .map_err(|e| e.to_string())?;

        if candidates.is_empty() {
            candidates = self.persistence.fetch_all_domain_patterns(domain, 40)
                .map_err(|e| e.to_string())?;
        }

        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap()
            .as_secs();

        Ok(RunGenerator::generate_act(&candidates, target_diff, count, seed))
    }

    pub fn finish_run(
        &self, pattern_id: &str, domain: &str,
        wpm: f32, accuracy: f32,
        character_timestamps: Option<Vec<u32>>,
    ) -> Result<f32, String> {
        let was_completed = accuracy >= 0.75;
        let run_id = uuid::Uuid::new_v4().to_string();

        let run = Run {
            id: run_id.clone(),
            pattern_id: pattern_id.to_string(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
            wpm, accuracy, was_completed,
        };

        self.persistence.record_run(&run).map_err(|e| e.to_string())?;
        self.persistence.update_pattern_stats(pattern_id, was_completed)
            .map_err(|e| e.to_string())?;

        // Save replay for Ghost
        if let Some(ts) = character_timestamps {
            let _ = self.persistence.save_replay_log(&run_id, pattern_id, &ts, wpm, accuracy);
        }

        // Save failure vector if not completed
        if !was_completed {
            let _ = self.persistence.save_failure_vector(pattern_id, domain, None, None);
        }

        // Update PID
        let (mut pid_state, agg) = self.persistence.load_pid_state(domain)
            .map_err(|e| e.to_string())?;

        let cfg = PidConfig {
            aggressiveness: agg.multiplier(),
            ..PidConfig::default()
        };

        let metrics = RunMetrics {
            wpm, error_rate: 1.0 - accuracy,
            pattern_difficulty: pid_state.current_diff,
            completed: was_completed,
        };

        let new_diff = update_difficulty(&cfg, &mut pid_state, &metrics);

        // Save PID snapshot for LangSmith tracing
        let snapshot = create_snapshot(domain, &pid_state, &metrics, new_diff);
        let _ = self.persistence.save_pid_snapshot(&snapshot);

        self.persistence.save_pid_state(domain, &pid_state, agg)
            .map_err(|e| e.to_string())?;

        Ok(new_diff)
    }
}
