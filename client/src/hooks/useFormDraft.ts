import { useEffect, useState, useCallback, useRef } from 'react';

interface UseFormDraftOptions<T> {
  storageKey: string;
  getValues: () => T;
  onRestore?: (data: T) => void;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseFormDraftReturn<T> {
  hasDraft: boolean;
  restoreDraft: () => T | null;
  clearDraft: () => void;
  saveDraft: () => void;
}

export function useFormDraft<T>({
  storageKey,
  getValues,
  debounceMs = 1000,
  enabled = true,
}: UseFormDraftOptions<T>): UseFormDraftReturn<T> {
  const [hasDraft, setHasDraft] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getValuesRef = useRef(getValues);
  getValuesRef.current = getValues;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        JSON.parse(saved);
        setHasDraft(true);
      }
    } catch {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
    }
  }, [storageKey]);

  const saveDraft = useCallback(() => {
    if (!enabled) return;
    try {
      const values = getValuesRef.current();
      localStorage.setItem(storageKey, JSON.stringify(values));
      setHasDraft(true);
    } catch {
      // silently fail
    }
  }, [storageKey, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const debouncedSave = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveDraft();
      }, debounceMs);
    };

    const handleInput = () => debouncedSave();
    const handleChange = () => debouncedSave();

    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);

    return () => {
      document.removeEventListener('input', handleInput);
      document.removeEventListener('change', handleChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [saveDraft, debounceMs, enabled]);

  const restoreDraft = useCallback((): T | null => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;
      const data = JSON.parse(saved) as T;
      return data;
    } catch {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      return null;
    }
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setHasDraft(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [storageKey]);

  return { hasDraft, restoreDraft, clearDraft, saveDraft };
}
