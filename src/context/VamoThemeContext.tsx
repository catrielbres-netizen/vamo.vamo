'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { doc, updateDoc } from 'firebase/firestore';
import { 
  VAMO_THEMES, 
  UserUiPreferences, 
  VamoTheme, 
  CustomThemeConfig, 
  hexToRgb, 
  hexToHslChannels,
  GLOW_VALUES, 
  RADIUS_VALUES, 
  DENSITY_PADDING, 
  TEXTURE_TEMPLATES,
  isColorLight,
  normalizeTheme,
  validateThemeCombination,
  applyThemeVariables
} from '../lib/themes/vamo-themes';

interface VamoThemeContextProps {
  preferences: UserUiPreferences;
  activeTheme: VamoTheme;
  customConfig: CustomThemeConfig;
  isLoading: boolean;
  applyTheme: (themeId: string, customConfig?: CustomThemeConfig) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

const VamoThemeContext = createContext<VamoThemeContextProps | undefined>(undefined);

const DEFAULT_PREFERENCES: UserUiPreferences = {
  themeId: 'vamo-classic',
  customTheme: {
    texture: 'none',
    glowIntensity: 'medium',
    radius: 'medium',
    density: 'normal'
  }
};

export function VamoThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, firestore } = useUser();
  const [preferences, setPreferences] = useState<UserUiPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from LocalStorage (Sync to avoid hydration flash)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('vamo-ui-preferences');
        if (saved) {
          setPreferences(JSON.parse(saved));
        }
      } catch (e) {
        console.warn('Failed to load theme from localStorage', e);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  // Listen to Firestore profile updates (Fase 1 / persistent)
  useEffect(() => {
    if (profile && (profile as any).uiPreferences) {
      const dbPrefs = (profile as any).uiPreferences as UserUiPreferences;
      setPreferences(dbPrefs);
      if (typeof window !== 'undefined') {
        localStorage.setItem('vamo-ui-preferences', JSON.stringify(dbPrefs));
      }
    }
  }, [profile]);

  // Compute active theme and config
  const activeTheme = useMemo(() => {
    const baseTheme = VAMO_THEMES.find(t => t.id === preferences.themeId) || VAMO_THEMES[0];
    const custom = preferences.customTheme || {};
    
    // Construct a merged temporary theme configuration
    const merged: Partial<VamoTheme> = {
      ...baseTheme,
      primary: custom.primary || baseTheme.primary,
      secondary: custom.secondary || baseTheme.secondary,
      accent: custom.accent || baseTheme.accent,
    };
    
    // Normalize to compute optimal readability contrasts
    return normalizeTheme(merged);
  }, [preferences.themeId, preferences.customTheme]);

  const customConfig = useMemo(() => {
    const config = preferences.customTheme || {};
    const texture = config.texture || 'none';
    
    // Safety check: ensure texture matches theme visibility
    const { correctedTexture } = validateThemeCombination(activeTheme, texture);
    
    return {
      ...config,
      texture: correctedTexture,
    };
  }, [preferences.customTheme, activeTheme]);

  // Dynamically apply CSS variables to the document root
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    
    // Inject dynamic theme transitions styles if not present
    let styleTag = document.getElementById('vamo-theme-transition-sheet');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'vamo-theme-transition-sheet';
      styleTag.innerHTML = `
        .vamo-theme-changing,
        .vamo-theme-changing * {
          transition: background-color 0.4s ease, border-color 0.4s ease, color 0.4s ease, box-shadow 0.4s ease, border-radius 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
      `;
      document.head.appendChild(styleTag);
    }

    // Trigger transition class
    root.classList.add('vamo-theme-changing');

    // Resolve, normalize, and apply the theme colors to documentElement
    applyThemeVariables(activeTheme, root);

    // Shadows & Glows
    const intensity = customConfig.glowIntensity || 'medium';
    root.style.setProperty('--vamo-glow', activeTheme.glow);
    root.style.setProperty('--vamo-glow-shadow', GLOW_VALUES[intensity]);

    // Border styling
    const borderStyle = customConfig.radius || 'medium';
    root.style.setProperty('--radius', RADIUS_VALUES[borderStyle]);
    root.style.setProperty('--vamo-radius', RADIUS_VALUES[borderStyle]);

    // Layout Padding and spacing
    const density = customConfig.density || 'normal';
    const padding = DENSITY_PADDING[density];
    root.style.setProperty('--vamo-padding', padding.p);
    root.style.setProperty('--vamo-gap', padding.gap);

    // Background textures
    const texture = customConfig.texture || 'none';
    const textureValue = TEXTURE_TEMPLATES[texture];
    
    if (texture === 'none') {
      root.style.setProperty('--vamo-texture-bg', 'none');
      root.style.setProperty('--vamo-texture-size', 'auto');
      root.style.setProperty('--vamo-texture-position', '0 0');
    } else if (texture === 'subtle-grid') {
      root.style.setProperty('--vamo-texture-bg', textureValue);
      root.style.setProperty('--vamo-texture-size', '40px 40px');
      root.style.setProperty('--vamo-texture-position', '0 0');
    } else if (texture === 'carbon') {
      root.style.setProperty('--vamo-texture-bg', 'radial-gradient(rgba(255,255,255,0.015) 15%, transparent 20%), radial-gradient(rgba(255,255,255,0.015) 15%, transparent 20%)');
      root.style.setProperty('--vamo-texture-size', '12px 12px');
      root.style.setProperty('--vamo-texture-position', '0 0, 6px 6px');
    } else {
      root.style.setProperty('--vamo-texture-bg', textureValue);
      root.style.setProperty('--vamo-texture-size', 'auto');
      root.style.setProperty('--vamo-texture-position', '0 0');
    }

    // Set document mode class for light/dark global elements
    if (activeTheme.mode === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    }

    // Clean transition class
    const timer = setTimeout(() => {
      root.classList.remove('vamo-theme-changing');
    }, 400);

    return () => clearTimeout(timer);
  }, [activeTheme, customConfig]);


  const applyTheme = async (themeId: string, config: CustomThemeConfig = {}) => {
    const updated: UserUiPreferences = {
      themeId,
      customTheme: config,
      updatedAt: Date.now()
    };

    // 1. Update state instantly
    setPreferences(updated);

    // 2. Persist in local storage
    if (typeof window !== 'undefined') {
      localStorage.setItem('vamo-ui-preferences', JSON.stringify(updated));
    }

    // 3. Persist in Firestore profile document if logged in
    if (user && firestore) {
      try {
        const userRef = doc(firestore, 'users', user.uid);
        await updateDoc(userRef, {
          uiPreferences: updated
        });
        console.log('[THEME_PERSIST] Custom preferences synced to user profile in Firestore.');
      } catch (err) {
        console.error('Failed to sync theme preferences to Firestore', err);
      }
    }
  };

  const resetToDefault = async () => {
    await applyTheme('vamo-classic', DEFAULT_PREFERENCES.customTheme);
  };

  const value = useMemo(() => ({
    preferences,
    activeTheme,
    customConfig,
    isLoading,
    applyTheme,
    resetToDefault
  }), [preferences, activeTheme, customConfig, isLoading]);

  return (
    <VamoThemeContext.Provider value={value}>
      {children}
    </VamoThemeContext.Provider>
  );
}

export const useVamoTheme = () => {
  const context = useContext(VamoThemeContext);
  if (!context) {
    throw new Error('useVamoTheme must be used within a VamoThemeProvider');
  }
  return context;
};
