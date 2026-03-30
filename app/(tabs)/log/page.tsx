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

/** Format today as YYYY-MM-DD using local timezone. */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function LogPage() {
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const [, setRefreshKey] = useState(0);

  const handleSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="pb-[100px]">
      <h1
        className="text-2xl font-bold mb-4"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Log
      </h1>

      <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />

      <div className="flex flex-col gap-4">
        <VacationCard date={selectedDate} onSaved={handleSaved} />
        <DietCard date={selectedDate} onSaved={handleSaved} />
        <AlcoholCard date={selectedDate} onSaved={handleSaved} />
        <WeightCard date={selectedDate} onSaved={handleSaved} />
        <SleepCard date={selectedDate} onSaved={handleSaved} />
        <ExerciseCard date={selectedDate} onSaved={handleSaved} />
        <PhotoCard date={selectedDate} onSaved={handleSaved} />
      </div>
    </div>
  );
}
