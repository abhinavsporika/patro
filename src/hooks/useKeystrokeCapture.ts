// src/hooks/useKeystrokeCapture.ts
import { useState, useEffect, useCallback, useRef } from 'react';

interface CaptureResult {
  input: string;
  errors: number;
  wpm: number;
  timingMap: number[];
  startTime: number | null;
  reset: () => void;
}

export function useKeystrokeCapture(
  expectedContent: string,
  onComplete: (stats: { wpm: number; accuracy: number; timingMap: number[] }) => void
): CaptureResult {
  const [input, setInput] = useState("");
  const [errors, setErrors] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const timingMapRef = useRef<number[]>([]);
  const inputRef = useRef("");
  const errorsRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { errorsRef.current = errors; }, [errors]);

  const reset = useCallback(() => {
    setInput("");
    setErrors(0);
    startTimeRef.current = null;
    timingMapRef.current = [];
    inputRef.current = "";
    errorsRef.current = 0;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (["Backspace", "Tab"].includes(e.key)) e.preventDefault();

    if (e.key === "Escape") {
      reset();
      return;
    }

    const currentInput = inputRef.current;
    const currentErrors = errorsRef.current;

    // Already complete
    if (currentInput.length >= expectedContent.length) return;

    if (!startTimeRef.current) startTimeRef.current = Date.now();

    if (e.key === "Backspace") {
      if (currentInput.length > 0) {
        const newInput = currentInput.slice(0, -1);
        inputRef.current = newInput;
        setInput(newInput);
        timingMapRef.current.pop();
      }
      return;
    }

    if (e.key === "Enter") {
      const nextChar = expectedContent[currentInput.length];
      if (nextChar === "\n") {
        // Process the newline
        let newErrors = currentErrors;
        const elapsed = Date.now() - (startTimeRef.current || Date.now());
        timingMapRef.current.push(elapsed);
        let newInput = currentInput + "\n";

        // Auto-advance through leading whitespace on the next line
        while (
          newInput.length < expectedContent.length &&
          (expectedContent[newInput.length] === ' ' || expectedContent[newInput.length] === '\t')
        ) {
          const wsElapsed = Date.now() - (startTimeRef.current || Date.now());
          timingMapRef.current.push(wsElapsed);
          newInput += expectedContent[newInput.length];
        }

        inputRef.current = newInput;
        errorsRef.current = newErrors;
        setInput(newInput);
        setErrors(newErrors);
        checkCompletion(newInput, newErrors);
        return;
      }
    }

    if (e.key === "Tab") {
      const spaces = "  ";
      let ci = currentInput;
      let ce = currentErrors;
      for (const ch of spaces) {
        if (ci.length >= expectedContent.length) break;
        const nextExpected = expectedContent[ci.length];
        if (ch !== nextExpected) ce++;
        const elapsed = Date.now() - (startTimeRef.current || Date.now());
        timingMapRef.current.push(elapsed);
        ci = ci + ch;
      }
      inputRef.current = ci;
      errorsRef.current = ce;
      setInput(ci);
      setErrors(ce);
      checkCompletion(ci, ce);
      return;
    }

    if (e.key.length === 1) {
      processChar(e.key, currentInput, currentErrors);
    }

    function processChar(char: string, curInput: string, curErrors: number) {
      const nextExpected = expectedContent[curInput.length];
      let newErrors = curErrors;
      if (char !== nextExpected) newErrors++;

      const elapsed = Date.now() - (startTimeRef.current || Date.now());
      timingMapRef.current.push(elapsed);

      const newInput = curInput + char;
      inputRef.current = newInput;
      errorsRef.current = newErrors;
      setInput(newInput);
      setErrors(newErrors);

      checkCompletion(newInput, newErrors);
    }

    function checkCompletion(newInput: string, newErrors: number) {
      if (newInput.length >= expectedContent.length) {
        const elapsed = Date.now() - (startTimeRef.current || Date.now());
        const durationMin = elapsed / 1000 / 60;
        const wpm = durationMin > 0 ? (expectedContent.length / 5) / durationMin : 0;
        const accuracy = Math.max(0, (expectedContent.length - newErrors) / expectedContent.length);
        onComplete({ wpm, accuracy, timingMap: [...timingMapRef.current] });
      }
    }
  }, [expectedContent, onComplete, reset]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Live WPM calculation
  const wpm = (() => {
    if (!startTimeRef.current || input.length === 0) return 0;
    const elapsed = (Date.now() - startTimeRef.current) / 1000 / 60;
    return elapsed > 0 ? (input.length / 5) / elapsed : 0;
  })();

  return { input, errors, wpm, timingMap: timingMapRef.current, startTime: startTimeRef.current, reset };
}
