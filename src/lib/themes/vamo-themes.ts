export type ThemeMode = 'dark' | 'light';

export interface VamoTheme {
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceSoft: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  glow: string;
}

export type VisualTexture =
  | 'none'
  | 'subtle-grid'
  | 'soft-gradient'
  | 'glass'
  | 'carbon'
  | 'radial-glow'
  | 'premium-noise'
  | 'map-dark';

export type BorderStyle = 'soft' | 'medium' | 'rounded';
export type LayoutDensity = 'compact' | 'normal' | 'comfortable';
export type GlowIntensity = 'low' | 'medium' | 'high';

export interface CustomThemeConfig {
  primary?: string;
  secondary?: string;
  accent?: string;
  texture?: VisualTexture;
  glowIntensity?: GlowIntensity;
  radius?: BorderStyle;
  density?: LayoutDensity;
}

export interface UserUiPreferences {
  themeId: string;
  customTheme?: CustomThemeConfig;
  updatedAt?: number;
}

export const VAMO_THEMES: VamoTheme[] = [
  {
    id: 'vamo-classic',
    name: 'VamO Clásico',
    description: 'El diseño oficial y original de VamO con fondo negro y acentos índigo y esmeralda.',
    mode: 'dark',
    primary: '#4f46e5', // indigo-600
    secondary: '#3b82f6', // blue-500
    accent: '#10b981', // emerald-500
    background: '#05070c',
    surface: '#0e111a',
    surfaceSoft: '#171c2a',
    text: '#f9fafb',
    textMuted: '#9ca3af',
    border: '#1f2937',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    glow: 'rgba(79, 70, 229, 0.45)',
  },
  {
    id: 'emerald-night',
    name: 'Esmeralda Nocturno',
    description: 'Tonos verdes profundos y elegantes inspirados en la sustentabilidad de Rawson.',
    mode: 'dark',
    primary: '#059669', // emerald-600
    secondary: '#0ea5e9', // sky-500
    accent: '#10b981', // green-500
    background: '#040806',
    surface: '#0c1410',
    surfaceSoft: '#14221b',
    text: '#f9fafb',
    textMuted: '#9ca3af',
    border: '#1e2e25',
    success: '#059669',
    warning: '#f59e0b',
    danger: '#ef4444',
    glow: 'rgba(5, 150, 105, 0.4)',
  },
  {
    id: 'royal-purple',
    name: 'Violeta Premium',
    description: 'Fondo místico, toques de rosa neón y violeta para una presencia de marca sofisticada.',
    mode: 'dark',
    primary: '#7c3aed', // violet-600
    secondary: '#ec4899', // pink-500
    accent: '#f43f5e', // rose-500
    background: '#07050f',
    surface: '#130f22',
    surfaceSoft: '#1f1936',
    text: '#f9fafb',
    textMuted: '#a78bfa',
    border: '#291e47',
    success: '#10b981',
    warning: '#eab308',
    danger: '#ef4444',
    glow: 'rgba(124, 58, 237, 0.45)',
  },
  {
    id: 'ocean-blue',
    name: 'Azul Profundo',
    description: 'El azul corporativo de alta confiabilidad y calma oceánica.',
    mode: 'dark',
    primary: '#2563eb', // blue-600
    secondary: '#06b6d4', // cyan-500
    accent: '#f59e0b', // amber-500
    background: '#030712',
    surface: '#0f172a',
    surfaceSoft: '#1e293b',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    border: '#334155',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    glow: 'rgba(37, 99, 235, 0.4)',
  },
  {
    id: 'amber-energy',
    name: 'Naranja Energía',
    description: 'Diseño enérgico y deportivo de alta visibilidad y dinamismo.',
    mode: 'dark',
    primary: '#ea580c', // orange-600
    secondary: '#eab308', // yellow-500
    accent: '#3b82f6', // blue-500
    background: '#0b0704',
    surface: '#18110b',
    surfaceSoft: '#261a10',
    text: '#fdf8f6',
    textMuted: '#d97706',
    border: '#352112',
    success: '#10b981',
    warning: '#ea580c',
    danger: '#ef4444',
    glow: 'rgba(234, 88, 12, 0.4)',
  },
  {
    id: 'graphite',
    name: 'Grafito Ejecutivo',
    description: 'Negro mate y gris grafito de perfil elegante, corporativo y profesional.',
    mode: 'dark',
    primary: '#4b5563', // gray-600
    secondary: '#1f2937', // gray-800
    accent: '#6b7280', // gray-500
    background: '#0b0f19',
    surface: '#111827',
    surfaceSoft: '#1f2937',
    text: '#f9fafb',
    textMuted: '#9ca3af',
    border: '#374151',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    glow: 'rgba(75, 85, 99, 0.4)',
  },
  {
    id: 'high-contrast',
    name: 'Alto Contraste',
    description: 'Blanco y negro absoluto con acentos limpios para personas con visión reducida.',
    mode: 'dark',
    primary: '#ffffff',
    secondary: '#000000',
    accent: '#ffff00',
    background: '#000000',
    surface: '#0a0a0a',
    surfaceSoft: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#e5e5e5',
    border: '#ffffff',
    success: '#00ff00',
    warning: '#ffff00',
    danger: '#ff0000',
    glow: 'rgba(255, 255, 255, 0.6)',
  },
  {
    id: 'soft-light',
    name: 'Claro Suave',
    description: 'Estilo luminoso, limpio y descansado con base clara y sombras sutiles.',
    mode: 'light',
    primary: '#4f46e5',
    secondary: '#6366f1',
    accent: '#0d9488',
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceSoft: '#f1f5f9',
    text: '#0f172a',
    textMuted: '#475569',
    border: '#e2e8f0',
    success: '#0d9488',
    warning: '#d97706',
    danger: '#e11d48',
    glow: 'rgba(79, 70, 229, 0.25)',
  },
];

