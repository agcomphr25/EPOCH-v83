import { useEffect, useState, useCallback, useRef } from 'react';

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface DraftWrapper<T> {
  data: T;
  savedAt: number;
}

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

function parseDraft<T>(raw: string): T | null {
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === 'object' && 'savedAt' in parsed && 'data' in parsed) {
    const wrapper = parsed as DraftWrapper<T>;
    if (Date.now() - wrapper.savedAt > DRAFT_MAX_AGE_MS) {
      return null;
    }
    return wrapper.data;
  }
  if (Date.now() - (parsed?._draftTimestamp || 0) > DRAFT_MAX_AGE_MS && parsed?._draftTimestamp) {
    return null;
  }
  return parsed as T;
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
        const data = parseDraft(saved);
        if (data === null) {
          localStorage.removeItem(storageKey);
          setHasDraft(false);
        } else {
          setHasDraft(true);
        }
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
      const wrapper: DraftWrapper<T> = {
        data: values,
        savedAt: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify(wrapper));
      setHasDraft(true);
    } catch {
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
      const data = parseDraft<T>(saved);
      if (data === null) {
        localStorage.removeItem(storageKey);
        setHasDraft(false);
        return null;
      }
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
