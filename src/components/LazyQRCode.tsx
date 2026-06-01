'use client';

/**
 * LazyQRCode — wrapper dinámico para qrcode.react
 * ──────────────────────────────────────────────────────────────────────────────
 * qrcode.react pesa ~112 KB. Se carga solo cuando el componente es visible
 * por primera vez (lazy). Skeleton mientras carga.
 */

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const QRCodeCanvas = dynamic(
  () => import('qrcode.react').then((mod) => mod.QRCodeCanvas),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="w-[180px] h-[180px] rounded-2xl bg-zinc-800/60" />
    ),
  }
);

interface LazyQRCodeProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  marginSize?: number;
}

export function LazyQRCode({ value, size = 180, level = 'H', marginSize = 2 }: LazyQRCodeProps) {
  return (
    <QRCodeCanvas
      value={value}
      size={size}
      level={level}
      marginSize={marginSize}
    />
  );
}