export const TEXTURE_TEMPLATES: Record<VisualTexture, string> = {
  none: 'none',
  'subtle-grid': 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
  'soft-gradient': 'linear-gradient(135deg, rgba(var(--vamo-primary-rgb), 0.05) 0%, transparent 50%, rgba(var(--vamo-secondary-rgb), 0.05) 100%)',
  glass: 'radial-gradient(circle at top right, rgba(255,255,255,0.03), transparent 60%)',
  carbon: 'radial-gradient(rgba(0,0,0,0.3) 15%, transparent 20%), radial-gradient(rgba(0,0,0,0.3) 15%, transparent 20%)',
  'radial-glow': 'radial-gradient(circle at center, rgba(var(--vamo-primary-rgb), 0.08) 0%, transparent 65%)',
  'premium-noise': 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.02), transparent)',
  'map-dark': 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, transparent 100%)',
};

export const RADIUS_VALUES: Record<BorderStyle, string> = {
  soft: '4px',
  medium: '10px',
  rounded: '20px',
};

export const DENSITY_PADDING: Record<LayoutDensity, { p: string; gap: string }> = {
  compact: { p: '0.5rem', gap: '0.5rem' },
  normal: { p: '1rem', gap: '1rem' },
  comfortable: { p: '1.5rem', gap: '1.5rem' },
};

export const GLOW_VALUES: Record<GlowIntensity, string> = {
  low: '0px 2px 4px rgba(0,0,0,0.1)',
  medium: '0 4px 20px var(--vamo-glow)',
  high: '0 8px 35px var(--vamo-glow), 0 0 15px rgba(var(--vamo-primary-rgb), 0.35)',
};

// Helper to convert hex to rgb triplet
export function hexToRgb(hex: string): string {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '79, 70, 229'; // fallback to indigo
}

