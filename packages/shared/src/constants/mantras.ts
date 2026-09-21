import type { Mantra } from '../types';

/**
 * Starter mantras for development. The launch library (10-15 deities, with
 * audio and more scripts) must be reviewed by a qualified advisor first.
 * See docs/product/features/mantra-library.md.
 */
export const STARTER_MANTRAS: readonly Mantra[] = [
  {
    id: 'om-namah-shivaya',
    tradition: 'hindu',
    deity: 'Shiva',
    title: 'Om Namah Shivaya',
    text: { devanagari: 'ॐ नमः शिवाय', latin: 'Om Namah Shivaya' },
    words: ['Om', 'Namah', 'Shivaya'],
    round_size: 108,
    is_private: false,
    meaning: 'Salutations to Shiva.',
  },
  {
    id: 'sri-ram-jai-ram',
    tradition: 'hindu',
    deity: 'Ram',
    title: 'Sri Ram Jai Ram',
    text: { devanagari: 'श्री राम जय राम जय जय राम', latin: 'Sri Ram Jai Ram Jai Jai Ram' },
    words: ['Sri', 'Ram', 'Jai', 'Ram', 'Jai', 'Jai', 'Ram'],
    round_size: 108,
    is_private: false,
    meaning: 'Victory to Lord Ram.',
  },
  {
    id: 'hare-krishna',
    tradition: 'hindu',
    deity: 'Krishna',
    title: 'Hare Krishna Maha-mantra',
    text: {
      devanagari: 'हरे कृष्ण हरे कृष्ण कृष्ण कृष्ण हरे हरे हरे राम हरे राम राम राम हरे हरे',
      latin:
        'Hare Krishna Hare Krishna Krishna Krishna Hare Hare Hare Rama Hare Rama Rama Rama Hare Hare',
    },
    words: [
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
    round_size: 108,
    is_private: false,
    meaning: 'A call to the divine names Hare, Krishna and Rama.',
  },
  {
    id: 'om-gam-ganapataye',
    tradition: 'hindu',
    deity: 'Ganesh',
    title: 'Om Gam Ganapataye Namaha',
    text: { devanagari: 'ॐ गं गणपतये नमः', latin: 'Om Gam Ganapataye Namaha' },
    words: ['Om', 'Gam', 'Ganapataye', 'Namaha'],
    round_size: 108,
    is_private: false,
    meaning: 'Salutations to Ganesh, remover of obstacles.',
  },
  {
    id: 'aum-sri-sai-ram',
    tradition: 'hindu',
    deity: 'Sai Baba',
    title: 'Aum Sri Sai Ram',
    text: { devanagari: 'ॐ श्री साई राम', latin: 'Aum Sri Sai Ram' },
    words: ['Aum', 'Sri', 'Sai', 'Ram'],
    round_size: 108,
    is_private: false,
    meaning: 'Salutations to Sai.',
  },
];

/** Round sizes offered in settings: mala, half, quarter, and 33 for other traditions. */
export const ROUND_SIZE_OPTIONS = [108, 54, 27, 33] as const;
