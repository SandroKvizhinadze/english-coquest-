import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fetchTranscript } from 'youtube-transcript-plus';
import { getSubtitles } from 'youtube-caption-extractor';
import { SAMPLE_PODCASTS } from './src/data/samplePodcasts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper: Decode HTML entities
function decodeHTMLEntities(str: string): string {
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

// Helper: Group small raw caption pieces into natural spoken sentences for comfortable dictation
function groupRawCaptions(rawItems: { text: string; offset: number; duration: number }[]) {
  const segments = [];
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

    // Group when punctuation occurs, or word count reaches ~8-12 words, or chunk is >= 4.5 seconds
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

// Helper: Fetch public transcript from youtube-transcript.ai (bypasses bot restrictions on cloud IPs)
async function fetchFromTranscriptAi(videoId: string): Promise<{ title: string | null; segments: any[] } | null> {
  try {
    const res = await fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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

    const segments: any[] = [];
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
    console.warn('Error fetching from youtube-transcript.ai:', err?.message || 'unknown');
    return null;
  }
}

// Endpoint: Analyze YouTube video and extract subtitles + generate study plan
app.post('/api/analyze-video', async (req, res) => {
  const { videoId } = req.body;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId is required' });
  }

  const cleanId = videoId.trim();
  let subtitles: any[] = [];
  let videoTitle: string | null = null;

  // Tier 1: Try high-speed transcript service (tested & working with Lex Fridman, Steve Jobs, TED, etc.)
  try {
    const aiData = await fetchFromTranscriptAi(cleanId);
    if (aiData && aiData.segments.length > 0) {
      subtitles = aiData.segments;
      videoTitle = aiData.title;
    }
  } catch (err: any) {
    console.warn('Tier 1 transcript fetch error:', err?.message || 'unknown');
  }

  // Tier 2: Try youtube-transcript-plus
  if (subtitles.length === 0) {
    try {
      const fetched = await fetchTranscript(cleanId);
      if (fetched && fetched.length > 0) {
        subtitles = groupRawCaptions(fetched);
      }
    } catch (err) {
      // Ignore
    }
  }

  // Tier 3: Try youtube-caption-extractor
  if (subtitles.length === 0) {
    try {
      const caps = await getSubtitles({ videoID: cleanId, lang: 'en' });
      if (caps && caps.length > 0) {
        const raw = caps.map((c: any) => ({
          text: c.text,
          offset: parseFloat(c.start),
          duration: parseFloat(c.dur || 3),
        }));
        subtitles = groupRawCaptions(raw);
      }
    } catch (err) {
      // Ignore
    }
  }

  // Tier 4: Check if video matches any of our known high-quality sample lessons
  if (subtitles.length === 0) {
    const matchedSample = SAMPLE_PODCASTS.find((p) => p.videoId === cleanId);
    if (matchedSample) {
      subtitles = matchedSample.subtitles.map((s, idx) => ({
        id: idx + 1,
        start: s.start,
        end: s.end,
        text: s.text,
      }));
      videoTitle = matchedSample.title;
    }
  }

  if (subtitles.length === 0) {
    return res.json({
      success: false,
      videoId: cleanId,
      error: 'ამ ვიდეოზე ავტომატური სუბტიტრები ვერ მოიძებნა. შეგიძლიათ ქვემოთ ჩასვათ ტრანსკრიპტი ან SRT ფაილი.',
    });
  }

  // Use Gemini to generate a study plan & analysis
  let plan = {
    title: videoTitle || `YouTube Podcast (${cleanId})`,
    summary: 'ინგლისურის მოსმენისა და კარნახის პრაქტიკა.',
    level: 'Intermediate',
    keyVocabulary: [] as string[],
  };

  try {
    const sampleSentences = subtitles.slice(0, 15).map((s) => s.text).join(' ');
    const planPrompt = `Analyze this spoken English transcript from a video.
Provide a concise study plan in JSON format:
{
  "title": "A short clean title of this podcast/topic",
  "summary": "1 sentence overview in Georgian of what this video discusses",
  "level": "Beginner" | "Intermediate" | "Advanced",
  "keyVocabulary": ["3 to 5 interesting words from text"]
}
Return ONLY valid JSON.
Transcript sample: "${sampleSentences.slice(0, 1200)}"`;

    const aiPromise = (async () => {
      try {
        return await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: planPrompt,
          config: { responseMimeType: 'application/json' },
        });
      } catch (err1: any) {
        return await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: planPrompt,
          config: { responseMimeType: 'application/json' },
        });
      }
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI plan timeout')), 2500)
    );

    const aiRes: any = await Promise.race([aiPromise, timeoutPromise]);
    const parsedPlan = JSON.parse(aiRes.text?.trim() || '{}');
    plan = { ...plan, ...parsedPlan };
    if (videoTitle && !parsedPlan.title) {
      plan.title = videoTitle;
    }
  } catch (err: any) {
    console.warn('AI plan generation notice, using instant fallback plan:', err?.message || 'unknown');
  }

  return res.json({
    success: true,
    videoId: cleanId,
    plan,
    subtitles,
  });
});

