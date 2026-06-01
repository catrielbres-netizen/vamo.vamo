'use client';

import { useAppMode } from '@/hooks/useAppMode';

export function GlobalFooter() {
    const { appMode, loading } = useAppMode();

    if (loading) return null;

    if (appMode.mode === 'municipal') {
        return (
            <div className="fixed bottom-0 right-0 p-2 text-[10px] text-zinc-500 font-mono z-[9999] bg-black/80 pointer-events-none">
                {appMode.versionLabel || 'Modo Institucional Municipal'}
            </div>
        );
    }

    return (
        <div className="fixed bottom-0 right-0 p-2 text-[10px] text-zinc-500 font-mono z-[9999] bg-black/80 pointer-events-none">
            VamO Compartido UI activa (Deploy: 01/06/2026)
        </div>
    );
}
