import { useState, useEffect, useCallback } from 'react';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const STORAGE_KEY = 'scb-placeholders';
const CHANGE_EVENT = 'scb-placeholders-change';
const FIELD = 'input.scb-placeholder';

const readPlaceholders = (): Record<string, string> => {
  try {
    return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch (error) {
    console.error(error);
    return {};
  }
}

const readValue = (key: string, initialValue: string): string => {
  if (!ExecutionEnvironment.canUseDOM) {
    return initialValue;
  }
  return readPlaceholders()[key] ?? initialValue;
}

/**
 * Reads/writes the same values as starlight-codeblocks fill-in placeholders.
 *
 * The placeholders script only reads sessionStorage once (on init) and keeps values in memory after that,
 * so writing to sessionStorage directly does not update code blocks. Instead, changes are routed through a
 * placeholder input on the page (the script listens for bubbling 'input' events on document), and the
 * 'scb-placeholders-change' event the script dispatches after saving is used to re-read the stored values.
 *
 * The browser 'storage' event can't be used for this because it never fires in the document that made the change.
 */
export const useTypedCodeblocksStorage = (key: string, initialValue: string): [string, (value: string) => void] => {
  const [storedValue, setStoredValue] = useState<string>(() => readValue(key, initialValue));

  useEffect(() => {
    const sync = () => setStoredValue(readValue(key, initialValue));
    document.addEventListener(CHANGE_EVENT, sync);
    return () => document.removeEventListener(CHANGE_EVENT, sync);
  }, [key, initialValue]);

  const updateValue = useCallback((newValue: string) => {
    if (newValue === readValue(key, initialValue)) {
      return;
    }
    const input = Array.from(document.querySelectorAll<HTMLInputElement>(FIELD)).find(x => x.placeholder === key);
    if (input !== undefined) {
      input.value = newValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // no code block on this page uses this key so write to storage ourselves and notify other hooks
    const placeholders = readPlaceholders();
    if (newValue) {
      placeholders[key] = newValue;
    } else {
      delete placeholders[key];
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(placeholders));
    document.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }, [key, initialValue]);

  return [storedValue, updateValue];
}
