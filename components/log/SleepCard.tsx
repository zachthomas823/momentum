'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';

interface SleepCardProps {
  date: string;
  onSaved: () => void;
}

function getSleepFeedback(hours: number): { text: string; color: string } | null {
  if (hours >= 8) return { text: 'Optimal — fat loss ratio at its best', color: 'var(--teal)' };
  if (hours >= 7) return { text: 'Adequate', color: 'var(--t2)' };
  if (hours >= 5.5) return { text: 'Below target — shifts weight loss toward muscle, not fat', color: 'var(--rose)' };
  return { text: 'Rough night — hunger hormones will spike tomorrow', color: '#ef476f' };
}

export function SleepCard({ date, onSaved }: SleepCardProps) {
  const [hours, setHours] = useState('');
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs/sleep?date=${date}`);
      const data = await res.json();
      if (data && data.date) {
        setHours(data.totalHours != null ? String(data.totalHours) : '');
        setLogged(true);
      } else {
        setHours('');
        setLogged(false);
      }
      setJustSaved(false);
    } catch {
      // API unreachable
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    const h = parseFloat(hours);
    if (isNaN(h)) return;
    setSaving(true);
    try {
      await fetch('/api/logs/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, totalHours: h }),
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

  const feedback = useMemo(() => {
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) return null;
    return getSleepFeedback(h);
  }, [hours]);

  const btnLabel = justSaved ? '✓ Saved' : logged ? 'Sleep Logged — Update' : 'Log Sleep';

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Label>😴 Sleep</Label>
        {logged && <Pill color="var(--teal)">Logged</Pill>}
      </div>

      <div className="mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-0.5 block">
          Hours of Sleep
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-t1
            focus:outline-none focus:border-amber/50 transition-colors min-h-[44px]"
          placeholder="7.5"
        />
        {feedback && (
          <p
            className="text-xs mt-2 font-medium transition-all"
            style={{ color: feedback.color }}
          >
            {feedback.text}
          </p>
        )}
      </div>

      <Btn
        full
        onClick={handleSave}
        disabled={saving || !hours}
        color={justSaved ? 'var(--teal)' : 'var(--amber)'}
      >
        {btnLabel}
      </Btn>
    </Card>
  );
}
