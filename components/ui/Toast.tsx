'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  emoji?: string;
  color?: string;
  onDone: () => void;
}

export function Toast({ message, emoji, color = 'var(--teal)', onDone }: ToastProps) {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setPhase('visible'), 10);
    // Start exit after 2.5s
    const exitTimer = setTimeout(() => setPhase('exit'), 2500);
    // Remove after exit animation
    const doneTimer = setTimeout(onDone, 3000);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: 'env(safe-area-inset-top, 12px)' }}
    >
      <div
        className="mx-4 mt-3 px-5 py-3 rounded-2xl backdrop-blur-xl border border-white/10 shadow-lg
          flex items-center gap-3 pointer-events-auto transition-all duration-300"
        style={{
          background: `color-mix(in srgb, ${color} 15%, #161b22 85%)`,
          borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
          boxShadow: `0 8px 32px ${color}22, 0 0 0 1px ${color}15`,
          opacity: phase === 'enter' ? 0 : phase === 'exit' ? 0 : 1,
          transform:
            phase === 'enter'
              ? 'translateY(-20px) scale(0.95)'
              : phase === 'exit'
                ? 'translateY(-10px) scale(0.98)'
                : 'translateY(0) scale(1)',
        }}
      >
        {emoji && <span className="text-2xl">{emoji}</span>}
        <span className="text-sm font-semibold text-t1">{message}</span>
      </div>
    </div>
  );
}
