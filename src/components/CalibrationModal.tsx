// src/components/CalibrationModal.tsx
import React, { useState, useCallback } from 'react';
import { useKeystrokeCapture } from '../hooks/useKeystrokeCapture';
import { finalizeCalibration } from '../lib/api';

interface Props {
  onComplete: () => void;
}

const CALIBRATION_PATTERNS = [
  { id: 'cal_1', content: 'nums = [3, 1, 4, 1, 5]\nnums.sort()\nsmallest = nums[0]', difficulty: 0.15, domain: 'array' },
  { id: 'cal_2', content: 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i', difficulty: 0.30, domain: 'hashmap' },
  { id: 'cal_3', content: 'def maxProfit(prices):\n    min_price = float("inf")\n    max_profit = 0\n    for price in prices:\n        min_price = min(min_price, price)\n        max_profit = max(max_profit, price - min_price)\n    return max_profit', difficulty: 0.45, domain: 'array' },
];

interface RunStats {
  wpm: number;
  accuracy: number;
}

const CalibrationRun: React.FC<{
  pattern: typeof CALIBRATION_PATTERNS[0];
  onDone: (stats: RunStats) => void;
}> = ({ pattern, onDone }) => {
  const handleComplete = useCallback((stats: { wpm: number; accuracy: number; timingMap: number[] }) => {
    onDone({ wpm: stats.wpm, accuracy: stats.accuracy });
  }, [onDone]);

  const { input, errors, wpm } = useKeystrokeCapture(pattern.content, handleComplete);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-xs text-gray-500 uppercase tracking-widest">
        <span>{pattern.domain}</span>
        <span>WPM: <b className="text-cyan-400">{Math.round(wpm)}</b></span>
      </div>
      <div className="font-mono text-base leading-relaxed p-6 rounded-lg border border-gray-800 bg-gray-900 whitespace-pre-wrap relative min-h-[120px]">
        <span className="text-gray-700">{pattern.content}</span>
        <div className="absolute top-0 left-0 p-6 pointer-events-none">
          {input.split("").map((char, i) => (
            <span key={i} className={char === pattern.content[i] ? "text-white" : "text-red-500 bg-red-900/30 underline"}>
              {pattern.content[i]}
            </span>
          ))}
          <span className="cursor-blink border-l-2 border-white h-5 -ml-0.5" />
        </div>
      </div>
      <div className="text-xs text-gray-600 text-center">
        {input.length}/{pattern.content.length} characters | {errors} errors
      </div>
    </div>
  );
};

export const CalibrationModal: React.FC<Props> = ({ onComplete }) => {
  const [currentRun, setCurrentRun] = useState(0);
  const [results, setResults] = useState<RunStats[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  const handleRunDone = useCallback(async (stats: RunStats) => {
    const newResults = [...results, stats];
    setResults(newResults);

    if (currentRun < CALIBRATION_PATTERNS.length - 1) {
      setTimeout(() => setCurrentRun(prev => prev + 1), 800);
    } else {
      // Calculate initial difficulty from calibration
      const avgWpm = newResults.reduce((s, r) => s + r.wpm, 0) / newResults.length;
      const avgAcc = newResults.reduce((s, r) => s + r.accuracy, 0) / newResults.length;

      // Map performance to initial difficulty (higher perf = higher starting diff)
      let initialDiff = 0.25;
      if (avgWpm > 80 && avgAcc > 0.95) initialDiff = 0.55;
      else if (avgWpm > 60 && avgAcc > 0.90) initialDiff = 0.40;
      else if (avgWpm > 40 && avgAcc > 0.85) initialDiff = 0.30;

      try {
        await finalizeCalibration(initialDiff);
      } catch (e) {
        console.error("Calibration save failed:", e);
      }
      setIsFinished(true);
    }
  }, [currentRun, results]);

  if (isFinished) {
    const avgWpm = results.reduce((s, r) => s + r.wpm, 0) / results.length;
    const avgAcc = results.reduce((s, r) => s + r.accuracy, 0) / results.length;

    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 animate-fade-in">
        <div className="max-w-md w-full p-8 space-y-6">
          <h2 className="text-2xl font-bold text-center">Calibration Complete</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-lg p-4 text-center border border-gray-800">
              <div className="text-3xl font-bold text-cyan-400">{Math.round(avgWpm)}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Avg WPM</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center border border-gray-800">
              <div className="text-3xl font-bold text-purple-400">{Math.round(avgAcc * 100)}%</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Avg Accuracy</div>
            </div>
          </div>
          <p className="text-sm text-gray-500 text-center">
            Difficulty calibrated to your skill level. Starting adaptive mode...
          </p>
          <button
            onClick={onComplete}
            className="w-full py-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm font-medium"
          >
            Start Training
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 animate-fade-in">
      <div className="max-w-xl w-full p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Quick Skill Check</h2>
          <p className="text-sm text-gray-500">
            Type {CALIBRATION_PATTERNS.length} patterns so we can calibrate difficulty to your level
          </p>
          <div className="flex gap-2 justify-center mt-3">
            {CALIBRATION_PATTERNS.map((_, i) => (
              <div
                key={i}
                className={`w-8 h-1 rounded-full ${
                  i < currentRun ? 'bg-cyan-400' :
                  i === currentRun ? 'bg-white' :
                  'bg-gray-800'
                }`}
              />
            ))}
          </div>
        </div>
        <CalibrationRun
          key={currentRun}
          pattern={CALIBRATION_PATTERNS[currentRun]}
          onDone={handleRunDone}
        />
      </div>
    </div>
  );
};
