"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createInitialProgress } from "./mock-data";
import { getParticipantStorageScope } from "./auth-client";
import type { H5Progress } from "./types";

const storagePrefix = "experience-agent:h5:";
const progressChangedEvent = "experience-agent:h5-progress";

function storageKey(inviteCode: string) {
  return `${storagePrefix}${getParticipantStorageScope()}:${inviteCode.toUpperCase()}`;
}

function readStoredValue(inviteCode: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(inviteCode));
  } catch {
    return null;
  }
}

function parseProgress(inviteCode: string, value: string | null): H5Progress {
  const initial = createInitialProgress(inviteCode.toUpperCase());
  if (!value) return initial;

  try {
    const parsed = JSON.parse(value) as Partial<H5Progress>;
    if (parsed.version !== 1) return initial;

    return {
      ...initial,
      ...parsed,
      profile: { ...initial.profile, ...parsed.profile },
      coverage: { ...initial.coverage, ...parsed.coverage },
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return initial;
  }
}

function writeProgress(inviteCode: string, progress: H5Progress) {
  try {
    window.localStorage.setItem(
      storageKey(inviteCode),
      JSON.stringify(progress),
    );
    window.dispatchEvent(new Event(progressChangedEvent));
  } catch {
    // The current screen still works when storage is unavailable.
  }
}

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

export function useH5Progress(inviteCode: string) {
  const normalizedCode = inviteCode.toUpperCase();
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      function handleStorage(event: StorageEvent) {
        if (!event.key || event.key === storageKey(normalizedCode)) {
          onStoreChange();
        }
      }

      window.addEventListener("storage", handleStorage);
      window.addEventListener(progressChangedEvent, onStoreChange);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(progressChangedEvent, onStoreChange);
      };
    },
    [normalizedCode],
  );
  const getSnapshot = useCallback(
    () => readStoredValue(normalizedCode),
    [normalizedCode],
  );
  const getServerSnapshot = useCallback(() => null, []);
  const serializedProgress = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const ready = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const progress = useMemo(
    () => parseProgress(normalizedCode, serializedProgress),
    [normalizedCode, serializedProgress],
  );

  const updateProgress = useCallback(
    (
      updater:
        | Partial<H5Progress>
        | ((current: H5Progress) => H5Progress),
    ) => {
      const current = parseProgress(
        normalizedCode,
        readStoredValue(normalizedCode),
      );
      const next =
        typeof updater === "function"
          ? updater(current)
          : { ...current, ...updater };
      writeProgress(normalizedCode, next);
    },
    [normalizedCode],
  );

  const resetProgress = useCallback(() => {
    writeProgress(normalizedCode, createInitialProgress(normalizedCode));
  }, [normalizedCode]);

  return { progress, ready, updateProgress, resetProgress };
}
