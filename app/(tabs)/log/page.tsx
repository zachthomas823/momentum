'use client';

import { useState, useCallback } from 'react';
import { DateSelector } from '@/components/log/DateSelector';
import { DietCard } from '@/components/log/DietCard';
import { AlcoholCard } from '@/components/log/AlcoholCard';
import { WeightCard } from '@/components/log/WeightCard';
import { SleepCard } from '@/components/log/SleepCard';
import { ExerciseCard } from '@/components/log/ExerciseCard';
import { PhotoCard } from '@/components/log/PhotoCard';
import { VacationCard } from '@/components/log/VacationCard';
import { Toast } from '@/components/ui/Toast';

/** Format today as YYYY-MM-DD using local timezone. */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ToastData {
  message: string;
  emoji: string;
  color?: string;
}

export default function LogPage() {
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const [, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<ToastData | null>(null);

  const handleSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const showToast = useCallback((data: ToastData) => {
    setToast(data);
  }, []);

  return (
    <div className="pb-[100px]">
      {toast && (
        <Toast
          message={toast.message}
          emoji={toast.emoji}
          color={toast.color}
          onDone={() => setToast(null)}
        />
      )}

      <h1
        className="text-2xl font-bold mb-4"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Log
      </h1>

      <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />

      <div className="flex flex-col gap-4">
        <VacationCard date={selectedDate} onSaved={handleSaved} />
        <DietCard date={selectedDate} onSaved={handleSaved} onToast={showToast} />
        <AlcoholCard date={selectedDate} onSaved={handleSaved} onToast={showToast} />
        <WeightCard date={selectedDate} onSaved={handleSaved} />
        <SleepCard date={selectedDate} onSaved={handleSaved} />
        <ExerciseCard date={selectedDate} onSaved={handleSaved} />
        <PhotoCard date={selectedDate} onSaved={handleSaved} />
      </div>
    </div>
  );
}
