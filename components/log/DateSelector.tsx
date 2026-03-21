'use client';

import { useMemo } from 'react';

interface DateSelectorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

/** Format a Date to YYYY-MM-DD using local timezone (never UTC). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DateSelector({ selectedDate, onDateChange }: DateSelectorProps) {
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: { dateStr: string; label: string; dayNum: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = toLocalDateStr(d);
      let label: string;
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Yday';
      else label = SHORT_DAYS[d.getDay()];
      result.push({ dateStr, label, dayNum: d.getDate() });
    }
    return result;
  }, []);

  const todayStr = days[days.length - 1].dateStr;
  const isPastDate = selectedDate !== todayStr;

  // Build banner text for past dates
  const bannerText = useMemo(() => {
    if (!isPastDate) return null;
    const parts = selectedDate.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    return `Logging for ${weekday}, ${month} ${d.getDate()}`;
  }, [selectedDate, isPastDate]);

  return (
    <div className="mb-4">
      <div className="flex gap-1 justify-between">
        {days.map(({ dateStr, label, dayNum }) => {
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={dateStr}
              onClick={() => onDateChange(dateStr)}
              className={`
                flex flex-col items-center justify-center
                rounded-xl px-1 py-2 min-w-[48px] min-h-[56px]
                text-center transition-all duration-200
                cursor-pointer
                ${isSelected
                  ? isToday
                    ? 'border border-amber bg-amber/15 text-amber'
                    : 'border border-sky bg-sky/15 text-sky'
                  : 'border border-transparent text-t2 hover:bg-white/5'
                }
              `}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {label}
              </span>
              <span className="text-base font-semibold mt-0.5">{dayNum}</span>
            </button>
          );
        })}
      </div>

      {bannerText && (
        <div className="mt-3 rounded-xl bg-sky/10 border border-sky/20 px-4 py-2 text-center">
          <span className="text-sky text-sm font-medium">{bannerText}</span>
        </div>
      )}
    </div>
  );
}
