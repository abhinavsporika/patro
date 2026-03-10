// src-tauri/src/difficulty.rs
// Pure math engine. No database dependencies. Easy to unit test.

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PidState {
    pub current_diff: f32,
    pub integral_term: f32,
    pub last_error: f32,
    pub runs_count: u32,
}

impl PidState {
    pub fn new(initial_difficulty: f32) -> Self {
        Self {
            current_diff: initial_difficulty,
            integral_term: 0.0,
            last_error: 0.0,
            runs_count: 0,
        }
    }
}

#[allow(dead_code)]
pub struct RunMetrics {
    pub wpm: f32,
    pub error_rate: f32,
    pub pattern_difficulty: f32,
    pub completed: bool,
}

pub struct PidConfig {
    pub base_kp: f32,
    pub base_ki: f32,
    pub base_kd: f32,
    pub aggressiveness: f32,
    pub target_wpm: f32,
    pub target_error_rate: f32,
    pub min_diff: f32,
    pub max_diff: f32,
}

impl Default for PidConfig {
    fn default() -> Self {
        Self {
            base_kp: 0.15,
            base_ki: 0.02,
            base_kd: 0.08,
            aggressiveness: 1.0,
            target_wpm: 65.0,
            target_error_rate: 0.05,
            min_diff: 0.05,
            max_diff: 0.95,
        }
    }
}

/// Core PID update. Returns the new difficulty score.
/// Exports a JSON-serializable snapshot for LangSmith tracing.
pub fn update_difficulty(
    cfg: &PidConfig,
    state: &mut PidState,
    metrics: &RunMetrics,
) -> f32 {
    // 1. Composite error signal (60% WPM + 40% accuracy)
    let wpm_error = (metrics.wpm - cfg.target_wpm) / cfg.target_wpm;
    let accuracy_error = cfg.target_error_rate - metrics.error_rate;
    let error = (wpm_error * 0.6) + (accuracy_error * 0.4);

    // 2. Normalize against pattern difficulty
    let normalized_error = error / (metrics.pattern_difficulty + 0.01).max(0.5);

    // 3. PID terms
    let p = cfg.base_kp * normalized_error;

    state.integral_term += normalized_error;
    state.integral_term = state.integral_term.clamp(-10.0, 10.0);
    let i = cfg.base_ki * state.integral_term;

    let d = cfg.base_kd * (normalized_error - state.last_error);

    // 4. Confidence scaling: early runs move slowly
    let confidence = (state.runs_count as f32 / 10.0).min(1.0);
    let delta = (p + i + d) * cfg.aggressiveness * confidence;

    // 5. Speed penalty: if accuracy < 80%, force difficulty down
    let speed_penalty = if metrics.error_rate > 0.20 { -0.15 } else { 0.0 };

    // 6. Update state
    state.last_error = normalized_error;
    let raw = state.current_diff + delta + speed_penalty;
    let clamped = raw.clamp(cfg.min_diff, cfg.max_diff);

    // 7. Exponential smoothing
    state.current_diff = 0.65 * clamped + 0.35 * state.current_diff;
    state.runs_count += 1;

    state.current_diff
}

/// Export PID snapshot as JSON for LangSmith tracing
#[derive(serde::Serialize)]
pub struct PidSnapshot {
    pub domain: String,
    pub current_diff: f32,
    pub integral_term: f32,
    pub last_error: f32,
    pub runs_count: u32,
    pub wpm: f32,
    pub error_rate: f32,
    pub new_diff: f32,
}

pub fn create_snapshot(
    domain: &str,
    state: &PidState,
    metrics: &RunMetrics,
    new_diff: f32,
) -> PidSnapshot {
    PidSnapshot {
        domain: domain.to_string(),
        current_diff: state.current_diff,
        integral_term: state.integral_term,
        last_error: state.last_error,
        runs_count: state.runs_count,
        wpm: metrics.wpm,
        error_rate: metrics.error_rate,
        new_diff,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_difficulty_increases_when_user_crushes_it() {
        let cfg = PidConfig::default();
        let mut state = PidState::new(0.25);
        state.runs_count = 10;
        let metrics = RunMetrics {
            wpm: 90.0, error_rate: 0.02, pattern_difficulty: 0.25, completed: true,
        };
        let new_diff = update_difficulty(&cfg, &mut state, &metrics);
        assert!(new_diff > 0.25, "Difficulty should increase: got {}", new_diff);
    }

    #[test]
    fn test_difficulty_decreases_when_user_struggles() {
        let cfg = PidConfig::default();
        let mut state = PidState::new(0.5);
        state.runs_count = 10;
        let metrics = RunMetrics {
            wpm: 30.0, error_rate: 0.25, pattern_difficulty: 0.5, completed: false,
        };
        let new_diff = update_difficulty(&cfg, &mut state, &metrics);
        assert!(new_diff < 0.5, "Difficulty should decrease: got {}", new_diff);
    }

    #[test]
    fn test_difficulty_stays_in_bounds() {
        let cfg = PidConfig::default();
        let mut state = PidState::new(0.95);
        state.runs_count = 20;
        for _ in 0..50 {
            let metrics = RunMetrics {
                wpm: 150.0, error_rate: 0.0, pattern_difficulty: 0.95, completed: true,
            };
            update_difficulty(&cfg, &mut state, &metrics);
        }
        assert!(state.current_diff <= 0.95);
        assert!(state.current_diff >= 0.05);
    }
}
