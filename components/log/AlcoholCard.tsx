'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';

interface AlcoholCardProps {
  date: string;
  onSaved: () => void;
  onToast?: (data: { message: string; emoji: string; color?: string }) => void;
}

interface DrinkSession {
  drinks: number;
  type: string;
  timestamp?: string;
}

const DRINK_TYPES = ['Beer', 'Wine', 'Liquor', 'Cocktail'];

const DRY_DAY_MESSAGES = [
  'Your tomorrow self thanks you',
  'Sleep quality is about to be elite',
  'Clean day in the books',
  'Momentum is building',
  'Recovery mode: activated',
];

export function AlcoholCard({ date, onSaved, onToast }: AlcoholCardProps) {
  const [drinks, setDrinks] = useState(0);
  const [drinkType, setDrinkType] = useState('Beer');
  const [sessions, setSessions] = useState<DrinkSession[]>([]);
  const [totalDrinks, setTotalDrinks] = useState(0);
  const [logged, setLogged] = useState(false);
  const [isDry, setIsDry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs/alcohol?date=${date}`);
      const data = await res.json();
      if (data && data.date) {
        const loadedSessions: DrinkSession[] = Array.isArray(data.sessionsJson)
          ? data.sessionsJson
          : [];
        setSessions(loadedSessions);
        setTotalDrinks(data.totalDrinks ?? 0);
        setIsDry(data.dry ?? false);
        setLogged(true);
      } else {
        setSessions([]);
        setTotalDrinks(0);
        setIsDry(false);
        setLogged(false);
      }
      setDrinks(0);
      setJustSaved(false);
    } catch {
      // API unreachable
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogSession = async () => {
    if (drinks <= 0) return;
    setSaving(true);
    try {
      await fetch('/api/logs/alcohol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, drinks, type: drinkType }),
      });
      setJustSaved(true);
      onSaved();
      await loadData();
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleDryDay = async () => {
    setSaving(true);
    try {
      await fetch('/api/logs/alcohol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, dry: true }),
      });
      setJustSaved(true);
      onSaved();
      onToast?.({
        message: DRY_DAY_MESSAGES[Math.floor(Math.random() * DRY_DAY_MESSAGES.length)],
        emoji: '💧',
        color: 'var(--teal)',
      });
      await loadData();
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleResetDry = async () => {
    setSaving(true);
    try {
      await fetch('/api/logs/alcohol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, dry: true }),
      });
      onSaved();
      await loadData();
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Label>🍺 Alcohol</Label>
          {logged && (
            <Pill color={isDry ? 'var(--teal)' : 'var(--amber)'}>
              {isDry ? 'Dry Day' : `${totalDrinks} drink${totalDrinks !== 1 ? 's' : ''}`}
            </Pill>
          )}
        </div>
      </div>

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="mb-3 space-y-1">
          {sessions.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm px-2 py-1 rounded-lg bg-white/5">
              <span className="text-t2">
                {s.drinks} {s.type}{s.drinks !== 1 ? 's' : ''}
              </span>
              {s.timestamp && (
                <span className="text-t3 text-xs">
                  {new Date(s.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Counter */}
      <div className="flex items-center justify-center gap-6 mb-4">
        <button
          onClick={() => setDrinks(Math.max(0, drinks - 1))}
          className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center
            text-xl font-bold text-t2 transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
        >
          −
        </button>
        <span
          className="font-bold tabular-nums transition-all"
          style={{
            fontSize: drinks > 0 ? '44px' : '28px',
            color: drinks > 0 ? 'var(--amber)' : 'var(--t3)',
            textShadow: drinks > 0 ? '0 0 20px rgba(245,166,35,0.4)' : 'none',
          }}
        >
          {drinks}
        </span>
        <button
          onClick={() => setDrinks(drinks + 1)}
          className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center
            text-xl font-bold text-t2 transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
        >
          +
        </button>
      </div>

      {/* Drink type pills */}
      <div className="flex gap-2 justify-center mb-4 flex-wrap">
        {DRINK_TYPES.map((t) => (
          <Pill
            key={t}
            color="var(--amber)"
            active={drinkType === t}
            onClick={() => setDrinkType(t)}
          >
            {t}
          </Pill>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <Btn
          full
          onClick={handleLogSession}
          disabled={saving || drinks <= 0}
          color={justSaved ? 'var(--teal)' : 'var(--amber)'}
        >
          {justSaved
            ? '✓ Saved'
            : logged
              ? `Add ${drinks} ${drinkType}${drinks !== 1 ? 's' : ''}`
              : `Log ${drinks} ${drinkType}${drinks !== 1 ? 's' : ''}`}
        </Btn>

        {!logged && (
          <Btn
            full
            onClick={handleDryDay}
            disabled={saving}
            color="var(--teal)"
          >
            Dry day — log it
          </Btn>
        )}

        {logged && !isDry && (
          <button
            onClick={handleResetDry}
            disabled={saving}
            className="text-sm text-t3 hover:text-rose transition-colors py-2 cursor-pointer"
          >
            Reset to dry day
          </button>
        )}
      </div>
    </Card>
  );
}