// Helper to convert hex to HSL channel values (e.g. "243 75% 59%") for Tailwind
export function hexToHslChannels(hex: string): string {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b).replace(/^#/, '');
  const r = parseInt(fullHex.substring(0, 2), 16) / 255;
  const g = parseInt(fullHex.substring(2, 4), 16) / 255;
  const b = parseInt(fullHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Helper to determine if a hex color is light or dark
export function isColorLight(hex: string): boolean {
  const cleanHex = hex.replace(/^#/, '');
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return false;
  const shorthandRegex = /^([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = cleanHex.length === 3 ? cleanHex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b) : cleanHex;
  const r = parseInt(fullHex.substring(0, 2), 16);
  const g = parseInt(fullHex.substring(2, 4), 16);
  const b = parseInt(fullHex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// 1. getReadableTextColor: returns a readable high-contrast text color
export function getReadableTextColor(backgroundColor: string): string {
  return isColorLight(backgroundColor) ? '#09090b' : '#ffffff';
}

// 2. normalizeTheme: completes missing theme properties with secure fallback values
export function normalizeTheme(theme: Partial<VamoTheme>): VamoTheme {
  const fallback = VAMO_THEMES[0]; // vamo-classic
  const background = theme.background || fallback.background;
  const isLight = theme.mode === 'light' || (theme.mode === undefined && isColorLight(background));
  
  const text = theme.text || (isLight ? '#0f172a' : '#f9fafb');
  const textMuted = theme.textMuted || (isLight ? '#475569' : '#9ca3af');
  const border = theme.border || (isLight ? '#e2e8f0' : '#1f2937');
  const surface = theme.surface || (isLight ? '#ffffff' : '#0e111a');
  const surfaceSoft = theme.surfaceSoft || (isLight ? '#f1f5f9' : '#171c2a');
  const primary = theme.primary || fallback.primary;
  
  return {
    id: theme.id || 'custom-theme',
    name: theme.name || 'Personalizado',
    description: theme.description || 'Tema personalizado por el usuario',
    mode: isLight ? 'light' : 'dark',
    primary,
    secondary: theme.secondary || fallback.secondary,
    accent: theme.accent || fallback.accent,
    background,
    surface,
    surfaceSoft,
    text,
    textMuted,
    border,
    success: theme.success || fallback.success,
    warning: theme.warning || fallback.warning,
    danger: theme.danger || fallback.danger,
    glow: theme.glow || `rgba(${hexToRgb(primary)}, 0.45)`,
  };
}

// 3. validateThemeCombination: detects combinations that impair readability and adjusts texture
export function validateThemeCombination(theme: VamoTheme, texture: VisualTexture): { valid: boolean; correctedTexture: VisualTexture } {
  // If theme is in light mode or has a light background, carbon and map-dark are illegible
  if (theme.mode === 'light' || isColorLight(theme.background)) {
    if (texture === 'carbon' || texture === 'map-dark') {
      return { valid: false, correctedTexture: 'soft-gradient' };
    }
  }
  return { valid: true, correctedTexture: texture };
}

// 4. applyThemeVariables: injects all required variables into the specified target element or :root
export function applyThemeVariables(theme: VamoTheme, element?: HTMLElement): void {
  const target = element || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!target) return;

  const pColor = theme.primary;
  const sColor = theme.secondary;
  const aColor = theme.accent;

  // Apply base VamO variables
  target.style.setProperty('--vamo-bg', theme.background);
  target.style.setProperty('--vamo-bg-soft', theme.surfaceSoft);
  target.style.setProperty('--vamo-surface', theme.surface);
  target.style.setProperty('--vamo-surface-soft', theme.surfaceSoft);
  target.style.setProperty('--vamo-card', theme.surface);
  target.style.setProperty('--vamo-card-muted', theme.surfaceSoft);
  target.style.setProperty('--vamo-primary', pColor);
  target.style.setProperty('--vamo-secondary', sColor);
  target.style.setProperty('--vamo-accent', aColor);
  target.style.setProperty('--vamo-success', theme.success);
  target.style.setProperty('--vamo-warning', theme.warning);
  target.style.setProperty('--vamo-danger', theme.danger);
  target.style.setProperty('--vamo-text', theme.text);
  target.style.setProperty('--vamo-text-muted', theme.textMuted);
  target.style.setProperty('--vamo-border', theme.border);
  target.style.setProperty('--vamo-ring', pColor);
  target.style.setProperty('--vamo-glow', theme.glow);

  // RGB values for overlays
  target.style.setProperty('--vamo-primary-rgb', hexToRgb(pColor));
  target.style.setProperty('--vamo-secondary-rgb', hexToRgb(sColor));

  // Tailwind HSL channel mappings
  target.style.setProperty('--background', hexToHslChannels(theme.background));
  target.style.setProperty('--foreground', hexToHslChannels(theme.text));
  target.style.setProperty('--card', hexToHslChannels(theme.surface));
  target.style.setProperty('--card-foreground', hexToHslChannels(theme.text));
  target.style.setProperty('--popover', hexToHslChannels(theme.surface));
  target.style.setProperty('--popover-foreground', hexToHslChannels(theme.text));
  target.style.setProperty('--primary', hexToHslChannels(pColor));
  target.style.setProperty('--secondary', hexToHslChannels(sColor));
  target.style.setProperty('--accent', hexToHslChannels(aColor));
  target.style.setProperty('--border', hexToHslChannels(theme.border));
  target.style.setProperty('--input', hexToHslChannels(theme.border));
  target.style.setProperty('--ring', hexToHslChannels(pColor));
  target.style.setProperty('--muted', hexToHslChannels(theme.surfaceSoft));
  target.style.setProperty('--muted-foreground', hexToHslChannels(theme.textMuted));
  target.style.setProperty('--destructive', hexToHslChannels(theme.danger));

  const primaryFgHsl = isColorLight(pColor) ? '240 5.9% 10%' : '0 0% 98%';
  const secondaryFgHsl = isColorLight(sColor) ? '240 5.9% 10%' : '0 0% 98%';
  const accentFgHsl = isColorLight(aColor) ? '240 5.9% 10%' : '0 0% 98%';
  const destructiveFgHsl = isColorLight(theme.danger) ? '240 5.9% 10%' : '0 0% 98%';

  target.style.setProperty('--primary-foreground', primaryFgHsl);
  target.style.setProperty('--secondary-foreground', secondaryFgHsl);
  target.style.setProperty('--accent-foreground', accentFgHsl);
  target.style.setProperty('--destructive-foreground', destructiveFgHsl);
}

// 5. generateThemePreview: generates the exact inline style properties mapping for dynamic theme previews
export function generateThemePreview(theme: VamoTheme): Record<string, string> {
  const pColor = theme.primary;
  const sColor = theme.secondary;
  const aColor = theme.accent;
  
  return {
    '--background': hexToHslChannels(theme.background),
    '--foreground': hexToHslChannels(theme.text),
    '--card': hexToHslChannels(theme.surface),
    '--card-foreground': hexToHslChannels(theme.text),
    '--primary': hexToHslChannels(pColor),
    '--secondary': hexToHslChannels(sColor),
    '--accent': hexToHslChannels(aColor),
    '--border': hexToHslChannels(theme.border),
    '--muted': hexToHslChannels(theme.surfaceSoft),
    '--muted-foreground': hexToHslChannels(theme.textMuted),
    
    // Scoped VamO variables
    '--vamo-bg': theme.background,
    '--vamo-bg-soft': theme.surfaceSoft,
    '--vamo-surface': theme.surface,
    '--vamo-surface-soft': theme.surfaceSoft,
    '--vamo-card': theme.surface,
    '--vamo-card-muted': theme.surfaceSoft,
    '--vamo-primary': pColor,
    '--vamo-secondary': sColor,
    '--vamo-accent': aColor,
    '--vamo-text': theme.text,
    '--vamo-text-muted': theme.textMuted,
    '--vamo-border': theme.border,
  } as Record<string, string>;
}


