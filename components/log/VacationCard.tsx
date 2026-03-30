'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';

interface VacationCardProps {
  date: string;
  onSaved: () => void;
}

export function VacationCard({ date, onSaved }: VacationCardProps) {
  const [active, setActive] = useState(false);
  const [vacationName, setVacationName] = useState('');
  const [notes, setNotes] = useState('');
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs/vacation?date=${date}`);
      const data = await res.json();
      if (data && data.date) {
        setActive(true);
        setVacationName(data.vacationName ?? '');
        setNotes(data.notes ?? '');
        setLogged(true);
      } else {
        setActive(false);
        setVacationName('');
        setNotes('');
        setLogged(false);
      }
      setJustSaved(false);
    } catch {
      // API unreachable — leave state as-is
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const canSave = active && vacationName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await fetch('/api/logs/vacation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, vacationName: vacationName.trim(), notes: notes.trim() || null }),
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

  const handleRemove = async () => {
    setSaving(true);
    try {
      await fetch(`/api/logs/vacation?date=${date}`, { method: 'DELETE' });
      setActive(false);
      setVacationName('');
      setNotes('');
      setLogged(false);
      onSaved();
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const btnLabel = justSaved ? '✓ Saved' : logged ? 'Update Vacation' : 'Log Vacation Day';

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Label>✈️ Vacation</Label>
          {logged && <Pill color="var(--teal)">On Vacation</Pill>}
        </div>
        <button
          onClick={() => {
            if (active && logged) {
              handleRemove();
            } else {
              setActive(!active);
            }
          }}
          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
            active ? 'bg-amber' : 'bg-white/10'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              active ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {active && (
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-0.5 block">
              Vacation Name
            </label>
            <input
              type="text"
              value={vacationName}
              onChange={(e) => setVacationName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-t1
                focus:outline-none focus:border-amber/50 transition-colors"
              placeholder="e.g., Cabo trip, Family reunion"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-0.5 block">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-t1
                focus:outline-none focus:border-amber/50 transition-colors resize-none"
              placeholder="Beach day, lots of walking / All-inclusive resort / Road trip driving all day"
            />
          </div>

          <Btn
            full
            onClick={handleSave}
            disabled={saving || !canSave}
            color={justSaved ? 'var(--teal)' : 'var(--amber)'}
          >
            {btnLabel}
          </Btn>
        </div>
      )}
    </Card>
  );
}
