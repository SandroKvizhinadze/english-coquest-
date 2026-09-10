import React, { useState } from 'react';
import { SubtitleSegment } from '../types';
import { extractYouTubeVideoId, parseSRT, parseTimestampedText } from '../utils/subtitleParser';
import { X, Youtube, FileText, Upload, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ImportPodcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadCustomPodcast: (videoId: string, title: string, subtitles: SubtitleSegment[]) => void;
}

export const ImportPodcastModal: React.FC<ImportPodcastModalProps> = ({
  isOpen,
  onClose,
  onLoadCustomPodcast,
}) => {
  const [activeTab, setActiveTab] = useState<'url' | 'paste' | 'file'>('url');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFetchFromUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFallbackWarning(null);

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      setError('Please enter a valid YouTube video link or 11-character video ID.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/subtitles?videoId=${encodeURIComponent(videoId)}&lang=en`);
      const data = await res.json();

      if (data.success && data.subtitles && data.subtitles.length > 0) {
        onLoadCustomPodcast(
          videoId,
          customTitle.trim() || `YouTube Podcast (${videoId})`,
          data.subtitles
        );
        onClose();
      } else {
        // Subtitles not directly extractable due to YouTube bot protection or video lacking captions
        setFallbackWarning(
          data.error ||
            'YouTube captions could not be automatically downloaded for this link. You can paste an SRT or transcript below, or use Gemini AI to generate segments!'
        );
        setActiveTab('paste');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to subtitle service.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPastedSubtitles = async () => {
    const videoId = extractYouTubeVideoId(youtubeUrl) || 'mNeX4AH91io';
    if (!pastedText.trim()) {
      setError('Please paste subtitle content or transcript text.');
      return;
    }

    setError(null);

    // Check if it looks like SRT format (contains -->)
    if (pastedText.includes('-->')) {
      const segments = parseSRT(pastedText);
      if (segments.length > 0) {
        onLoadCustomPodcast(
          videoId,
          customTitle.trim() || `YouTube Podcast (${videoId})`,
          segments
        );
        onClose();
        return;
      }
    }

    // Check if it has timestamps like [00:04]
    const timestampSegments = parseTimestampedText(pastedText);
    if (timestampSegments.length > 0) {
      onLoadCustomPodcast(
        videoId,
        customTitle.trim() || `YouTube Podcast (${videoId})`,
        timestampSegments
      );
      onClose();
      return;
    }

    // Otherwise, ask Gemini to parse and align the raw text
    setLoading(true);
    try {
      const res = await fetch('/api/ai/parse-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: pastedText, estimatedDuration: 180 }),
      });
      const data = await res.json();

      if (data.success && data.segments && data.segments.length > 0) {
        onLoadCustomPodcast(
          videoId,
          customTitle.trim() || `YouTube Podcast (${videoId})`,
          data.segments
        );
        onClose();
      } else {
        setError('Could not format subtitles from the text. Please provide timestamps or SRT format.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to process transcript text.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const segments = parseSRT(content);
        if (segments.length > 0) {
          const videoId = extractYouTubeVideoId(youtubeUrl) || 'mNeX4AH91io';
          onLoadCustomPodcast(
            videoId,
            file.name.replace(/\.(srt|vtt|txt)$/i, ''),
            segments
          );
          onClose();
        } else {
          setError('Could not parse subtitles from uploaded file. Please make sure it is a valid .srt or .vtt file.');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        id="import-podcast-modal"
        className="relative w-full max-w-xl bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl text-stone-100"
      >
        <button
          id="close-import-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Youtube className="w-6 h-6 text-red-500" />
          <h2 className="text-lg font-bold text-white">
            Load YouTube Podcast & Subtitles
          </h2>
        </div>
        <p className="text-xs text-stone-400 mb-5">
          Paste any YouTube link to load the video and practice dictating its subtitles.
        </p>

        {/* Tab switcher */}
        <div className="flex border-b border-stone-800 mb-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('url')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'url'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Youtube className="w-4 h-4" />
            <span>YouTube Link</span>
          </button>

          <button
            onClick={() => setActiveTab('paste')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'paste'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Paste Transcript / SRT</span>
          </button>

          <button
            onClick={() => setActiveTab('file')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'file'
                ? 'border-amber-400 text-amber-300 font-semibold'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload .SRT File</span>
          </button>
        </div>

        {fallbackWarning && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{fallbackWarning}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Tab 1: YouTube Link */}
        {activeTab === 'url' && (
          <form onSubmit={handleFetchFromUrl} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                YouTube Video / Podcast Link:
              </label>
              <input
                id="youtube-url-input"
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
              />
              <p className="mt-1 text-[11px] text-stone-500">
                Supports standard YouTube URLs, short URLs (youtu.be), or 11-char video IDs.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Lesson Title (Optional):
              </label>
              <input
                id="youtube-title-input"
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. My Favorite Podcast Episode"
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>

              <button
                id="load-podcast-btn"
                type="submit"
                disabled={loading || !youtubeUrl.trim()}
                className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  loading || !youtubeUrl.trim()
                    ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Fetching Captions...</span>
                  </>
                ) : (
                  <>
                    <Youtube className="w-3.5 h-3.5 text-red-600" />
                    <span>Load Podcast & Subtitles</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Paste Transcript / SRT */}
        {activeTab === 'paste' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                YouTube Link or ID for Video:
              </label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                Paste SRT, Timestamps, or Raw Text:
              </label>
              <textarea
                id="paste-transcript-textarea"
                rows={6}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Example SRT format:
1
00:00:01,000 --> 00:00:04,500
Hello and welcome to the English podcast!

Or simple timestamps:
[00:01] Hello and welcome to the English podcast!
[00:05] Today we discuss fluency habits.

Or just paste raw spoken text and Gemini will align timestamps!`}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-xl"
              >
                Cancel
              </button>

              <button
                id="apply-pasted-subtitles-btn"
                type="button"
                onClick={handleApplyPastedSubtitles}
                disabled={loading || !pastedText.trim()}
                className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  loading || !pastedText.trim()
                    ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Apply & Start Practicing</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Upload .SRT File */}
        {activeTab === 'file' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                YouTube Video Link:
              </label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="border-2 border-dashed border-stone-800 hover:border-amber-500/60 rounded-2xl p-8 text-center transition-colors">
              <Upload className="w-8 h-8 mx-auto text-amber-400 mb-3" />
              <p className="text-sm font-medium text-stone-200 mb-1">
                Select .SRT or .VTT Subtitle File
              </p>
              <p className="text-xs text-stone-500 mb-4">
                Upload exported subtitles from YouTube or your podcast transcript file
              </p>
              <input
                id="upload-srt-file-input"
                type="file"
                accept=".srt,.vtt,.txt"
                onChange={handleFileUpload}
                className="text-xs text-stone-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-stone-800 file:text-amber-400 hover:file:bg-stone-700 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
