// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod difficulty;
mod engine;
mod generator;
mod persistence;

use commands::AppState;
use engine::DifficultyEngine;
use std::sync::Mutex;

fn main() {
    let db_path = dirs_db_path();
    let engine = DifficultyEngine::new(&db_path);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState { engine: Mutex::new(engine) })
        .invoke_handler(tauri::generate_handler![
            commands::get_next_run,
            commands::submit_run_result,
            commands::get_personal_best,
            commands::get_stats,
            commands::get_domain_stats,
            commands::get_failure_domains,
            commands::finalize_calibration,
            commands::is_calibrated,
            commands::get_pid_convergence,
            commands::request_ingest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_db_path() -> String {
    if let Some(data_dir) = dirs_data_local() {
        let patro_dir = std::path::Path::new(&data_dir).join("patro-lite");
        std::fs::create_dir_all(&patro_dir).ok();
        patro_dir.join("patro.db").to_string_lossy().to_string()
    } else {
        "patro.db".to_string()
    }
}

fn dirs_data_local() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").ok().map(|h| format!("{}/Library/Application Support", h))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("LOCALAPPDATA").ok()
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_DATA_HOME").ok()
            .or_else(|| std::env::var("HOME").ok().map(|h| format!("{}/.local/share", h)))
    }
}
