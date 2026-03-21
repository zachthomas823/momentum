"use client";

import { Card } from "@/components/ui/Card";
import { ConfBadge } from "@/components/trajectory/EventCard";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScenarioData {
  id: number;
  query: string;
  responseJson: {
    response?: string;
    summary?: string;
    confidence?: string;
    relatableEquiv?: string;
    mechanismChain?: string[];
    fallback?: boolean;
    [key: string]: unknown;
  };
  createdAt: string;
}

interface ScenarioCardProps {
  scenario: ScenarioData;
  onDelete: (id: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── ScenarioCard ────────────────────────────────────────────────────────────

export default function ScenarioCard({ scenario, onDelete }: ScenarioCardProps) {
  const resp = scenario.responseJson;
  const summary = resp.response ?? resp.summary ?? "";
  const confidence = resp.confidence ?? "mod";
  const relatableEquiv = resp.relatableEquiv;

  return (
    <Card className="mb-2">
      <div className="flex items-start gap-2">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Query */}
          <div
            className="text-xs font-semibold mb-1 truncate"
            style={{ color: "var(--amber)", fontFamily: "var(--font-display)" }}
          >
            "{scenario.query}"
          </div>

          {/* Response summary */}
          <div className="text-[11px] leading-snug mb-1.5" style={{ color: "var(--t2)" }}>
            {summary.length > 150 ? summary.slice(0, 150) + "…" : summary}
          </div>

          {/* Relatable equiv */}
          {relatableEquiv && (
            <div className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--teal)" }}>
              {relatableEquiv}
            </div>
          )}

          {/* Footer: confidence + timestamp */}
          <div className="flex items-center gap-2">
            <ConfBadge level={confidence} />
            {resp.fallback && (
              <span className="text-[9px]" style={{ color: "var(--t3)" }}>
                (local)
              </span>
            )}
            <span className="text-[9px] ml-auto" style={{ color: "var(--t3)" }}>
              {timeAgo(scenario.createdAt)}
            </span>
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={() => onDelete(scenario.id)}
          className="shrink-0 p-1.5 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{
            color: "var(--t3)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--rose)";
            e.currentTarget.style.background = "rgba(239,71,111,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--t3)";
            e.currentTarget.style.background = "transparent";
          }}
          aria-label="Delete scenario"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <path
              d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </Card>
  );
}
