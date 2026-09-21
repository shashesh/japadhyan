import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type Mantra,
  STARTER_MANTRAS,
  createWordTapState,
  roundProgress,
  tapWord,
} from '@naam-japam/shared';
import { colors, spacing } from '@/theme';
import { beadFeedback } from './feedback';
import { useChantSession } from './useChantSession';

type Mode = 'mala_tap' | 'word_tap';

const MODE_LABELS: Record<Mode, string> = {
  mala_tap: 'Mala tap',
  word_tap: 'Word by word',
};

const DEFAULT_MANTRA = STARTER_MANTRAS[0]!;

export function ChantScreen() {
  useKeepAwake();
  const [mantra, setMantra] = useState<Mantra>(DEFAULT_MANTRA);
  return <ChantSession key={mantra.id} mantra={mantra} onChangeMantra={setMantra} />;
}

function ChantSession({
  mantra,
  onChangeMantra,
}: {
  mantra: Mantra;
  onChangeMantra: (m: Mantra) => void;
}) {
  const { total, progress, addRepetitions } = useChantSession(mantra);
  const [mode, setMode] = useState<Mode>('mala_tap');
  const [wordState, setWordState] = useState(() => createWordTapState(mantra.words));
  const [offeringDue, setOfferingDue] = useState(false);

  function countOne(fromMode: Mode) {
    const next = roundProgress(total + 1, mantra.round_size);
    addRepetitions(fromMode);
    beadFeedback(next.at_meru);
    if (next.at_meru) setOfferingDue(true);
  }

  function onWordTap(index: number) {
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
        {STARTER_MANTRAS.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityState={{ selected: m.id === mantra.id }}
            onPress={() => onChangeMantra(m)}
            style={[styles.chip, m.id === mantra.id && styles.chipSelected]}
          >
            <Text style={[styles.chipText, m.id === mantra.id && styles.chipTextSelected]}>
              {m.deity ?? m.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.header}>
        {mantra.text.devanagari ? (
          <Text style={styles.devanagari}>{mantra.text.devanagari}</Text>
        ) : null}
        <Text style={styles.latin}>{mantra.text.latin ?? mantra.title}</Text>
      </View>

      <View style={styles.counter}>
        <Text style={styles.count} accessibilityLabel={`Count ${total}`} testID="count">
          {total}
        </Text>
        <Text style={styles.roundInfo}>
          Mala {progress.completed_rounds + 1} · Bead {progress.bead} / {mantra.round_size}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(progress.bead / mantra.round_size) * 100}%` }]} />
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
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
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

      {mode === 'mala_tap' ? (
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
          {mantra.words.map((word, i) => {
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
