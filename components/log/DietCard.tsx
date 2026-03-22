'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';

interface DietCardProps {
  date: string;
  onSaved: () => void;
}

const DIET_TIERS: Record<number, { emoji: string; name: string; color: string }> = {
  1: { emoji: '🔥', name: 'Dumpster Fire', color: '#ef476f' },
  2: { emoji: '😬', name: 'Meh', color: '#f26522' },
  3: { emoji: '😐', name: 'Cruise Control', color: '#9aabb8' },
  4: { emoji: '💪', name: 'Dialed In', color: '#06d6a0' },
  5: { emoji: '🎯', name: 'Sniper Mode', color: '#4fc3f7' },
};

export function DietCard({ date, onSaved }: DietCardProps) {
  const [mode, setMode] = useState<'vibes' | 'meals'>('vibes');
  const [score, setScore] = useState<number | null>(null);
  const [meals, setMeals] = useState({ breakfast: '', lunch: '', dinner: '', snacks: '' });
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs/diet?date=${date}`);
      const data = await res.json();
      if (data && data.date) {
        setScore(data.score);
        setMode(data.mode ?? 'vibes');
        if (data.mealsJson && typeof data.mealsJson === 'object') {
          setMeals({
            breakfast: data.mealsJson.breakfast ?? '',
            lunch: data.mealsJson.lunch ?? '',
            dinner: data.mealsJson.dinner ?? '',
            snacks: data.mealsJson.snacks ?? '',
          });
        }
        setLogged(true);
      } else {
        setScore(null);
        setMeals({ breakfast: '', lunch: '', dinner: '', snacks: '' });
        setLogged(false);
      }
      setJustSaved(false);
    } catch {
      // API unreachable — leave state as-is
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const hasMealContent = Object.values(meals).some((v) => v.trim().length > 0);
  const canSave = mode === 'vibes' ? score != null : hasMealContent;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await fetch('/api/logs/diet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          mode,
          score: score ?? 3, // default to "Cruise Control" if no score set
          mealsJson: mode === 'meals' ? meals : null,
        }),
      });
      setLogged(true);
      setJustSaved(true);
      onSaved();
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      // Silently fail — user sees no change
    } finally {
      setSaving(false);
    }
  };

  const btnLabel = justSaved ? '✓ Saved' : logged ? 'Diet Logged — Update Log' : 'Log Diet';

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Label>🍽️ Diet</Label>
          {logged && <Pill color="var(--teal)">Logged</Pill>}
        </div>
        <div className="flex rounded-full bg-white/5 p-0.5">
          <button
            onClick={() => setMode('vibes')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              mode === 'vibes' ? 'bg-amber text-[#0d1117]' : 'text-t2'
            }`}
          >
            Vibes
          </button>
          <button
            onClick={() => setMode('meals')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              mode === 'meals' ? 'bg-amber text-[#0d1117]' : 'text-t2'
            }`}
          >
            Meals
          </button>
        </div>
      </div>

      {mode === 'vibes' ? (
        <div className="flex justify-between gap-1 mb-4">
          {([1, 2, 3, 4, 5] as const).map((tier) => {
            const { emoji, name, color } = DIET_TIERS[tier];
            const isSelected = score === tier;
            return (
              <button
                key={tier}
                onClick={() => setScore(tier)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-w-[52px] min-h-[52px] cursor-pointer"
                style={{
                  background: isSelected ? `${color}20` : 'transparent',
                  border: isSelected ? `1.5px solid ${color}` : '1.5px solid transparent',
                }}
                title={name}
              >
                <span className="text-2xl">{emoji}</span>
                <span
                  className="text-[9px] font-bold leading-tight text-center"
                  style={{ color: isSelected ? color : 'var(--t2)' }}
                >
                  {name}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {(['breakfast', 'lunch', 'dinner', 'snacks'] as const).map((meal) => (
            <div key={meal}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-0.5 block">
                {meal}
              </label>
              <input
                type="text"
                value={meals[meal]}
                onChange={(e) => setMeals((prev) => ({ ...prev, [meal]: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-t1
                  focus:outline-none focus:border-amber/50 transition-colors"
                placeholder={`What'd you have?`}
              />
            </div>
          ))}
        </div>
      )}

      <Btn
        full
        onClick={handleSave}
        disabled={saving || !canSave}
        color={justSaved ? 'var(--teal)' : 'var(--amber)'}
      >
        {btnLabel}
      </Btn>
    </Card>
  );
}
