import { SubtitleSegment } from '../types';

/**
 * Extracts a YouTube video ID from various link formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID&t=135s
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - Or raw video ID (11 chars)
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // If already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

/**
 * Extracts start timestamp (in seconds) if URL has &t=135s or &t=2m15s
 */
export function extractYouTubeStartTime(url: string): number {
  if (!url) return 0;
  const match = url.match(/[?&]t=([0-9hms]+)/i);
  if (!match) return 0;
  const val = match[1].toLowerCase();
  if (/^\d+s?$/.test(val)) return parseInt(val, 10);
  let total = 0;
  const h = val.match(/(\d+)h/);
  const m = val.match(/(\d+)m/);
  const s = val.match(/(\d+)s/);
  if (h) total += parseInt(h[1], 10) * 3600;
  if (m) total += parseInt(m[1], 10) * 60;
  if (s) total += parseInt(s[1], 10);
  return total;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Clean text for comparison:
 * Handles contractions (e.g. don't, I'm, let's), normalizes curly apostrophes,
 * removes brackets/notes like [Music], trims whitespace.
 */
export function normalizeText(text: string, ignorePunctuation = true, ignoreCase = true): string {
  if (!text) return '';
  let cleaned = text
    .replace(/\[.*?\]|\(.*?\)/g, '') // Remove [Music], (laughter), etc.
    .replace(/[\u2018\u2019]/g, "'") // Normalize smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Normalize smart double quotes
    .trim();

  if (ignoreCase) {
    cleaned = cleaned.toLowerCase();
  }

  if (ignorePunctuation) {
    // Keep internal apostrophes for contractions (e.g. don't, it's), remove all other punctuation
    cleaned = cleaned.replace(/[^\w\s']/g, ' ');
  }

  // Collapse multiple spaces into single space
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Compare target subtitle text with user's input
 */
export function compareSubtitles(
  targetText: string,
  userTyped: string,
  ignorePunctuation = true,
  ignoreCase = true
): { isMatch: boolean; accuracy: number } {
  const normTarget = normalizeText(targetText, ignorePunctuation, ignoreCase);
  const normTyped = normalizeText(userTyped, ignorePunctuation, ignoreCase);

  if (!normTarget) return { isMatch: true, accuracy: 100 };
  if (!normTyped) return { isMatch: false, accuracy: 0 };

  const isMatch = normTarget === normTyped;

  // Calculate word-level accuracy
  const targetWords = normTarget.split(' ');
  const typedWords = normTyped.split(' ');

  let matchCount = 0;
  for (let i = 0; i < Math.min(targetWords.length, typedWords.length); i++) {
    if (targetWords[i] === typedWords[i]) {
      matchCount++;
    }
  }

  const accuracy = Math.round((matchCount / targetWords.length) * 100);
  return { isMatch, accuracy };
}

export interface WordMatchStatus {
  word: string;
  status: 'correct' | 'incorrect' | 'pending' | 'extra';
}

/**
 * Computes word-by-word visual statuses to give real-time feedback while typing
 */
export function analyzeWords(targetText: string, userTyped: string): WordMatchStatus[] {
  const cleanTarget = normalizeText(targetText, true, true);
  const cleanTyped = normalizeText(userTyped, true, true);

  const targetWords = cleanTarget ? cleanTarget.split(' ') : [];
  const typedWords = cleanTyped ? cleanTyped.split(' ') : [];

  return targetWords.map((word, idx) => {
    if (idx < typedWords.length) {
      if (typedWords[idx] === word) {
        return { word, status: 'correct' };
      } else {
        return { word, status: 'incorrect' };
      }
    }
    return { word, status: 'pending' };
  });
}

/**
 * Parse an SRT (SubRip) file or text
 */
export function parseSRT(content: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

  let idCounter = 1;
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Line 0 is often index, Line 1 is timestamp: 00:00:01,000 --> 00:00:04,000
    let timeLineIdx = 0;
    if (lines[0].includes('-->')) {
      timeLineIdx = 0;
    } else if (lines.length > 1 && lines[1].includes('-->')) {
      timeLineIdx = 1;
    } else {
      continue;
    }

    const timeParts = lines[timeLineIdx].split('-->');
    if (timeParts.length !== 2) continue;

    const start = parseTimestamp(timeParts[0].trim());
    const end = parseTimestamp(timeParts[1].trim());

    const textLines = lines.slice(timeLineIdx + 1).join(' ').trim();
    if (textLines) {
      segments.push({
        id: idCounter++,
        start,
        end: end > start ? end : start + 3,
        text: textLines.replace(/<[^>]*>/g, ''), // strip html tags
      });
    }
  }

  return segments;
}

/**
 * Parse timestamps like 00:01:23,456 or 01:23.456 into seconds
 */
function parseTimestamp(timeStr: string): number {
  const normalized = timeStr.replace(',', '.').trim();
  const parts = normalized.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return parseFloat(normalized) || 0;
}

/**
 * Parses timestamped plain text like:
 * [00:05] Welcome to the podcast!
 * [00:10] Today we talk about fluency.
 */
export function parseTimestampedText(text: string): SubtitleSegment[] {
  const lines = text.split('\n');
  const segments: SubtitleSegment[] = [];
  const timeRegex = /\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\]?\s*(.+)/;

  let prevTime: number | null = null;
  let prevText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const match = line.match(timeRegex);
    if (match) {
      const time = parseTimestamp(match[1]);
      const content = match[2].trim();

      if (prevTime !== null) {
        segments.push({
          id: segments.length + 1,
          start: prevTime,
          end: time,
          text: prevText,
        });
      }

      prevTime = time;
      prevText = content;
    }
  }

  if (prevTime !== null && prevText) {
    segments.push({
      id: segments.length + 1,
      start: prevTime,
      end: prevTime + 4,
      text: prevText,
    });
  }

  return segments;
}

/**
 * Finds the index of the subtitle segment corresponding to the given video time.
 * If time falls within a segment, returns that segment's index.
 * If time falls in gaps, picks the appropriate adjacent segment.
 */
export function findSegmentIndexAtTime(segments: SubtitleSegment[], time: number): number {
  if (!segments || segments.length === 0) return 0;

  // 1. Direct match: if time is within [start, end)
  const directIdx = segments.findIndex((s) => time >= s.start && time < s.end);
  if (directIdx !== -1) return directIdx;

  // 2. Exact match at or very near end of the last segment
  const lastIdx = segments.length - 1;
  if (time >= segments[lastIdx].start) return lastIdx;

  // 3. Before first segment
  if (time < segments[0].start) return 0;

  // 4. In between segments (silence gap): pick next upcoming segment
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start > time) {
      return i;
    }
  }

  return lastIdx;
}
