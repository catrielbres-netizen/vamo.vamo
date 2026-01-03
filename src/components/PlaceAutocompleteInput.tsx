
'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from './ui/skeleton';
import { Place } from '@/lib/types';

// Dynamically import PlaceAutocomplete with SSR turned off
const DynamicPlaceAutocomplete = dynamic(() => import('./PlaceAutocomplete.tsx').then(mod => mod.PlaceAutocomplete), {
  ssr: false,
  loading: () => <Skeleton className="h-10 w-full" />,
});

interface Props {
  onPlaceSelect: (place: Place | null) => void;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
}

export default function PlaceAutocompleteInput(props: Props) {
  return <DynamicPlaceAutocomplete {...props} />;
}
