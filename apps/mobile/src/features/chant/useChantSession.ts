import { useCallback, useMemo, useState } from 'react';
import {
  type ChantMode,
  type CountEvent,
  type Mantra,
  roundProgress,
  totalCount,
} from '@japadhyan/shared';

// Placeholder until device identity and local storage (SQLite) land in P1.
const DEVICE_ID = 'local-device';

let eventSeq = 0;
function newEventId(): string {
  eventSeq += 1;
  return `${Date.now().toString(36)}-${eventSeq}`;
}

/**
 * In-memory chanting session. Every mode records CountEvents; totals are
 * always derived from events ("one count, many inputs").
 */
export function useChantSession(mantra: Mantra) {
  const [sessionId] = useState(newEventId);
  const [events, setEvents] = useState<CountEvent[]>([]);

  const addRepetitions = useCallback(
    (mode: ChantMode, count = 1, estimated = false) => {
      setEvents((prev) => [
        ...prev,
        {
          id: newEventId(),
          mantra_id: mantra.id,
          session_id: sessionId,
          mode,
          count,
          estimated,
          device_id: DEVICE_ID,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    [mantra.id, sessionId],
  );

  const total = useMemo(() => totalCount(events, { mantraId: mantra.id }), [events, mantra.id]);
  const progress = useMemo(
    () => roundProgress(total, mantra.round_size),
    [total, mantra.round_size],
  );

  return { events, total, progress, addRepetitions };
}
