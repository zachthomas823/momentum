"use client";

import { Card } from "@/components/ui/Card";
import type { Nudge } from "@/lib/patterns";

const borderColors: Record<Nudge["type"], string> = {
  alert: "var(--rose)",
  warning: "var(--amber)",
  nudge: "var(--sky)",
  positive: "var(--teal)",
};

interface NudgeCardProps {
  nudge: Nudge;
}

export function NudgeCard({ nudge }: NudgeCardProps) {
  return (
    <Card>
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{ backgroundColor: borderColors[nudge.type] }}
      />
      <div className="flex gap-3 items-start pl-2">
        <span className="text-lg flex-shrink-0">{nudge.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-t1">{nudge.title}</p>
          <p className="text-xs text-t2 mt-0.5 leading-relaxed">
            {nudge.body}
          </p>
        </div>
      </div>
    </Card>
  );
}
