import type { Practice } from '../types';

/**
 * **Development fixtures only — delete in M6.**
 *
 * Catalog content belongs in `content/` and reaches the app as signed packs
 * ([content-pipeline](../../../../docs/architecture/content-pipeline.md)).
 * Until the pipeline (M2) and the on-device catalog (M3) exist, the app needs
 * something to chant, so these few practices stand in. They are unreviewed
 * (`review: null`) and must never ship in a production build.
 *
 * See docs/plans/active/2026-09-21-phase-1-plan.md — M6 removes this file.
 */
export const DEV_PRACTICES: readonly Practice[] = [
  {
    id: 'om-namah-shivaya',
    version: 1,
    tradition_id: 'hindu',
    kind: 'mantra',
    deity_ids: ['shiva'],
    title: { en: 'Om Namah Shivaya' },
    subtitle: {},
    source_script: 'devanagari',
    steps: [
      {
        text: { devanagari: 'ॐ नमः शिवाय', latin: 'Om Namah Shivaya' },
        words: { latin: ['Om', 'Namah', 'Shivaya'] },
        name: null,
        meaning: null,
        audio_start_ms: null,
        audio_end_ms: null,
      },
    ],
    default_round: 108,
    repetition_word: { en: 'japa' },
    intro: { en: 'Salutations to Shiva.' },
    audio: null,
    source: 'Development fixture',
    licence: 'Unreviewed development content',
    review: null,
  },
  {
    id: 'sri-ram-jai-ram',
    version: 1,
    tradition_id: 'hindu',
    kind: 'mantra',
    deity_ids: ['ram'],
    title: { en: 'Sri Ram Jai Ram' },
    subtitle: {},
    source_script: 'devanagari',
    steps: [
      {
        text: {
          devanagari: 'श्री राम जय राम जय जय राम',
          latin: 'Sri Ram Jai Ram Jai Jai Ram',
        },
        words: { latin: ['Sri', 'Ram', 'Jai', 'Ram', 'Jai', 'Jai', 'Ram'] },
        name: null,
        meaning: null,
        audio_start_ms: null,
        audio_end_ms: null,
      },
    ],
    default_round: 108,
    repetition_word: { en: 'japa' },
    intro: { en: 'Victory to Lord Ram.' },
    audio: null,
    source: 'Development fixture',
    licence: 'Unreviewed development content',
    review: null,
  },
  {
    id: 'hare-krishna',
    version: 1,
    tradition_id: 'hindu',
    kind: 'mantra',
    deity_ids: ['krishna', 'ram'],
    title: { en: 'Hare Krishna Maha-mantra' },
    subtitle: {},
    source_script: 'devanagari',
    steps: [
      {
        text: {
          devanagari: 'हरे कृष्ण हरे कृष्ण कृष्ण कृष्ण हरे हरे हरे राम हरे राम राम राम हरे हरे',
          latin:
            'Hare Krishna Hare Krishna Krishna Krishna Hare Hare Hare Rama Hare Rama Rama Rama Hare Hare',
        },
        words: {
          latin: [
            'Hare',
            'Krishna',
            'Hare',
            'Krishna',
            'Krishna',
            'Krishna',
            'Hare',
            'Hare',
            'Hare',
            'Rama',
            'Hare',
            'Rama',
            'Rama',
            'Rama',
            'Hare',
            'Hare',
          ],
        },
        name: null,
        meaning: null,
        audio_start_ms: null,
        audio_end_ms: null,
      },
    ],
    default_round: 108,
    repetition_word: { en: 'japa' },
    intro: { en: 'A call to the divine names Hare, Krishna and Rama.' },
    audio: null,
    source: 'Development fixture',
    licence: 'Unreviewed development content',
    review: null,
  },
  {
    id: 'om-gam-ganapataye',
    version: 1,
    tradition_id: 'hindu',
    kind: 'mantra',
    deity_ids: ['ganesh'],
    title: { en: 'Om Gam Ganapataye Namaha' },
    subtitle: {},
    source_script: 'devanagari',
    steps: [
      {
        text: { devanagari: 'ॐ गं गणपतये नमः', latin: 'Om Gam Ganapataye Namaha' },
        words: { latin: ['Om', 'Gam', 'Ganapataye', 'Namaha'] },
        name: null,
        meaning: null,
        audio_start_ms: null,
        audio_end_ms: null,
      },
    ],
    default_round: 108,
    repetition_word: { en: 'japa' },
    intro: { en: 'Salutations to Ganesh, remover of obstacles.' },
    audio: null,
    source: 'Development fixture',
    licence: 'Unreviewed development content',
    review: null,
  },
  {
    id: 'aum-sri-sai-ram',
    version: 1,
    tradition_id: 'hindu',
    kind: 'mantra',
    deity_ids: ['sai-baba'],
    title: { en: 'Aum Sri Sai Ram' },
    subtitle: {},
    source_script: 'devanagari',
    steps: [
      {
        text: { devanagari: 'ॐ श्री साई राम', latin: 'Aum Sri Sai Ram' },
        words: { latin: ['Aum', 'Sri', 'Sai', 'Ram'] },
        name: null,
        meaning: null,
        audio_start_ms: null,
        audio_end_ms: null,
      },
    ],
    default_round: 108,
    repetition_word: { en: 'japa' },
    intro: { en: 'Salutations to Sai.' },
    audio: null,
    source: 'Development fixture',
    licence: 'Unreviewed development content',
    review: null,
  },
];

/** Round sizes offered in settings: mala, half, quarter, and 33 for other traditions. */
export const ROUND_SIZE_OPTIONS = [108, 54, 27, 33] as const;
