'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Btn } from '@/components/ui/Btn';
import { Label } from '@/components/ui/Label';

interface PhotoRecord {
  id: number;
  date: string;
  type: string;
  blobUrl: string;
  weightLbs: number | null;
  bodyFatPct: number | null;
  analysisJson: { text: string; comparedWith: number | null } | null;
}

interface PhotoCardProps {
  date: string;
  onSaved: () => void;
}

/** Compress an image file using Canvas API (max 1200px, JPEG 0.8). */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1200;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

export function PhotoCard({ date, onSaved }: PhotoCardProps) {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const sideRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/photos?date=${date}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPhotos(data);
        const withAnalysis = data.find((p: PhotoRecord) => p.analysisJson?.text);
        if (withAnalysis) setAnalysis(withAnalysis.analysisJson!.text);
        else setAnalysis(null);
      }
    } catch {
      // API unreachable
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCapture = async (type: 'front' | 'side', file: File) => {
    setUploading(type);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('photo', compressed, `${type}.jpg`);
      formData.append('date', date);
      formData.append('type', type);

      const res = await fetch('/api/photos', { method: 'POST', body: formData });
      if (res.ok) {
        await loadData();
        onSaved();
      }
    } catch {
      // Silently fail
    } finally {
      setUploading(null);
    }
  };

  const handleAnalyze = async () => {
    const photo = photos[0];
    if (!photo) return;

    setAnalyzing(true);
    try {
      const res = await fetch('/api/photos/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: photo.id }),
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
        await loadData();
      }
    } catch {
      // Silently fail
    } finally {
      setAnalyzing(false);
    }
  };

  const frontPhoto = photos.find((p) => p.type === 'front');
  const sidePhoto = photos.find((p) => p.type === 'side');

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Label>📸 Progress Photos</Label>
        {photos.length > 0 && <Pill color="var(--teal)">Logged</Pill>}
      </div>

      {/* Capture slots */}
      <div className="flex gap-3 mb-4">
        {/* Front */}
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1 block">
            Front
          </label>
          {frontPhoto ? (
            <img
              src={frontPhoto.blobUrl}
              alt="Front progress"
              className="w-full aspect-[3/4] object-cover rounded-lg border border-white/10"
            />
          ) : (
            <button
              onClick={() => frontRef.current?.click()}
              disabled={uploading === 'front'}
              className="w-full aspect-[3/4] rounded-lg border border-dashed border-white/20
                bg-white/5 flex flex-col items-center justify-center gap-1
                text-t3 text-xs hover:border-amber/50 transition-colors min-h-[120px]"
            >
              {uploading === 'front' ? '⏳' : '📷'}
              <span>{uploading === 'front' ? 'Uploading…' : 'Tap to capture'}</span>
            </button>
          )}
          <input
            ref={frontRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCapture('front', f);
            }}
          />
        </div>

        {/* Side */}
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1 block">
            Side
          </label>
          {sidePhoto ? (
            <img
              src={sidePhoto.blobUrl}
              alt="Side progress"
              className="w-full aspect-[3/4] object-cover rounded-lg border border-white/10"
            />
          ) : (
            <button
              onClick={() => sideRef.current?.click()}
              disabled={uploading === 'side'}
              className="w-full aspect-[3/4] rounded-lg border border-dashed border-white/20
                bg-white/5 flex flex-col items-center justify-center gap-1
                text-t3 text-xs hover:border-amber/50 transition-colors min-h-[120px]"
            >
              {uploading === 'side' ? '⏳' : '📷'}
              <span>{uploading === 'side' ? 'Uploading…' : 'Tap to capture'}</span>
            </button>
          )}
          <input
            ref={sideRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCapture('side', f);
            }}
          />
        </div>
      </div>

      {/* Analyze button */}
      {photos.length > 0 && !analysis && (
        <Btn
          full
          onClick={handleAnalyze}
          disabled={analyzing}
          color="var(--teal)"
        >
          {analyzing ? 'Analyzing…' : 'Analyze with Claude'}
        </Btn>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
          <label className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-2 block">
            Claude Analysis
          </label>
          <p className="text-t2 text-xs leading-relaxed whitespace-pre-wrap">{analysis}</p>
        </div>
      )}
    </Card>
  );
}
