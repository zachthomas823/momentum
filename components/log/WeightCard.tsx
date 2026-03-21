'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';

interface WeightCardProps {
  date: string;
  onSaved: () => void;
}

export function WeightCard({ date, onSaved }: WeightCardProps) {
  const [weightLbs, setWeightLbs] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs/weight?date=${date}`);
      const data = await res.json();
      if (data && data.date) {
        setWeightLbs(data.weightLbs != null ? String(data.weightLbs) : '');
        setBodyFatPct(data.bodyFatPct != null ? String(data.bodyFatPct) : '');
        setLogged(true);
      } else {
        setWeightLbs('');
        setBodyFatPct('');
        setLogged(false);
      }
      setJustSaved(false);
    } catch {
      // API unreachable
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    const w = parseFloat(weightLbs);
    if (isNaN(w)) return;
    setSaving(true);
    try {
      const bf = parseFloat(bodyFatPct);
      await fetch('/api/logs/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          weightLbs: w,
          bodyFatPct: isNaN(bf) ? null : bf,
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

  const btnLabel = justSaved ? '✓ Saved' : logged ? 'Weight Logged — Update' : 'Log Weight';

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Label>⚖️ Weight</Label>
        {logged && <Pill color="var(--teal)">Logged</Pill>}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-0.5 block">
            Weight (lbs)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-t1
              focus:outline-none focus:border-amber/50 transition-colors min-h-[44px]"
            placeholder="185.0"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-0.5 block">
            Body Fat %
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={bodyFatPct}
            onChange={(e) => setBodyFatPct(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-t1
              focus:outline-none focus:border-amber/50 transition-colors min-h-[44px]"
            placeholder="Optional"
          />
        </div>
      </div>

      <Btn
        full
        onClick={handleSave}
        disabled={saving || !weightLbs}
        color={justSaved ? 'var(--teal)' : 'var(--amber)'}
      >
        {btnLabel}
      </Btn>
    </Card>
  );
}