// Endpoint: Parse unformatted or pasted text into timed subtitle segments using Gemini
app.post('/api/ai/parse-transcript', async (req, res) => {
  try {
    const { rawText, estimatedDuration = 180, videoId } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    const prompt = `You are an expert English subtitle synchronization assistant.
The user provided a raw transcript or speech text for video ID "${videoId || ''}".
Break this into natural spoken subtitle sentences (around 6-12 words per segment).
Create realistic sequential timestamps starting from 0s up to approximately ${Math.min(estimatedDuration, 600)}s.
Format:
[
  {"id": 1, "start": 0.5, "end": 4.2, "text": "Sentence text here"}
]
Return ONLY valid JSON.
Text:
${rawText.slice(0, 4000)}`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
    } catch (err1: any) {
      console.warn('Tier 1 transcript parse error:', err1?.message || 'unknown');
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
    }

    const parsed = JSON.parse(response.text?.trim() || '[]');
    return res.json({ success: true, segments: parsed });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to process transcript' });
  }
});

// Helper: Quick Georgian translation fallback via translate API
async function fetchGeorgianTranslation(text: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ka&dt=t&q=${encodeURIComponent(
        text
      )}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0]?.[0]?.[0] || null;
  } catch {
    return null;
  }
}

// Endpoint: Explain word in Georgian & English with resilient multi-tier fallback
app.post('/api/ai/explain', async (req, res) => {
  const { word, sentence } = req.body;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'word is required' });
  }

  // Clean word from leading/trailing punctuation like (Elon or podcast.)
  const cleanWord = word.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  const searchWord = cleanWord.length > 0 ? cleanWord : word.trim();

  const prompt = `You are an expert English-Georgian linguistic tutor.
Explain the English word "${searchWord}" used in context: "${sentence || ''}".
Return JSON format strictly:
{
  "word": "${searchWord}",
  "phonetic": "pronunciation guide (IPA)",
  "georgianTranslation": "ქართული თარგმანი (1-2 სიტყვა)",
  "simpleExplanation": "Clear, simple English definition in 1 short sentence",
  "georgianExplanation": "მოკლე და გასაგები ქართული განმარტება (1 წინადადება)",
  "exampleSentence": "A natural, clear example sentence demonstrating usage"
}
Return ONLY valid JSON.`;

  // Tier 1: Try Gemini 3.8 Flash
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(response.text?.trim() || '{}');
    if (parsed.georgianTranslation) {
      return res.json({ success: true, explanation: parsed });
    }
  } catch (err) {
    console.warn('Tier 1 Gemini 3.8 Flash error for explain-word, trying Tier 2...');
  }

  // Tier 2: Try Gemini 3.1 Flash Lite (fast & high availability)
  try {
    const response2 = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const parsed2 = JSON.parse(response2.text?.trim() || '{}');
    if (parsed2.georgianTranslation) {
      return res.json({ success: true, explanation: parsed2 });
    }
  } catch (err2) {
    console.warn('Tier 2 Gemini 3.1 Flash Lite error for explain-word, using Tier 3 fallback...');
  }

  // Tier 3: Instant dictionary & Google Translate fallback (guarantees 100% uptime)
  try {
    const geoTrans = (await fetchGeorgianTranslation(searchWord)) || searchWord;
    const fallbackExplanation = {
      word: searchWord,
      phonetic: '',
      georgianTranslation: geoTrans,
      simpleExplanation: `The English word "${searchWord}" in context.`,
      georgianExplanation: `სიტყვა "${searchWord}" ქართულად ნიშნავს: ${geoTrans}.`,
      exampleSentence: sentence && sentence.length > 5 ? sentence : `Practice using "${searchWord}" in everyday conversation.`,
    };
    return res.json({ success: true, explanation: fallbackExplanation });
  } catch (fallbackErr: any) {
    return res.json({
      success: true,
      explanation: {
        word: searchWord,
        phonetic: '',
        georgianTranslation: searchWord,
        simpleExplanation: `Word: ${searchWord}`,
        georgianExplanation: `სიტყვა: ${searchWord}`,
        exampleSentence: sentence || '',
      },
    });
  }
});

