import { useCallback, useMemo, useState } from 'react';
import {
  type ChantMode,
  type CountEvent,
  type Practice,
  localDay,
  roundProgress,
  totalCount,
  tzOffsetMinutes,
  uuidv7,
} from '@japadhyan/shared';

// Placeholders until device identity, the local profile and storage land in M3.
const DEVICE_ID = 'local-device';
const LOCAL_USER_ID = 'local-profile';

/**
 * In-memory chanting session. Every mode records CountEvents; totals are
 * always derived from events ("one count, many inputs"). Events are sealed
 * with the local day and the steps they were chanted with, so a later
 * content update never changes what this session counted.
 */
export function useChantSession(practice: Practice) {
  const [sessionId] = useState(() => uuidv7());
  const [events, setEvents] = useState<CountEvent[]>([]);

  const stepsPerRepetition = practice.steps.length;

  const addRepetitions = useCallback(
    (mode: ChantMode, count = 1, estimated = false) => {
      const createdAt = new Date().toISOString();
      const tzOffsetMin = tzOffsetMinutes();
      setEvents((prev) => [
        ...prev,
        {
          id: uuidv7(),
          user_id: LOCAL_USER_ID,
          practice_id: practice.id,
          session_id: sessionId,
          mode,
          count,
          steps_per_repetition: stepsPerRepetition,
          estimated,
          device_id: DEVICE_ID,
          created_at: createdAt,
          local_day: localDay(createdAt, tzOffsetMin),
          tz_offset_min: tzOffsetMin,
        },
      ]);
    },
    [practice.id, sessionId, stepsPerRepetition],
  );

  const total = useMemo(
    () => totalCount(events, { practiceId: practice.id }),
    [events, practice.id],
  );
  const progress = useMemo(
    () => roundProgress(total, practice.default_round),
    [total, practice.default_round],
  );

  return { events, total, progress, addRepetitions };
}
