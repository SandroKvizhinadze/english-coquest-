import { SubtitleSegment } from '../types';
import { SAMPLE_PODCASTS } from '../data/samplePodcasts';

// Helper: Decode HTML entities
export function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

// Group small caption pieces into natural spoken sentences
export function groupRawCaptions(rawItems: { text: string; offset: number; duration: number }[]): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  let currentTokens: string[] = [];
  let start = 0;
  let end = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    const cleaned = decodeHTMLEntities(item.text)
      .replace(/[♪♫♩♬]/g, '')
      .replace(/\[(?:Applause|Laughter|Music|Cheering|Whispering)\]/gi, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\(\s*\)/g, '')
      .trim();

    if (!cleaned) continue;

    if (currentTokens.length === 0) {
      start = Math.round(item.offset * 100) / 100;
    }

    currentTokens.push(cleaned);
    end = Math.round((item.offset + item.duration) * 100) / 100;

    const fullSentence = currentTokens.join(' ').replace(/\s+/g, ' ').trim();
    const words = fullSentence.split(' ');
    const endsWithPunctuation = /[.?!]$/.test(cleaned);

    if (endsWithPunctuation || words.length >= 10 || (end - start >= 5.0)) {
      if (fullSentence.length > 0) {
        segments.push({
          id: segments.length + 1,
          start,
          end: Math.max(end, start + 1.5),
          text: fullSentence,
        });
      }
      currentTokens = [];
    }
  }

  if (currentTokens.length > 0) {
    const fullSentence = currentTokens.join(' ').replace(/\s+/g, ' ').trim();
    if (fullSentence.length > 0) {
      segments.push({
        id: segments.length + 1,
        start,
        end: Math.max(end, start + 1.5),
        text: fullSentence,
      });
    }
  }

  return segments;
}

// Fetch public transcript from youtube-transcript.ai (has open CORS and works both in browser & server)
export async function fetchFromTranscriptAi(videoId: string): Promise<{ title: string | null; segments: SubtitleSegment[] } | null> {
  try {
    const res = await fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt`, {
      headers: {
        Accept: 'text/plain, text/markdown, */*',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 50 || text.includes('No transcript found')) return null;

    const titleMatch = text.match(/^# Transcript:\s*(.+)$/m);
    const extractedTitle = titleMatch ? titleMatch[1].trim() : null;

    const transcriptIdx = text.indexOf('## Transcript');
    const body = transcriptIdx !== -1 ? text.slice(transcriptIdx + '## Transcript'.length) : text;

    const regex = /\[(\d+(?::\d+)+)\]\s*([^\[]+)/g;
    let match;
    const blocks: { start: number; end: number; text: string }[] = [];

    function parseTime(str: string): number {
      const parts = str.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return 0;
    }

    while ((match = regex.exec(body)) !== null) {
      const timeStr = match[1];
      const raw = match[2].trim().replace(/\n+/g, ' ');
      blocks.push({ start: parseTime(timeStr), end: 0, text: raw });
    }

    if (blocks.length === 0) return null;

    for (let i = 0; i < blocks.length; i++) {
      blocks[i].end = blocks[i + 1] ? blocks[i + 1].start : blocks[i].start + 15;
    }

    const segments: SubtitleSegment[] = [];
    for (const b of blocks) {
      const cleaned = b.text.replace(/^[-\s]+/, '').trim();
      const rawSentences = cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [cleaned];
      const sentences = rawSentences.map((s) => s.trim()).filter((s) => s.length > 0);

      if (sentences.length <= 1) {
        segments.push({
          id: segments.length + 1,
          start: b.start,
          end: Math.max(b.start + 1.5, b.end),
          text: cleaned,
        });
      } else {
        const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
        const totalDuration = Math.max(b.end - b.start, 2);
        let cur = b.start;
        for (let i = 0; i < sentences.length; i++) {
          const s = sentences[i];
          const dur = Math.round(((s.length / totalChars) * totalDuration) * 10) / 10;
          const sStart = Math.round(cur * 10) / 10;
          const sEnd = i === sentences.length - 1 ? b.end : Math.round((cur + dur) * 10) / 10;
          segments.push({
            id: segments.length + 1,
            start: sStart,
            end: Math.max(sStart + 1.5, sEnd),
            text: s,
          });
          cur += dur;
        }
      }
    }

    return { title: extractedTitle, segments };
  } catch (err: any) {
    console.warn('Notice from transcript fetcher:', err?.message || 'unknown');
    return null;
  }
}

// Client-side extraction fallback (works anywhere, including Vercel, Netlify, or offline)
export async function extractSubtitlesClientSide(videoId: string): Promise<{
  success: boolean;
  subtitles: SubtitleSegment[];
  title?: string;
  plan?: any;
  error?: string;
}> {
  const cleanId = videoId.trim();

  // Tier 1: Check known sample podcasts
  const matchedSample = SAMPLE_PODCASTS.find((p) => p.videoId === cleanId);
  if (matchedSample) {
    return {
      success: true,
      subtitles: matchedSample.subtitles.map((s, idx) => ({
        id: idx + 1,
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      title: matchedSample.title,
      plan: {
        title: matchedSample.title,
        summary: matchedSample.description || 'ინგლისურის მოსმენისა და კარნახის პრაქტიკა.',
        level: matchedSample.level || 'Intermediate',
        keyVocabulary: (matchedSample as any).keyVocabulary || [],
      },
    };
  }

  // Tier 2: Fetch via transcript.ai directly from browser (enabled via CORS)
  try {
    const aiData = await fetchFromTranscriptAi(cleanId);
    if (aiData && aiData.segments.length > 0) {
      return {
        success: true,
        subtitles: aiData.segments,
        title: aiData.title || `YouTube Video (${cleanId})`,
        plan: {
          title: aiData.title || `YouTube Video (${cleanId})`,
          summary: 'ინგლისურის მოსმენისა და კარნახის პრაქტიკა.',
          level: 'Intermediate',
          keyVocabulary: [],
        },
      };
    }
  } catch {}

  return {
    success: false,
    subtitles: [],
    error: 'ამ ვიდეოზე ავტომატური სუბტიტრები ვერ მოიძებნა. შეგიძლიათ ჩასვათ ტრანსკრიპტი ან SRT ქვემოთ:',
  };
}
