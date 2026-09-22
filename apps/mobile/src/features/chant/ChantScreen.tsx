import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type Practice,
  devPractices,
  createWordTapState,
  roundProgress,
  tapWord,
} from '@japadhyan/shared';
import { colors, spacing } from '@/theme';
import { beadFeedback } from './feedback';
import { useChantSession } from './useChantSession';

type Mode = 'mala_tap' | 'word_tap';

const MODE_LABELS: Record<Mode, string> = {
  mala_tap: 'Mala tap',
  word_tap: 'Word by word',
};

const PRACTICES = devPractices();
const DEFAULT_PRACTICE = PRACTICES[0]!;

/** The English title, until i18n lands in M3. */
const titleOf = (p: Practice): string => p.title.en ?? p.id;

export function ChantScreen() {
  useKeepAwake();
  const [practice, setPractice] = useState<Practice>(DEFAULT_PRACTICE);
  // The version is part of the key: a content update keeps the practice id
  // but may change the words, and stale word-tap state would then point at
  // names that are no longer there.
  return (
    <ChantSession
      key={`${practice.id}@${practice.version}`}
      practice={practice}
      onChangePractice={setPractice}
    />
  );
}

function ChantSession({
  practice,
  onChangePractice,
}: {
  practice: Practice;
  onChangePractice: (p: Practice) => void;
}) {
  // P1 mantras are a single step; namavalis arrive with the catalog in M4.
  const step = practice.steps[0]!;
  // `Step.words` is nullable: a namavali has none, and a mantra need not be
  // segmented. Word-by-word needs them, so it is only offered when they exist.
  const words = step.words?.latin ?? [];
  const hasWords = words.length > 0;
  const modes: readonly Mode[] = hasWords ? ['mala_tap', 'word_tap'] : ['mala_tap'];
  const roundSize = practice.default_round;

  const { total, progress, addRepetitions } = useChantSession(practice);
  const [mode, setMode] = useState<Mode>('mala_tap');
  const [wordState, setWordState] = useState(() => (hasWords ? createWordTapState(words) : null));
  const [offeringDue, setOfferingDue] = useState(false);

  function countOne(fromMode: Mode) {
    const next = roundProgress(total + 1, roundSize);
    addRepetitions(fromMode);
    beadFeedback(next.at_meru);
    if (next.at_meru) setOfferingDue(true);
  }

  function onWordTap(index: number) {
    if (wordState === null) return;
    const result = tapWord(wordState, index);
    setWordState(result.state);
    if (result.completed) countOne('word_tap');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        {PRACTICES.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected: p.id === practice.id }}
            onPress={() => onChangePractice(p)}
            style={[styles.chip, p.id === practice.id && styles.chipSelected]}
          >
            <Text style={[styles.chipText, p.id === practice.id && styles.chipTextSelected]}>
              {titleOf(p)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.header}>
        {step.text.devanagari ? (
          <Text style={styles.devanagari}>{step.text.devanagari}</Text>
        ) : null}
        <Text style={styles.latin}>{step.text.latin ?? titleOf(practice)}</Text>
      </View>

      <View style={styles.counter}>
        <Text style={styles.count} accessibilityLabel={`Count ${total}`} testID="count">
          {total}
        </Text>
        <Text style={styles.roundInfo}>
          Mala {progress.completed_rounds + 1} · Bead {progress.bead} / {roundSize}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(progress.bead / roundSize) * 100}%` }]} />
        </View>
      </View>

      {offeringDue ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOfferingDue(false)}
          style={styles.offering}
        >
          <Text style={styles.offeringTitle}>Mala complete</Text>
          <Text style={styles.offeringText}>Tap to offer this round</Text>
        </Pressable>
      ) : null}

      <View style={styles.modes}>
        {modes.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected: m === mode }}
            onPress={() => setMode(m)}
            style={[styles.modeButton, m === mode && styles.modeButtonSelected]}
          >
            <Text style={[styles.modeText, m === mode && styles.modeTextSelected]}>
              {MODE_LABELS[m]}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'mala_tap' || wordState === null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Count one repetition"
          testID="tap-area"
          onPress={() => countOne('mala_tap')}
          style={({ pressed }) => [styles.tapArea, pressed && styles.tapAreaPressed]}
        >
          <Text style={styles.tapHint}>Tap anywhere here</Text>
        </Pressable>
      ) : (
        <View style={styles.words}>
          {words.map((word, i) => {
            const done = i < wordState.next_index;
            const next = i === wordState.next_index;
            return (
              <Pressable
                key={`${word}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={word}
                testID={`word-${i}`}
                onPress={() => onWordTap(i)}
                style={[styles.word, next && styles.wordNext, done && styles.wordDone]}
              >
                <Text style={[styles.wordText, next && styles.wordTextNext]}>{word}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  chipRow: { flexGrow: 0, marginTop: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 14 },
  chipTextSelected: { color: colors.accent, fontWeight: '600' },
  header: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
  devanagari: { color: colors.accent, fontSize: 28, textAlign: 'center' },
  latin: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },
  counter: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm },
  count: { color: colors.text, fontSize: 72, fontWeight: '300', fontVariant: ['tabular-nums'] },
  roundInfo: { color: colors.textMuted, fontSize: 15, fontVariant: ['tabular-nums'] },
  track: {
    width: '80%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
  offering: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
  },
  offeringTitle: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  offeringText: { color: colors.text, fontSize: 14, marginTop: spacing.xs },
  modes: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 999,
    padding: spacing.xs,
  },
  modeButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999 },
  modeButtonSelected: { backgroundColor: colors.surfaceRaised },
  modeText: { color: colors.textMuted, fontSize: 14 },
  modeTextSelected: { color: colors.text, fontWeight: '600' },
  tapArea: {
    flex: 1,
    marginVertical: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapAreaPressed: { backgroundColor: colors.surfaceRaised },
  tapHint: { color: colors.textMuted, fontSize: 15 },
  words: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  word: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 72,
    alignItems: 'center',
  },
  wordNext: { backgroundColor: colors.accent, borderColor: colors.accent },
  wordDone: { opacity: 0.45 },
  wordText: { color: colors.textMuted, fontSize: 17 },
  wordTextNext: { color: colors.onAccent, fontWeight: '700' },
});
