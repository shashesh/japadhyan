/**
 * Sync primitives shared by every record the devotee owns.
 * See docs/architecture/data-model.md#conflict-rule.
 */

/**
 * A hybrid logical clock. Records where the latest edit wins are ordered by
 * this, not by the phone's clock alone: an edit made after seeing another
 * edit always wins, even when the phone's clock is behind.
 *
 * Compared by `millis`, then `counter`, then `device_id`.
 */
export interface Hlc {
  /** The device's time in milliseconds when the edit was made. */
  millis: number;
  /** Breaks ties within the same millisecond. */
  counter: number;
  /** Breaks exact ties, so every device settles on the same result. */
  device_id: string;
}

/** Fields carried by every record whose latest edit wins. */
export interface SyncFields {
  hlc: Hlc;
  /** Set when the record is deleted, so the deletion itself syncs. */
  deleted_at: string | null;
}

/** Fields carried by every record the devotee owns. */
export interface OwnedRecord {
  /** UUIDv7, generated on the device, so it works offline and sorts by time. */
  id: string;
  /**
   * The owner. Before sign-in this is the local profile id; on first sign-in
   * the device's rows are combined with the account's and then re-keyed.
   */
  user_id: string;
}
