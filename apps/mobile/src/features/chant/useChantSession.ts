import { useCallback, useMemo, useRef, useState } from 'react';
import {
  type ChantMode,
  type CountEvent,
  type DayKey,
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
/** Profile.day_start_minutes once the profile exists (M3); midnight until then. */
const DAY_START_MINUTES = 0;

interface OpenSession {
  id: string;
  /** A session never crosses a local day; it is replaced at the boundary. */
  local_day: DayKey;
}

function startSession(createdAt: string, tzOffsetMin: number): OpenSession {
  return { id: uuidv7(), local_day: localDay(createdAt, tzOffsetMin, DAY_START_MINUTES) };
}

/**
 * In-memory chanting session. Every mode records CountEvents; totals are
 * always derived from events ("one count, many inputs"). Events are sealed
 * with the local day and the steps they were chanted with, so a later
 * content update never changes what this session counted.
 *
 * Storage, and sealing events properly rather than one per tap, arrive in M3.
 */
export function useChantSession(practice: Practice) {
  // The open session is not rendered, and a state updater must stay pure —
  // deriving it in a ref keeps a double-invoked render from duplicating events.
  const sessionRef = useRef<OpenSession | null>(null);
  const [events, setEvents] = useState<CountEvent[]>([]);

  const stepsPerRepetition = practice.steps.length;

  const addRepetitions = useCallback(
    (mode: ChantMode, count = 1, estimated = false) => {
      const createdAt = new Date().toISOString();
      const tzOffsetMin = tzOffsetMinutes();
      const today = localDay(createdAt, tzOffsetMin, DAY_START_MINUTES);

      // At the devotee's day boundary the session ends and a new one begins,
      // so every event in a session shares one local_day.
      const open = sessionRef.current;
      const session =
        open && open.local_day === today ? open : startSession(createdAt, tzOffsetMin);
      sessionRef.current = session;

      setEvents((prev) => [
        ...prev,
        {
          id: uuidv7(),
          user_id: LOCAL_USER_ID,
          practice_id: practice.id,
          session_id: session.id,
          mode,
          count,
          steps_per_repetition: stepsPerRepetition,
          estimated,
          device_id: DEVICE_ID,
          created_at: createdAt,
          local_day: today,
          tz_offset_min: tzOffsetMin,
        },
      ]);
    },
    [practice.id, stepsPerRepetition],
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
