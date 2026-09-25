/**
 * The S4 sync lab, for development builds only: chant and mark names on a
 * real device, go offline and online, sign in, and watch the live total
 * (criterion 4). Not a design for the app; M3 builds the real chant screen.
 */

import { PowerSyncContext, useQuery, useStatus } from '@powersync/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  countEventFromRow,
  countMarks,
  isPositionDeleted,
  isStepChanted,
  positionFromRow,
  totalCount,
  type PracticePosition,
} from '@japadhyan/shared';

import type { DeviceState } from '@/data/powersync/deviceState';
import { colors, spacing } from '@/theme';

import { LAB_MANTRA, LAB_NAMAVALI, LAB_NAMAVALI_STEPS, openSyncLab, type SyncLab } from './lab';

const QUEUE_POLL_MS = 1000;

type Row = Record<string, unknown>;

export interface SyncLabScreenProps {
  open?: () => Promise<SyncLab>;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function SyncLabScreen({ open = openSyncLab }: SyncLabScreenProps) {
  const [lab, setLab] = useState<SyncLab | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    open().then(
      (opened) => live && setLab(opened),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, [open]);

  if (lab === null) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={failure ? styles.error : styles.muted}>
          {failure ?? 'Opening the database…'}
        </Text>
      </SafeAreaView>
    );
  }
  return (
    <PowerSyncContext.Provider value={lab.db}>
      <SyncLabPanel lab={lab} />
    </PowerSyncContext.Provider>
  );
}

function SyncLabPanel({ lab }: { lab: SyncLab }) {
  const device = useQuery<Pick<DeviceState, 'owner_id' | 'device_id' | 'mode' | 'clock_offset_ms'>>(
    'SELECT owner_id, device_id, mode, clock_offset_ms FROM device_state',
  ).data[0];
  const events = useQuery<Row>('SELECT * FROM count_events WHERE practice_id = ?', [LAB_MANTRA]);
  const positions = useQuery<Row>('SELECT * FROM practice_positions WHERE practice_id = ?', [
    LAB_NAMAVALI,
  ]);
  const setAside = useQuery<{ n: number }>('SELECT count(*) AS n FROM upload_failures').data[0];
  const status = useStatus();
  const queued = useUploadQueueSize(lab);

  const total = useMemo(() => totalCount(events.data.map(countEventFromRow)), [events.data]);
  const position = positions.data[0] ? positionFromRow(positions.data[0]) : null;

  const [email, setEmail] = useState(process.env.EXPO_PUBLIC_SYNC_LAB_EMAIL ?? '');
  const [password, setPassword] = useState(process.env.EXPO_PUBLIC_SYNC_LAB_PASSWORD ?? '');
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const button = (label: string, action: () => Promise<void>) => (
    <LabButton label={label} disabled={busy} onPress={() => run(action)} />
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Device">
          <Text style={styles.mode}>{device?.mode === 'signed_in' ? 'Signed in' : 'Guest'}</Text>
          <Text style={styles.label}>Owner</Text>
          <Text style={styles.id}>{device?.owner_id}</Text>
          <Text style={styles.label}>Device</Text>
          <Text style={styles.id}>{device?.device_id}</Text>
          <Text style={styles.muted}>Clock offset: {device?.clock_offset_ms ?? 0} ms</Text>
        </Section>

        <Section title="Sync">
          <Text style={styles.text}>{describeStatus(status)}</Text>
          <Text style={styles.muted}>
            Upload queue: {queued ?? '?'} · Set aside: {setAside?.n ?? 0}
          </Text>
          <View style={styles.row}>
            {button('Go offline', lab.goOffline)}
            {button('Go online', lab.goOnline)}
          </View>
        </Section>

        <Section title="Mantra">
          <Text style={styles.total} testID="total">
            {total}
          </Text>
          <View style={styles.row}>
            {button('+1 japa', () => lab.chant(1))}
            {button('+108', () => lab.chant(108))}
          </View>
        </Section>

        <Section title="Namavali">
          <Marks position={position} />
          <View style={styles.row}>
            {button('Mark next name', lab.markNextName)}
            {button('Finish pass', lab.finishPass)}
          </View>
        </Section>

        <Section title="Account">
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="off"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          <View style={styles.consent}>
            <Switch
              accessibilityLabel="I consent to syncing"
              value={consented}
              onValueChange={setConsented}
            />
            <Text style={styles.text}>I consent to syncing</Text>
          </View>
          <View style={styles.row}>
            {button('Sign in', () => lab.signIn({ email, password }, consented))}
            {button('Clear synced data', lab.clearSynced)}
          </View>
        </Section>

        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Marks({ position }: { position: PracticePosition | null }) {
  if (position === null) return <Text style={styles.muted}>No position yet</Text>;
  if (isPositionDeleted(position)) return <Text style={styles.muted}>Deleted</Text>;
  const marked = countMarks(position.chanted_steps, LAB_NAMAVALI_STEPS);
  return (
    <>
      <Text style={styles.text}>
        Pass {position.pass_ordinal + 1} · {marked} of {LAB_NAMAVALI_STEPS} marked
      </Text>
      <View style={styles.marks}>
        {[...Array(LAB_NAMAVALI_STEPS).keys()].map((i) => (
          <View
            key={i}
            style={[
              styles.mark,
              isStepChanted(position.chanted_steps, i, LAB_NAMAVALI_STEPS) && styles.markDone,
            ]}
          />
        ))}
      </View>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function LabButton(props: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  );
}

function describeStatus(status: ReturnType<typeof useStatus>): string {
  const error = status.downloadError ?? status.uploadError;
  const state = status.connected ? 'Online' : status.connecting ? 'Connecting…' : 'Offline';
  const synced = status.lastSyncedAt ? ` · synced ${status.lastSyncedAt.toLocaleTimeString()}` : '';
  return `${state}${synced}${error ? ` · ${error.message}` : ''}`;
}

/** PowerSync can't watch its upload queue, so it is read once a second. */
function useUploadQueueSize(lab: SyncLab): number | null {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      lab.uploadQueueSize().then(
        (n) => live && setSize(n),
        () => live && setSize(null),
      );
    void read();
    const timer = setInterval(read, QUEUE_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [lab]);
  return size;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  sectionTitle: { color: colors.accent, fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  mode: { color: colors.text, fontSize: 20, fontWeight: '600' },
  label: { color: colors.textMuted, fontSize: 12 },
  id: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.textMuted, fontSize: 14 },
  error: { color: colors.accent, fontSize: 14 },
  total: { color: colors.text, fontSize: 48, fontWeight: '300', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  buttonPressed: { backgroundColor: colors.accentSoft },
  buttonText: { color: colors.text, fontSize: 15 },
  marks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mark: { width: 20, height: 20, borderRadius: 4, backgroundColor: colors.surfaceRaised },
  markDone: { backgroundColor: colors.success },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  consent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
