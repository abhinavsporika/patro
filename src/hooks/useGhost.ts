// src/hooks/useGhost.ts
// Drives the ghost replay animation using stored character timestamps.
// Returns the ghost's current character index and timing delta vs user.

import { useState, useEffect, useRef, useCallback } from 'react';

interface GhostProps {
  characterTimestamps: number[];
  isActive: boolean;
  userIndex: number; // current user character position
  userElapsed: number; // current user elapsed ms
}

interface GhostResult {
  ghostIndex: number;
  /** ms ahead (+) or behind (-) the ghost. Positive = user is faster */
  delta: number;
  /** ghost has finished the pattern */
  ghostDone: boolean;
  /** ghost WPM at current position */
  ghostLiveWpm: number;
}

export function useGhost({ characterTimestamps, isActive, userIndex, userElapsed }: GhostProps): GhostResult {
  const [ghostIndex, setGhostIndex] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const tick = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = timestamp - startTimeRef.current;

    let idx = 0;
    for (let i = 0; i < characterTimestamps.length; i++) {
      if (characterTimestamps[i] <= elapsed) idx = i + 1;
      else break;
    }

    setGhostIndex(Math.min(idx, characterTimestamps.length));

    if (idx < characterTimestamps.length) {
      frameRef.current = requestAnimationFrame(tick);
    }
  }, [characterTimestamps]);

  useEffect(() => {
    if (isActive && characterTimestamps.length > 0) {
      startTimeRef.current = null;
      setGhostIndex(0);
      frameRef.current = requestAnimationFrame(tick);
    }
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [isActive, characterTimestamps, tick]);

  useEffect(() => {
    if (!isActive) { setGhostIndex(0); startTimeRef.current = null; }
  }, [isActive]);

  // Calculate delta: how far ahead/behind the user is vs the ghost
  // Positive delta = user is ahead (faster), negative = behind (slower)
  let delta = 0;
  if (isActive && characterTimestamps.length > 0 && userIndex > 0) {
    // Time the ghost took to reach the user's current position
    const ghostTimeAtUserPos = userIndex <= characterTimestamps.length
      ? characterTimestamps[userIndex - 1] || 0
      : characterTimestamps[characterTimestamps.length - 1] || 0;
    delta = ghostTimeAtUserPos - userElapsed; // positive = user faster
  }

  const ghostDone = ghostIndex >= characterTimestamps.length;

  // Ghost live WPM
  let ghostLiveWpm = 0;
  if (ghostIndex > 0 && startTimeRef.current) {
    const ghostElapsed = characterTimestamps[ghostIndex - 1] || 0;
    const mins = ghostElapsed / 1000 / 60;
    ghostLiveWpm = mins > 0 ? (ghostIndex / 5) / mins : 0;
  }

  return { ghostIndex, delta, ghostDone, ghostLiveWpm };
}
