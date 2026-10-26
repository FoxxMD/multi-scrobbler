/**
 * Inspired by typings from https://github.com/michal-worwag/hooks-ts/blob/main/packages/hooks-ts/src/useLocalStorage/useLocalStorage.ts
 * and global updates/dedup from https://github.com/kaansey/react-localstorage-hook/blob/master/src/useLocalStorage/useLocalStorage.ts
 */

import { useState, useEffect, useCallback } from 'react';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const localTypedStorageHook = <T>(key: string, initialValue: T, json: boolean = true): [T, (value: T) => void] => {

    const [storedValue, setStoredValue] = useState<T>(() => {
        const item = window.localStorage.getItem(key);
        if (json) {
            try {
                return item ? (JSON.parse(item) as T) : initialValue;
            } catch (error) {
                console.error(error);
                return initialValue;
            }
        } else {
            try {
                if (null === item) {
                    return initialValue;
                }
                if (item === 'true') {
                    return true as T;
                }
                if (item === 'false') {
                    return false as T;
                }
                if (isNumeric(item)) {
                    if (item.includes('.')) {
                        return parseFloat(item) as T;
                    }
                    return parseInt(item) as T;
                }
                return item as T;
            } catch (error) {
                console.error(error);
                return initialValue;
            }
        }
    });


  const updateValue = useCallback(
    newValue => {
      setStoredValue(() => {
        if(json) {
           localStorage.setItem(key, JSON.stringify(newValue)) 
        } else {
            localStorage.setItem(key, newValue)
        }
        return newValue
      })
    },
    [key]
  );

    useEffect(() => {
    const onStorage = (event: any) => {
      if (event.storageArea === localStorage && event.key === key) {
        setStoredValue(
          event.newValue === null ? initialValue : event.newValue
        )
      }
    }

    window.addEventListener('storage', onStorage)

    return () => window.removeEventListener('storage', onStorage)
  });

  return [storedValue, updateValue];

}

const isNumeric = (num: any) => (typeof(num) === 'number' || typeof(num) === "string" && num.trim() !== '') && !isNaN(num as number);

const createTypedLocalStorageHook = <T>(key: string, defaultValue: T, json?: boolean) => {
  const updates: Array<any> = []

  return () => {
    const [value, setValue] = localTypedStorageHook<T>(key, defaultValue, json)
    const updateValue = useCallback((newValue: T) => {
      for (const update of updates) {
        update(newValue)
      }
    }, [])

    useEffect(() => {
      updates.push(setValue)
      return () => {
        updates.splice(updates.indexOf(setValue), 1)
      }
    }, [setValue])

    return [value, updateValue]
  }
}

const hookInstances: Record<string, any> = {}

export const useTypedLocalStorage = <T>(key: string, defaultValue: T, json?: boolean): [T, (value: T) => void] => {
  if (key in hookInstances) {
    return hookInstances[key]()
  }

  // prevents usage during server static rendering
  if(!ExecutionEnvironment.canUseDOM) {
    return [defaultValue, () => null];
  }

  hookInstances[key] = createTypedLocalStorageHook(key, defaultValue, json)
  return hookInstances[key]()
}