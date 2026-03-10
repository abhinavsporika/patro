// src-tauri/src/generator.rs
// Run generator with warm-up → flow → peak → cool-down pacing

use crate::persistence::Pattern;
use crate::engine::PatternForFrontend;
use rand::prelude::*;
use rand_pcg::Pcg32;

pub struct RunGenerator;

impl RunGenerator {
    /// Generate an act with warm-up → flow → peak → cool-down pacing
    pub fn generate_act(
        candidates: &[Pattern],
        target_diff: f32,
        count: usize,
        seed: u64,
    ) -> Vec<PatternForFrontend> {
        if candidates.is_empty() {
            return vec![];
        }

        let mut rng = Pcg32::seed_from_u64(seed);
        let mut available: Vec<Pattern> = candidates.to_vec();
        let mut selected: Vec<PatternForFrontend> = vec![];

        for i in 0..count {
            if available.is_empty() { break; }

            // Dynamic pacing curve
            let modifier = match i {
                0 => -0.06,                                    // Warm-up
                n if n == count - 1 => -0.03,                  // Cool-down
                n if n >= (count * 3) / 4 => 0.05,            // Peak challenge
                _ => 0.0,                                      // Main flow
            };

            let ideal = (target_diff + modifier).clamp(0.05, 0.95);

            if let Some(best_idx) = available.iter().enumerate().max_by(|
                (_, a), (_, b)| {
                let score_a = Self::score_pattern(a, ideal, &selected);
                let score_b = Self::score_pattern(b, ideal, &selected);
                score_a.partial_cmp(&score_b).unwrap()
            }).map(|(idx, _)| idx) {
                let pattern = available.remove(best_idx);
                selected.push(PatternForFrontend {
                    id: pattern.id.clone(),
                    domain: pattern.domain.clone(),
                    difficulty: pattern.difficulty,
                    content: pattern.content.clone(),
                });
            }
        }

        // Light shuffle preserves pacing but feels fresh
        selected.shuffle(&mut rng);
        selected
    }

    fn score_pattern(p: &Pattern, ideal: f32, already_selected: &[PatternForFrontend]) -> f32 {
        let relevance = 1.0 - (p.difficulty - ideal).abs() * 0.8;
        let diversity = if already_selected.is_empty() {
            1.0
        } else {
            already_selected.iter()
                .map(|s| 1.0 - (p.difficulty - s.difficulty).abs())
                .min_by(|a, b| a.partial_cmp(b).unwrap())
                .unwrap_or(0.0)
        };
        relevance * 0.65 + diversity * 0.35
    }
}
