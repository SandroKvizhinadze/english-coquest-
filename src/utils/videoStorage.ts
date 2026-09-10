import { SavedVideoProgress, SubtitleSegment } from '../types';

const STORAGE_KEY = 'linguo_tube_saved_videos_v1';

export function loadAllSavedVideos(): SavedVideoProgress[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: SavedVideoProgress[] = JSON.parse(raw);
    return Array.isArray(list) ? list.sort((a, b) => b.lastUpdated - a.lastUpdated) : [];
  } catch (err) {
    console.warn('Failed to load saved videos from localStorage:', err);
    return [];
  }
}

export function getVideoProgress(videoId: string): SavedVideoProgress | null {
  const all = loadAllSavedVideos();
  return all.find((v) => v.videoId === videoId) || null;
}

export function saveVideoProgress(data: {
  videoId: string;
  videoUrl?: string;
  title: string;
  summary?: string;
  totalSubtitles: number;
  currentSegmentIndex: number;
  currentTime: number;
  completedSubtitlesCount: number;
  completedIds?: number[];
}): void {
  if (typeof window === 'undefined' || !data.videoId) return;

  try {
    const all = loadAllSavedVideos();
    const existingIdx = all.findIndex((v) => v.videoId === data.videoId);

    const record: SavedVideoProgress = {
      videoId: data.videoId,
      videoUrl: data.videoUrl || (existingIdx !== -1 ? all[existingIdx].videoUrl : `https://youtu.be/${data.videoId}`),
      title: data.title || (existingIdx !== -1 ? all[existingIdx].title : 'ვიდეო გაკვეთილი'),
      summary: data.summary || (existingIdx !== -1 ? all[existingIdx].summary : ''),
      totalSubtitles: data.totalSubtitles,
      completedSubtitlesCount: Math.max(0, data.completedSubtitlesCount),
      currentSegmentIndex: Math.max(0, data.currentSegmentIndex),
      currentTime: Math.max(0, data.currentTime),
      lastUpdated: Date.now(),
      completedIds: data.completedIds || (existingIdx !== -1 ? all[existingIdx].completedIds : []),
    };

    if (existingIdx !== -1) {
      all[existingIdx] = record;
    } else {
      all.unshift(record);
    }

    // Keep up to 30 most recent videos
    const pruned = all.slice(0, 30);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch (err) {
    console.warn('Failed to save video progress to localStorage:', err);
  }
}

export function deleteSavedVideo(videoId: string): SavedVideoProgress[] {
  if (typeof window === 'undefined') return [];
  try {
    const all = loadAllSavedVideos().filter((v) => v.videoId !== videoId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return all;
  } catch (err) {
    console.warn('Failed to delete saved video:', err);
    return [];
  }
}

export function clearAllSavedVideos(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {}
}
