// src-tauri/src/commands.rs

use tauri::command;
use crate::engine::{DifficultyEngine, PatternForFrontend};
use std::sync::Mutex;

pub struct AppState {
    pub engine: Mutex<DifficultyEngine>,
}

#[derive(serde::Deserialize)]
pub struct SubmitRunPayload {
    pub pattern_id: String,
    pub domain: String,
    pub wpm: f32,
    pub accuracy: f32,
    pub character_timestamps: Option<Vec<u32>>,
}

#[derive(serde::Serialize)]
pub struct RunResult {
    pub new_difficulty: f32,
    pub next_patterns: Vec<PatternForFrontend>,
}

#[derive(serde::Serialize)]
pub struct UserStats {
    pub total_runs: u32,
    pub avg_wpm: f32,
    pub avg_accuracy: f32,
    pub best_wpm: f32,
}

#[derive(serde::Serialize)]
pub struct DomainStat {
    pub domain: String,
    pub run_count: u32,
    pub avg_wpm: f32,
    pub avg_accuracy: f32,
}

#[derive(serde::Serialize)]
pub struct GhostData {
    pub timestamps: Vec<u32>,
    pub wpm: f32,
    pub accuracy: f32,
}

#[derive(serde::Serialize)]
pub struct FailureDomain {
    pub domain: String,
    pub count: u32,
}

#[command]
pub fn get_next_run(
    state: tauri::State<AppState>,
    domain: String,
    count: usize,
) -> Result<Vec<PatternForFrontend>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.generate_run_patterns(&domain, count)
}

#[command]
pub fn submit_run_result(
    state: tauri::State<AppState>,
    payload: SubmitRunPayload,
) -> Result<RunResult, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let new_diff = engine.finish_run(
        &payload.pattern_id, &payload.domain,
        payload.wpm, payload.accuracy,
        payload.character_timestamps,
    )?;
    let next = engine.generate_run_patterns(&payload.domain, 5)?;
    Ok(RunResult { new_difficulty: new_diff, next_patterns: next })
}

#[command]
pub fn get_personal_best(
    state: tauri::State<AppState>,
    pattern_id: String,
) -> Result<Option<GhostData>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    match engine.persistence.get_personal_best(&pattern_id) {
        Ok(Some(replay)) => Ok(Some(GhostData {
            timestamps: replay.timestamps, wpm: replay.wpm, accuracy: replay.accuracy,
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub fn get_stats(state: tauri::State<AppState>) -> Result<UserStats, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let (total, avg_wpm, avg_acc, best) = engine.persistence.get_user_stats()
        .map_err(|e| e.to_string())?;
    Ok(UserStats { total_runs: total, avg_wpm, avg_accuracy: avg_acc, best_wpm: best })
}

#[command]
pub fn get_domain_stats(state: tauri::State<AppState>) -> Result<Vec<DomainStat>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let stats = engine.persistence.get_domain_stats().map_err(|e| e.to_string())?;
    Ok(stats.into_iter().map(|(domain, run_count, avg_wpm, avg_accuracy)| {
        DomainStat { domain, run_count, avg_wpm, avg_accuracy }
    }).collect())
}

#[command]
pub fn get_failure_domains(state: tauri::State<AppState>) -> Result<Vec<FailureDomain>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let domains = engine.persistence.get_failure_domains().map_err(|e| e.to_string())?;
    Ok(domains.into_iter().map(|(domain, count)| {
        FailureDomain { domain, count }
    }).collect())
}

#[command]
pub fn finalize_calibration(
    state: tauri::State<AppState>,
    initial_difficulty: f32,
) -> Result<(), String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let pid = crate::difficulty::PidState::new(initial_difficulty);
    engine.persistence.save_pid_state("default", &pid, crate::persistence::Aggressiveness::Medium)
        .map_err(|e| e.to_string())?;
    engine.persistence.set_setting("calibrated", "true")
        .map_err(|e| e.to_string())
}

#[command]
pub fn is_calibrated(state: tauri::State<AppState>) -> Result<bool, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    match engine.persistence.get_setting("calibrated") {
        Ok(Some(v)) => Ok(v == "true"),
        Ok(None) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub fn get_pid_convergence(
    state: tauri::State<AppState>,
    domain: String,
    limit: usize,
) -> Result<Vec<(f32, f32, f32)>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine.persistence.get_pid_convergence_data(&domain, limit)
        .map_err(|e| e.to_string())
}

/// Ingest patterns from a user-dropped folder or zip path.
/// Spawns the Python ingestion pipeline as a child process.
#[derive(serde::Serialize)]
pub struct IngestResult {
    pub patterns_ingested: u32,
    pub errors: Vec<String>,
}

#[command]
pub fn request_ingest(
    path: String,
) -> Result<IngestResult, String> {
    use std::process::Command;

    // Determine the ingestion script location relative to the app
    let ingestion_cmd = if cfg!(debug_assertions) {
        // Dev: run from project root
        "python3"
    } else {
        "python3"
    };

    let output = Command::new(ingestion_cmd)
        .args(["-m", "ingestion.main", "ingest", "--path", &path, "--json-only"])
        .output()
        .map_err(|e| format!("Failed to spawn ingestion process: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Parse the count from output (e.g., "Ingested 20 JSON patterns")
    let count = stdout.lines()
        .find(|l| l.contains("Ingested"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|n| n.parse::<u32>().ok())
        .unwrap_or(0);

    let errors: Vec<String> = stderr.lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    Ok(IngestResult {
        patterns_ingested: count,
        errors,
    })
}
