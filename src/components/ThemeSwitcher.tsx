'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cambiar a tema claro"
        onClick={() => setTheme('light')}
        className={theme === 'light' ? 'text-primary' : 'text-muted-foreground'}
       >
          <VamoIcon name="sun" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cambiar a tema oscuro"
        onClick={() => setTheme('dark')}
        className={theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}
      >
          <VamoIcon name="moon" />
      </Button>
    </div>
  );
}
