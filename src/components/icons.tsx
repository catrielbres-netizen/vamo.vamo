// src/components/icons.tsx
'use client';
import dynamic from 'next/dynamic';
import type { LucideProps } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

interface VamoIconProps extends LucideProps {
  name: keyof typeof dynamicIconImports;
}

const VamoIcon = ({ name, ...props }: VamoIconProps) => {
  const LucideIcon = dynamic(dynamicIconImports[name]);
  return <LucideIcon {...props} />;
};

export { VamoIcon };


export const WhatsAppLogo = (props: React.SVGProps<SVGSVGElement>) => (
    <svg 
        viewBox="0 0 24 24" 
        fill="currentColor"
        {...props}
    >
        <path d="M16.75 13.96c.25.13.43.2.5.33.07.13.07.55.07.55s-.16.45-.43.64c-.27.18-.95.45-1.16.51-.2.07-.48.07-.73-.04-.25-.11-1.39-1.02-1.39-1.02s-.58-.55-1.02-1.16c-.44-.61-1-1.28-1-1.28s-.18-.21-.04-.43c.14-.22.33-.27.43-.27.11,0,.26,0,.39.04.13.04.22.04.33.22.11.18.55,1.02.55,1.02s.27.55.39.64c.11.11.2.11.31.04.11-.07.25-.11.39-.2.14-.07.25-.13.39-.22.14-.07.22-.11.33-.11.11,0,.2,0,.31.07.11.07.16.11.16.11s.11.05.2.13c.07.07.11.11.11.11s.05.05.11.07c.07.02.11.04.16.04.05,0,.11,0,.16-.02s.11-.04.16-.07c.05-.02.11-.05.16-.07.05-.02.07-.04.07-.04s.02-.02.04-.04.02-.02.02-.02.02,0,.04-.02a.4.4,0,0,1,.13-.05.2.2,0,0,1,.09-.02c.02,0,.04,0,.07,0h.02ZM12,2a10,10,0,0,0-10,10,10,10,0,0,0,10,10,10,10,0,0,0,10-10A10,10,0,0,0,12,2Zm0,18a8,8,0,0,1-8-8,8,8,0,0,1,8-8,8,8,0,0,1,8,8,8,8,0,0,1-8,8Z"/>
    </svg>
);