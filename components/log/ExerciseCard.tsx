'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';

interface ExerciseCardProps {
  date: string;
  onSaved: () => void;
}

const EXERCISE_TYPES = [
  { key: 'strength', emoji: '🏋️', label: 'Strength' },
  { key: 'run', emoji: '🏃', label: 'Run' },
  { key: 'walk', emoji: '🚶', label: 'Walk' },
] as const;

type ExerciseType = typeof EXERCISE_TYPES[number]['key'];

export function ExerciseCard({ date, onSaved }: ExerciseCardProps) {
  const [type, setType] = useState<ExerciseType>('strength');
  const [duration, setDuration] = useState('');
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs/exercise?date=${date}`);
      const data = await res.json();
      if (data && data.date) {
        // Determine which type was logged
        if (data.strengthSession) {
          setType('strength');
          setDuration(data.strengthDuration != null ? String(data.strengthDuration) : '');
        } else if (data.run) {
          setType('run');
          setDuration(data.runDuration != null ? String(data.runDuration) : '');
        } else if (data.walk) {
          setType('walk');
          setDuration('');
        } else {
          setType('strength');
          setDuration('');
        }
        setLogged(true);
      } else {
        setType('strength');
        setDuration('');
        setLogged(false);
      }
      setJustSaved(false);
    } catch {
      // API unreachable
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const d = parseInt(duration, 10);
      await fetch('/api/logs/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          type,
          duration: isNaN(d) ? null : d,
        }),
      });
      setLogged(true);
      setJustSaved(true);
      onSaved();
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const btnLabel = justSaved ? '✓ Saved' : logged ? 'Exercise Logged — Update' : 'Log Exercise';

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Label>🏃 Exercise</Label>
        {logged && <Pill color="var(--teal)">Logged</Pill>}
      </div>

      {/* Type toggle */}
      <div className="flex gap-2 mb-4">
        {EXERCISE_TYPES.map(({ key, emoji, label }) => (
          <Pill
            key={key}
            color="var(--amber)"
            active={type === key}
            onClick={() => setType(key)}
          >
            {emoji} {label}
          </Pill>
        ))}
      </div>

      {/* Duration input */}
      <div className="mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-0.5 block">
          Duration (minutes)
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-t1
            focus:outline-none focus:border-amber/50 transition-colors min-h-[44px]"
          placeholder="45"
        />
      </div>

      <Btn
        full
        onClick={handleSave}
        disabled={saving}
        color={justSaved ? 'var(--teal)' : 'var(--amber)'}
      >
        {btnLabel}
      </Btn>
    </Card>
  );
}
