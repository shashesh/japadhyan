/**
 * Session colours. The chanting screen is dark and quiet by design
 * (docs/product/features/session-experience.md).
 */
export const colors = {
  background: '#0f1117',
  surface: '#1a1d27',
  surfaceRaised: '#242836',
  text: '#eceef4',
  textMuted: '#9aa1b5',
  accent: '#f0aa3c',
  accentSoft: '#3a2a10',
  onAccent: '#1b1407',
  success: '#7fcca2',
  border: '#2c3142',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
