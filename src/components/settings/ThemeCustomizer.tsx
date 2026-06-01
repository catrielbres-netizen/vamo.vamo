'use client';

import React, { useState } from 'react';
import { useVamoTheme } from '@/context/VamoThemeContext';
import { 
  VAMO_THEMES, 
  VisualTexture, 
  BorderStyle, 
  LayoutDensity, 
  GlowIntensity,
  CustomThemeConfig,
  normalizeTheme,
  validateThemeCombination,
  getReadableTextColor,
  VamoTheme,
  TEXTURE_TEMPLATES
} from '@/lib/themes/vamo-themes';
import { cn } from '@/lib/utils';
import { 
  Palette, 
  Check, 
  RotateCcw, 
  LayoutGrid, 
  Sliders, 
  Sparkles, 
  Eye, 
  CheckCircle,
  Paintbrush
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ThemeCustomizer() {
  const { preferences, activeTheme, customConfig, applyTheme, resetToDefault } = useVamoTheme();
  const { toast } = useToast();

  // Local state for live preview before saving
  const [selectedThemeId, setSelectedThemeId] = useState<string>(preferences.themeId);
  const [localConfig, setLocalConfig] = useState<CustomThemeConfig>(customConfig);
  const [isSaving, setIsSaving] = useState(false);

  // Compute a normalized live preview theme based on selected settings
  const currentPreviewTheme = React.useMemo(() => {
    const baseTheme = VAMO_THEMES.find(t => t.id === selectedThemeId) || activeTheme;
    const merged: Partial<VamoTheme> = {
      ...baseTheme,
      primary: localConfig.primary || baseTheme.primary,
      secondary: localConfig.secondary || baseTheme.secondary,
      accent: localConfig.accent || baseTheme.accent,
    };
    return normalizeTheme(merged);
  }, [selectedThemeId, localConfig.primary, localConfig.secondary, localConfig.accent, activeTheme]);

  // Compute a validated texture combination for the live preview
  const validatedPreviewTexture = React.useMemo(() => {
    const texture = localConfig.texture || 'none';
    const { correctedTexture } = validateThemeCombination(currentPreviewTheme, texture);
    return correctedTexture;
  }, [currentPreviewTheme, localConfig.texture]);

  const handleSelectTheme = (themeId: string) => {
    setSelectedThemeId(themeId);
    // Reset custom configurations when switching preset themes unless they want to carry them over
    const presetTheme = VAMO_THEMES.find(t => t.id === themeId);
    if (presetTheme) {
      setLocalConfig({
        texture: 'none',
        glowIntensity: 'medium',
        radius: 'medium',
        density: 'normal'
      });
    }
  };

  const handleUpdateConfig = <K extends keyof CustomThemeConfig>(key: K, value: CustomThemeConfig[K]) => {
    setLocalConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleApply = async () => {
    setIsSaving(true);
    try {
      await applyTheme(selectedThemeId, localConfig);
      toast({
        title: "Personalización Aplicada",
        description: "Tu tema visual se ha guardado y aplicado en todos tus dispositivos.",
        variant: "default",
      });
    } catch (err) {
      toast({
        title: "Error al aplicar",
        description: "No pudimos guardar tus preferencias. Reintenta por favor.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      await resetToDefault();
      setSelectedThemeId('vamo-classic');
      setLocalConfig({
        texture: 'none',
        glowIntensity: 'medium',
        radius: 'medium',
        density: 'normal'
      });
      toast({
        title: "Restablecido a Clásico",
        description: "Has vuelto al tema institucional VamO Clásico.",
        variant: "default",
      });
    } catch (err) {
      toast({
        title: "Error al restablecer",
        description: "No pudimos restablecer el tema.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to compute classes dynamically for local preview box
  const previewRadiusClass = {
    soft: 'rounded-[4px]',
    medium: 'rounded-[10px]',
    rounded: 'rounded-[20px]',
  }[localConfig.radius || 'medium'];

  const previewDensityClass = {
    compact: 'p-3 gap-2',
    normal: 'p-5 gap-4',
    comfortable: 'p-7 gap-6',
  }[localConfig.density || 'normal'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
      {/* Configuration Panel */}
      <div className="lg:col-span-7 flex flex-col space-y-6 bg-slate-900/40 backdrop-blur-md border border-zinc-800 p-6 rounded-2xl shadow-xl">
        
        {/* Header */}
        <div className="flex items-center space-x-3 pb-4 border-b border-zinc-800">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <Palette className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-wider">Diseño y Personalización</h2>
            <p className="text-xs text-zinc-400">Personaliza colores, texturas y el estilo de tu panel VamO.</p>
          </div>
        </div>

        {/* Preset Themes List */}
        <div className="flex flex-col space-y-3">
          <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Temas Predefinidos</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {VAMO_THEMES.map((theme) => {
              const isSelected = selectedThemeId === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme.id)}
                  className={cn(
                    "relative flex flex-col items-start p-3 text-left border rounded-xl transition-all duration-300",
                    isSelected 
                      ? "bg-slate-900 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.25)] text-white" 
                      : "bg-slate-950/40 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:bg-slate-900/30"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className="text-xs font-black truncate">{theme.name}</span>
                    {isSelected && (
                      <div className="h-4 w-4 bg-indigo-500 rounded-full flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  
                  {/* Small Palette dots */}
                  <div className="flex space-x-1.5 mt-auto">
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-950/40" style={{ backgroundColor: theme.primary }} />
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-950/40" style={{ backgroundColor: theme.secondary }} />
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-950/40" style={{ backgroundColor: theme.accent }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Textures Selector */}
        <div className="flex flex-col space-y-3">
          <label className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center space-x-1.5">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Textura y Acabado del Fondo</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['none', 'subtle-grid', 'soft-gradient', 'glass', 'carbon', 'radial-glow', 'premium-noise', 'map-dark'] as VisualTexture[]).map((tex) => {
              const isSelected = localConfig.texture === tex;
              const names: Record<VisualTexture, string> = {
                none: 'Sin Textura',
                'subtle-grid': 'Grilla Sutil',
                'soft-gradient': 'Gradiente Suave',
                glass: 'Efecto Cristal',
                carbon: 'Fibra de Carbono',
                'radial-glow': 'Destello Radial',
                'premium-noise': 'Ruido Análogo',
                'map-dark': 'Líneas de Mapa',
              };
              return (
                <button
                  key={tex}
                  onClick={() => handleUpdateConfig('texture', tex)}
                  className={cn(
                    "p-2 text-2xs font-extrabold rounded-lg border text-center transition-all duration-200 truncate uppercase tracking-wider",
                    isSelected 
                      ? "bg-indigo-500/10 border-indigo-500 text-indigo-400" 
                      : "bg-slate-950/30 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  )}
                >
                  {names[tex]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Advanced Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Border Radius */}
          <div className="flex flex-col space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Bordes de Tarjetas</label>
            <div className="grid grid-cols-3 gap-1">
              {(['soft', 'medium', 'rounded'] as BorderStyle[]).map((rad) => (
                <button
                  key={rad}
                  onClick={() => handleUpdateConfig('radius', rad)}
                  className={cn(
                    "p-1.5 text-3xs font-extrabold rounded border uppercase tracking-widest transition-all",
                    localConfig.radius === rad
                      ? "bg-indigo-500/10 border-indigo-500 text-indigo-400"
                      : "bg-slate-950/30 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  )}
                >
                  {rad === 'soft' ? 'Firme' : rad === 'medium' ? 'Medio' : 'Curvo'}
                </button>
              ))}
            </div>
          </div>

          {/* Glow Intensity */}
          <div className="flex flex-col space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Brillo / Resplandor</label>
            <div className="grid grid-cols-3 gap-1">
              {(['low', 'medium', 'high'] as GlowIntensity[]).map((glow) => (
                <button
                  key={glow}
                  onClick={() => handleUpdateConfig('glowIntensity', glow)}
                  className={cn(
                    "p-1.5 text-3xs font-extrabold rounded border uppercase tracking-widest transition-all",
                    localConfig.glowIntensity === glow
                      ? "bg-indigo-500/10 border-indigo-500 text-indigo-400"
                      : "bg-slate-950/30 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  )}
                >
                  {glow === 'low' ? 'Bajo' : glow === 'medium' ? 'Normal' : 'Fuerte'}
                </button>
              ))}
            </div>
          </div>

          {/* Density */}
          <div className="flex flex-col space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-zinc-400">Densidad Visual</label>
            <div className="grid grid-cols-3 gap-1">
              {(['compact', 'normal', 'comfortable'] as LayoutDensity[]).map((dens) => (
                <button
                  key={dens}
                  onClick={() => handleUpdateConfig('density', dens)}
                  className={cn(
                    "p-1.5 text-3xs font-extrabold rounded border uppercase tracking-widest transition-all",
                    localConfig.density === dens
                      ? "bg-indigo-500/10 border-indigo-500 text-indigo-400"
                      : "bg-slate-950/30 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                  )}
                >
                  {dens === 'compact' ? 'Compacto' : dens === 'normal' ? 'Medio' : 'Espacioso'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Core Color Picker */}
        <div className="flex flex-col space-y-3 pt-3 border-t border-zinc-800">
          <label className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center space-x-1.5">
            <Paintbrush className="h-3.5 w-3.5" />
            <span>Colores Personalizados (Paleta Avanzada)</span>
          </label>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col space-y-1">
              <span className="text-[10px] text-zinc-400 font-extrabold uppercase">Primario</span>
              <div className="flex items-center space-x-2">
                <input 
                  type="color" 
                  value={localConfig.primary || currentPreviewTheme.primary} 
                  onChange={(e) => handleUpdateConfig('primary', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-zinc-700 bg-transparent"
                />
                <span className="text-2xs font-mono uppercase text-zinc-300">{localConfig.primary || currentPreviewTheme.primary}</span>
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-[10px] text-zinc-400 font-extrabold uppercase">Secundario</span>
              <div className="flex items-center space-x-2">
                <input 
                  type="color" 
                  value={localConfig.secondary || currentPreviewTheme.secondary} 
                  onChange={(e) => handleUpdateConfig('secondary', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-zinc-700 bg-transparent"
                />
                <span className="text-2xs font-mono uppercase text-zinc-300">{localConfig.secondary || currentPreviewTheme.secondary}</span>
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-[10px] text-zinc-400 font-extrabold uppercase">Acento</span>
              <div className="flex items-center space-x-2">
                <input 
                  type="color" 
                  value={localConfig.accent || currentPreviewTheme.accent} 
                  onChange={(e) => handleUpdateConfig('accent', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-zinc-700 bg-transparent"
                />
                <span className="text-2xs font-mono uppercase text-zinc-300">{localConfig.accent || currentPreviewTheme.accent}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-3 pt-4 border-t border-zinc-800 mt-auto">
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl border border-zinc-800 text-xs font-black uppercase tracking-wider text-zinc-400 hover:bg-slate-900 hover:text-white transition-all disabled:opacity-50"
          >
            <RotateCcw className="h-4.5 w-4.5 mr-2" />
            <span>Restablecer</span>
          </button>
          
          <button
            onClick={handleApply}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/40 text-xs font-black uppercase tracking-wider text-white transition-all shadow-[0_4px_15px_rgba(79,70,229,0.3)] disabled:opacity-50"
          >
            <Sparkles className="h-4.5 w-4.5 mr-2" />
            <span>{isSaving ? 'Guardando...' : 'Aplicar Preferencias'}</span>
          </button>
        </div>
      </div>

      {/* Visual Live Preview Box */}
      <div className="lg:col-span-5 flex flex-col space-y-4">
        <label className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center space-x-1.5">
          <Eye className="h-3.5 w-3.5" />
          <span>Vista Previa del Panel</span>
        </label>

        {/* Simulated device screen using selected dynamic theme styles locally */}
        <div 
          className="relative w-full aspect-[4/5] sm:aspect-square lg:aspect-auto lg:h-[480px] overflow-hidden border border-zinc-800 rounded-2xl flex flex-col transition-all duration-300 shadow-2xl"
          style={{ 
            backgroundColor: currentPreviewTheme.background,
            backgroundImage: validatedPreviewTexture !== 'none' ? TEXTURE_TEMPLATES[validatedPreviewTexture || 'none'] : 'none',
            backgroundSize: validatedPreviewTexture === 'subtle-grid' ? '40px 40px' : validatedPreviewTexture === 'carbon' ? '12px 12px' : 'auto',
          }}
        >
          {/* Header Bar */}
          <div 
            className="w-full px-4 py-3 flex items-center justify-between border-b"
            style={{ 
              borderColor: currentPreviewTheme.border,
              backgroundColor: currentPreviewTheme.surface 
            }}
          >
            <div className="flex items-center space-x-2">
              <span 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: currentPreviewTheme.primary }} 
              />
              <span className="text-xs font-black tracking-widest uppercase" style={{ color: currentPreviewTheme.text }}>VamO Dashboard</span>
            </div>
            
            <div 
              className="text-[9px] font-black uppercase px-2 py-0.5 rounded border tracking-wider"
              style={{ 
                color: currentPreviewTheme.accent,
                borderColor: currentPreviewTheme.accent,
                backgroundColor: `${currentPreviewTheme.accent}15`
              }}
            >
              Paraná Activo
            </div>
          </div>

          {/* Inner Content Area */}
          <div className={cn("flex-1 flex flex-col justify-between overflow-y-auto", previewDensityClass)}>
            
            {/* Live Indicator Card */}
            <div 
              className={cn("border flex flex-col transition-all duration-300", previewRadiusClass)}
              style={{ 
                backgroundColor: currentPreviewTheme.surface,
                borderColor: currentPreviewTheme.border,
                boxShadow: localConfig.glowIntensity === 'high' 
                  ? `0 8px 30px ${currentPreviewTheme.glow}, 0 0 10px ${currentPreviewTheme.primary}30` 
                  : localConfig.glowIntensity === 'medium' ? `0 4px 15px ${currentPreviewTheme.glow}` : 'none'
              }}
            >
              <div className="p-4 flex items-start justify-between">
                <div className="flex flex-col space-y-1">
                  <span className="text-3xs uppercase font-extrabold tracking-widest" style={{ color: currentPreviewTheme.textMuted }}>Estado de Conexión</span>
                  <span className="text-sm font-black" style={{ color: currentPreviewTheme.text }}>Viaje en Curso</span>
                </div>
                <div 
                  className="p-1.5 rounded-full" 
                  style={{ backgroundColor: `${currentPreviewTheme.success}20`, color: currentPreviewTheme.success }}
                >
                  <CheckCircle className="h-4.5 w-4.5" />
                </div>
              </div>
              <div 
                className="px-4 py-2 border-t flex items-center justify-between text-2xs"
                style={{ borderColor: currentPreviewTheme.border, backgroundColor: currentPreviewTheme.surfaceSoft }}
              >
                <span style={{ color: currentPreviewTheme.textMuted }}>Conductora Asignada</span>
                <span className="font-extrabold" style={{ color: currentPreviewTheme.text }}>María Luz</span>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div 
                className={cn("p-3 border flex flex-col", previewRadiusClass)}
                style={{ backgroundColor: currentPreviewTheme.surface, borderColor: currentPreviewTheme.border }}
              >
                <span className="text-3xs uppercase font-extrabold" style={{ color: currentPreviewTheme.textMuted }}>Saldo Wallet</span>
                <span className="text-base font-black mt-1" style={{ color: currentPreviewTheme.text }}>$4.850,00</span>
              </div>
              <div 
                className={cn("p-3 border flex flex-col", previewRadiusClass)}
                style={{ backgroundColor: currentPreviewTheme.surface, borderColor: currentPreviewTheme.border }}
              >
                <span className="text-3xs uppercase font-extrabold" style={{ color: currentPreviewTheme.textMuted }}>Tarifa Base</span>
                <span className="text-base font-black mt-1" style={{ color: currentPreviewTheme.primary }}>$1.200,00</span>
              </div>
            </div>

            {/* Alert badge */}
            <div 
              className={cn("p-3 border flex items-center space-x-3 text-3xs font-extrabold uppercase tracking-wider", previewRadiusClass)}
              style={{ 
                backgroundColor: `${currentPreviewTheme.warning}10`, 
                borderColor: `${currentPreviewTheme.warning}40`,
                color: currentPreviewTheme.warning 
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
              <span>Zona de alta demanda en Rawson</span>
            </div>

            {/* Styled Primary Call-To-Action Button */}
            <button 
              className={cn("w-full py-2.5 text-2xs font-black uppercase tracking-wider flex items-center justify-center transition-all", previewRadiusClass)}
              style={{ 
                backgroundColor: currentPreviewTheme.primary,
                color: getReadableTextColor(currentPreviewTheme.primary),
                boxShadow: localConfig.glowIntensity === 'high' 
                  ? `0 6px 20px ${currentPreviewTheme.primary}50` 
                  : localConfig.glowIntensity === 'medium' ? `0 4px 10px ${currentPreviewTheme.primary}30` : 'none'
              }}
            >
              <span>Confirmar Viaje Directo</span>
            </button>
          </div>

          {/* Footer Bar */}
          <div 
            className="w-full px-4 py-2 border-t flex items-center justify-center"
            style={{ 
              borderColor: currentPreviewTheme.border,
              backgroundColor: currentPreviewTheme.surface 
            }}
          >
            <span className="text-4xs uppercase tracking-widest text-zinc-500">Demo Live Viewport</span>
          </div>
        </div>
      </div>
    </div>
  );
}
