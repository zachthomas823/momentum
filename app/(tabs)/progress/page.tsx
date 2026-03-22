'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';
import { Pill } from '@/components/ui/Pill';

interface PhotoRecord {
  id: number;
  date: string;
  type: string;
  blobUrl: string;
  downloadUrl?: string;
  weightLbs: number | null;
  bodyFatPct: number | null;
  analysisJson: { text: string; comparedWith: number | null } | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProgressPage() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [compareIdx, setCompareIdx] = useState(0);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/photos?timeline=true&limit=50');
      if (res.ok) {
        const data = await res.json();
        setPhotos(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const handleAnalyze = async (photoId: number) => {
    setAnalyzing(photoId);
    try {
      const res = await fetch('/api/photos/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      });
      if (res.ok) {
        await fetchPhotos();
      }
    } catch {
      // ignore
    } finally {
      setAnalyzing(null);
    }
  };

  // Group photos by date
  const dateGroups = new Map<string, PhotoRecord[]>();
  for (const p of photos) {
    const existing = dateGroups.get(p.date) || [];
    existing.push(p);
    dateGroups.set(p.date, existing);
  }
  const dates = [...dateGroups.keys()].sort((a, b) => b.localeCompare(a));

  // Build comparison pairs (most recent two dates with front photos)
  const frontPhotos = photos.filter(p => p.type === 'front').sort((a, b) => b.date.localeCompare(a.date));
  const sidePhotos = photos.filter(p => p.type === 'side').sort((a, b) => b.date.localeCompare(a.date));

  if (loading) {
    return (
      <div className="pb-[100px]">
        <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
          Progress
        </h1>
        <Card>
          <div className="animate-pulse space-y-3">
            <div className="h-48 bg-white/5 rounded-lg" />
            <div className="h-4 bg-white/5 rounded w-3/4" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-[100px]">
      <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
        Progress
      </h1>

      {photos.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <span className="text-4xl mb-3 block">📸</span>
            <p className="text-sm mb-1" style={{ color: 'var(--t1)' }}>
              No progress photos yet
            </p>
            <p className="text-xs" style={{ color: 'var(--t3)' }}>
              Log a photo from the Log tab to start tracking visual changes
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* ── Side-by-side Comparison ─────────────────────────────── */}
          {frontPhotos.length >= 2 && (
            <Card className="mb-4">
              <Label>Side-by-Side</Label>
              <div className="flex gap-2 mt-2 mb-3">
                <Pill
                  color="var(--amber)"
                  active={compareIdx === 0}
                  onClick={() => setCompareIdx(0)}
                >
                  Front
                </Pill>
                <Pill
                  color="var(--amber)"
                  active={compareIdx === 1}
                  onClick={() => setCompareIdx(1)}
                >
                  Side
                </Pill>
              </div>
              {(() => {
                const list = compareIdx === 0 ? frontPhotos : sidePhotos;
                if (list.length < 2) {
                  return (
                    <p className="text-xs text-t3 text-center py-4">
                      Need at least 2 {compareIdx === 0 ? 'front' : 'side'} photos to compare
                    </p>
                  );
                }
                const current = list[0];
                const previous = list[1];
                return (
                  <div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <img
                          src={previous.downloadUrl ?? previous.blobUrl}
                          alt={`${previous.type} ${previous.date}`}
                          className="w-full aspect-[3/4] object-cover rounded-lg border border-white/10"
                        />
                        <div className="mt-1 text-center">
                          <div className="text-[10px] font-bold text-t3">{formatDate(previous.date)}</div>
                          {previous.weightLbs && (
                            <div className="text-[10px] text-t2">{previous.weightLbs} lbs</div>
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <img
                          src={current.downloadUrl ?? current.blobUrl}
                          alt={`${current.type} ${current.date}`}
                          className="w-full aspect-[3/4] object-cover rounded-lg border border-white/10"
                        />
                        <div className="mt-1 text-center">
                          <div className="text-[10px] font-bold" style={{ color: 'var(--amber)' }}>
                            {formatDate(current.date)}
                          </div>
                          {current.weightLbs && (
                            <div className="text-[10px] text-t2">{current.weightLbs} lbs</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Analysis */}
                    {current.analysisJson?.text ? (
                      <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2 block">
                          Claude Analysis
                        </label>
                        <p className="text-xs leading-relaxed text-t2 whitespace-pre-wrap">
                          {current.analysisJson.text}
                        </p>
                      </div>
                    ) : (
                      <Btn
                        full
                        onClick={() => handleAnalyze(current.id)}
                        disabled={analyzing === current.id}
                        color="var(--teal)"
                        className="mt-3"
                      >
                        {analyzing === current.id ? 'Analyzing...' : 'Analyze Changes with Claude'}
                      </Btn>
                    )}
                  </div>
                );
              })()}
            </Card>
          )}

          {/* ── Timeline ────────────────────────────────────────────── */}
          <div className="mb-3">
            <Label>Timeline</Label>
          </div>
          {dates.map((date) => {
            const dayPhotos = dateGroups.get(date)!;
            const front = dayPhotos.find(p => p.type === 'front');
            const side = dayPhotos.find(p => p.type === 'side');
            const weight = dayPhotos[0]?.weightLbs;
            const bf = dayPhotos[0]?.bodyFatPct;
            const analysis = dayPhotos.find(p => p.analysisJson?.text)?.analysisJson;

            return (
              <Card key={date} className="mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold" style={{ color: 'var(--amber)' }}>
                    {formatDate(date)}
                  </span>
                  <div className="flex gap-2 text-[10px] text-t3">
                    {weight && <span>{weight} lbs</span>}
                    {bf && <span>{bf}%</span>}
                  </div>
                </div>

                <div className="flex gap-2">
                  {front && (
                    <img
                      src={front.downloadUrl ?? front.blobUrl}
                      alt="Front"
                      className="flex-1 aspect-[3/4] object-cover rounded-lg border border-white/10"
                    />
                  )}
                  {side && (
                    <img
                      src={side.downloadUrl ?? side.blobUrl}
                      alt="Side"
                      className="flex-1 aspect-[3/4] object-cover rounded-lg border border-white/10"
                    />
                  )}
                </div>

                {analysis?.text && (
                  <div className="mt-2 p-2 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-[11px] leading-relaxed text-t2 whitespace-pre-wrap">
                      {analysis.text}
                    </p>
                  </div>
                )}

                {!analysis?.text && dayPhotos.length > 0 && (
                  <Btn
                    full
                    onClick={() => handleAnalyze(dayPhotos[0].id)}
                    disabled={analyzing === dayPhotos[0].id}
                    color="var(--teal)"
                    className="mt-2"
                  >
                    {analyzing === dayPhotos[0].id ? 'Analyzing...' : 'Analyze with Claude'}
                  </Btn>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