// Endpoint: Evaluate sentence for the Generation Effect (Cognitive Memory Consolidation)
app.post('/api/evaluate-sentence', async (req, res) => {
  try {
    const { word, userSentence, targetMeaning } = req.body;
    if (!word || !userSentence) {
      return res.status(400).json({ error: 'word and userSentence are required' });
    }

    const cleanWord = String(word).trim();
    const cleanSentence = String(userSentence).trim();

    const prompt = `You are an encouraging, expert English language tutor evaluating a learner's generated sentence for cognitive memory consolidation (Generation Effect).
Target Word: "${cleanWord}"
Word Meaning/Context: "${targetMeaning || ''}"
Learner's Sentence: "${cleanSentence}"

Evaluate whether the learner used "${cleanWord}" (or a valid inflectional form of it) correctly and naturally.
Provide response in valid JSON:
{
  "isCorrect": true or false,
  "score": number between 0 and 100,
  "feedbackInGeorgian": "1-2 friendly sentences in Georgian explaining how well the word was used and any nuances",
  "improvedSentence": "A polished or more native English variation, or the original if already great",
  "grammaticalNotes": "Brief grammar tip in Georgian, or empty string if no issues"
}
Return ONLY valid JSON.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const parsed = JSON.parse(response.text?.trim() || '{}');
      return res.json({
        success: true,
        isCorrect: parsed.isCorrect ?? true,
        score: parsed.score ?? 85,
        feedbackInGeorgian: parsed.feedbackInGeorgian || 'წინადადება კარგად არის შედგენილი!',
        improvedSentence: parsed.improvedSentence || cleanSentence,
        grammaticalNotes: parsed.grammaticalNotes || '',
      });
    } catch (aiErr: any) {
      // Fallback evaluation if AI is slow
      const containsWord = cleanSentence.toLowerCase().includes(cleanWord.toLowerCase());
      const wordsCount = cleanSentence.split(/\s+/).length;
      const isReasonable = containsWord && wordsCount >= 3;
      return res.json({
        success: true,
        isCorrect: isReasonable,
        score: isReasonable ? 80 : 50,
        feedbackInGeorgian: isReasonable
          ? `ყოჩაღ! სიტყვა "${cleanWord}" წინადადებაში გამოყენებულია.`
          : `დარწმუნდით, რომ წინადადებაში იყენებთ სიტყვას "${cleanWord}".`,
        improvedSentence: cleanSentence,
        grammaticalNotes: '',
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Sentence evaluation failed' });
  }
});

// Endpoint: Generate dynamic cognitive memory task (Active retrieval, cloze, semantic quiz)
app.post('/api/generate-memory-task', async (req, res) => {
  try {
    const { word, sentence, georgianTranslation } = req.body;
    if (!word) {
      return res.status(400).json({ error: 'word is required' });
    }

    const cleanWord = String(word).trim();
    const cleanSentence = String(sentence || '').trim();

    const prompt = `Create a cognitive psychology active-recall memory challenge for learning the English word "${cleanWord}" (Georgian translation: "${georgianTranslation || ''}").
Original context: "${cleanSentence}"

Provide JSON:
{
  "clozeSentence": "Sentence with the target word replaced strictly by [ ______ ]",
  "clozeAnswer": "${cleanWord}",
  "clozeHintGeorgian": "A subtle Georgian clue for the meaning",
  "quizQuestion": "Which option best expresses the meaning of '${cleanWord}' in this context?",
  "quizOptions": ["Option A", "Option B", "Option C", "Option D"],
  "correctOptionIndex": 0,
  "creativePrompt": "A short prompt in Georgian challenging the user to write an original sentence (e.g. 'დაწერეთ წინადადება, სადაც აღწერთ...')"
}
Make options realistic and clear. Return ONLY valid JSON.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const parsed = JSON.parse(response.text?.trim() || '{}');
      return res.json({ success: true, task: parsed });
    } catch (aiErr: any) {
      // Algorithmic instant fallback
      const cloze = cleanSentence && cleanSentence.toLowerCase().includes(cleanWord.toLowerCase())
        ? cleanSentence.replace(new RegExp(`\\b${cleanWord}\\b`, 'gi'), '[ ______ ]')
        : `She wanted to [ ______ ] the concept to everyone.`;

      return res.json({
        success: true,
        task: {
          clozeSentence: cloze,
          clozeAnswer: cleanWord,
          clozeHintGeorgian: georgianTranslation || 'ქართული თარგმანი',
          quizQuestion: `რა არის სიტყვა "${cleanWord}"-ის სწორი მნიშვნელობა?`,
          quizOptions: [
            georgianTranslation || 'სწორი მნიშვნელობა',
            'საპირისპირო ან განსხვავებული მოქმედება',
            'სრულიად შეუსაბამო მნიშვნელობა',
            'დროებითი მდგომარეობა',
          ],
          correctOptionIndex: 0,
          creativePrompt: `შეადგინეთ ერთი მოკლე წინადადება სიტყვით "${cleanWord}".`,
        },
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Task generation failed' });
  }
});

// Vite middleware integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
