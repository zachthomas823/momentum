"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Btn";
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

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  confidence?: string;
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

  const [expanded, setExpanded] = useState(false);
  const [followUps, setFollowUps] = useState<ChatMessage[]>([]);
  const [followUpQuery, setFollowUpQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFollowUp = async () => {
    const trimmed = followUpQuery.trim();
    if (!trimmed || loading) return;

    setFollowUps((prev) => [...prev, { role: "user", text: trimmed }]);
    setFollowUpQuery("");
    setLoading(true);

    try {
      // Build context from conversation history
      const context = [
        `Original question: "${scenario.query}"`,
        `Original answer: ${summary}`,
        ...followUps.map((m) =>
          m.role === "user" ? `Follow-up question: "${m.text}"` : `Follow-up answer: ${m.text}`
        ),
        `New follow-up question: "${trimmed}"`,
      ].join("\n\n");

      const res = await fetch("/api/impact/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: context }),
      });

      const data = await res.json();
      setFollowUps((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.response ?? data.summary ?? data.error ?? "No response",
          confidence: data.confidence,
        },
      ]);
    } catch {
      setFollowUps((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong — try again" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-2">
      {/* Header row: query + delete */}
      <div className="flex items-start gap-2">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div
            className="text-xs font-semibold mb-1"
            style={{ color: "var(--amber)", fontFamily: "var(--font-display)" }}
          >
            &ldquo;{scenario.query}&rdquo;
          </div>

          {!expanded && (
            <div className="text-[11px] leading-snug mb-1.5 line-clamp-2" style={{ color: "var(--t2)" }}>
              {summary.length > 150 ? summary.slice(0, 150) + "…" : summary}
            </div>
          )}

          <div className="flex items-center gap-2">
            <ConfBadge level={confidence} />
            {resp.fallback && (
              <span className="text-[9px]" style={{ color: "var(--t3)" }}>(local)</span>
            )}
            <span className="text-[9px] ml-auto" style={{ color: "var(--t3)" }}>
              {expanded ? "tap to collapse" : timeAgo(scenario.createdAt)}
            </span>
          </div>
        </div>

        <button
          onClick={() => onDelete(scenario.id)}
          className="shrink-0 p-1.5 rounded-lg transition-colors duration-200 cursor-pointer"
          style={{ color: "var(--t3)", background: "transparent" }}
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

      {/* Expanded: full response + follow-up thread */}
      {expanded && (
        <div className="mt-3 border-t border-white/10 pt-3">
          {/* Full original response */}
          <div
            className="text-[13px] leading-relaxed mb-3 whitespace-pre-wrap"
            style={{ color: "var(--t1)" }}
          >
            {summary}
          </div>

          {resp.relatableEquiv && (
            <div className="text-xs font-semibold mb-3" style={{ color: "var(--teal)" }}>
              {resp.relatableEquiv}
            </div>
          )}

          {/* Follow-up thread */}
          {followUps.length > 0 && (
            <div className="space-y-3 mb-3">
              {followUps.map((msg, i) => (
                <div key={i}>
                  {msg.role === "user" ? (
                    <div className="text-xs font-semibold" style={{ color: "var(--amber)" }}>
                      &ldquo;{msg.text}&rdquo;
                    </div>
                  ) : (
                    <div>
                      <div
                        className="text-[13px] leading-relaxed whitespace-pre-wrap"
                        style={{ color: "var(--t1)" }}
                      >
                        {msg.text}
                      </div>
                      {msg.confidence && (
                        <div className="mt-1">
                          <ConfBadge level={msg.confidence} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Follow-up input */}
          <div className="flex gap-2 items-end mt-2">
            <textarea
              value={followUpQuery}
              onChange={(e) => {
                setFollowUpQuery(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFollowUp();
                }
              }}
              placeholder="Ask a follow-up…"
              disabled={loading}
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs outline-none
                resize-none overflow-hidden min-w-0 focus:border-amber/50 transition-colors"
              style={{ color: "var(--t1)" }}
            />
            <Btn
              onClick={handleFollowUp}
              disabled={loading || !followUpQuery.trim()}
              className="!px-3 !min-h-[32px] text-[11px] shrink-0"
            >
              {loading ? (
                <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                "Ask"
              )}
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
