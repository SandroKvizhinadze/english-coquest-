import express from 'express';
import { getGeminiClient } from './geminiService';
import { fetchFromTranscriptAi, groupRawCaptions } from '../utils/transcriptFetcher';
import { fetchTranscript } from 'youtube-transcript-plus';
import { getSubtitles } from 'youtube-caption-extractor';
import { SAMPLE_PODCASTS } from '../data/samplePodcasts';

const app = express();

app.use(express.json());

// CORS for cross-domain / serverless flexibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok' });
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

// Handler: Analyze YouTube video and extract subtitles + study plan
async function handleAnalyzeVideo(cleanId: string) {
  let subtitles: any[] = [];
  let videoTitle: string | null = null;

  // Tier 1: Try public transcript service (bypasses bot restrictions on cloud IPs)
  try {
    const aiData = await fetchFromTranscriptAi(cleanId);
    if (aiData && aiData.segments.length > 0) {
      subtitles = aiData.segments;
      videoTitle = aiData.title;
    }
  } catch (err: any) {
    console.warn('Tier 1 transcript fetch notice:', err?.message || 'unknown');
  }

  // Tier 2: Try youtube-transcript-plus
  if (subtitles.length === 0) {
    try {
      const fetched = await fetchTranscript(cleanId);
      if (fetched && fetched.length > 0) {
        subtitles = groupRawCaptions(fetched);
      }
    } catch {}
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
    } catch {}
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
    return {
      success: false,
      videoId: cleanId,
      error: 'ამ ვიდეოზე ავტომატური სუბტიტრები ვერ მოიძებნა. შეგიძლიათ ქვემოთ ჩასვათ ტრანსკრიპტი ან SRT ფაილი.',
    };
  }

  // Study plan setup
  let plan = {
    title: videoTitle || `YouTube Podcast (${cleanId})`,
    summary: 'ინგლისურის მოსმენისა და კარნახის პრაქტიკა.',
    level: 'Intermediate',
    keyVocabulary: [] as string[],
  };

  const ai = getGeminiClient();
  if (ai) {
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
      console.warn('AI plan notice, using instant fallback plan:', err?.message || 'unknown');
    }
  }

  return {
    success: true,
    videoId: cleanId,
    plan,
    subtitles,
  };
}

// Endpoint: Analyze YouTube video
app.post(['/api/analyze-video', '/analyze-video'], async (req, res) => {
  const { videoId } = req.body;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId is required' });
  }
  const result = await handleAnalyzeVideo(videoId.trim());
  return res.json(result);
});

// Endpoint: Subtitles query alias
app.get(['/api/subtitles', '/subtitles'], async (req, res) => {
  const videoId = req.query.videoId as string;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId is required' });
  }
  const result = await handleAnalyzeVideo(videoId.trim());
  return res.json(result);
});

// Endpoint: Parse unformatted text into timed subtitles
app.post(['/api/ai/parse-transcript', '/ai/parse-transcript'], async (req, res) => {
  try {
    const { rawText, estimatedDuration = 180, videoId } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Algorithmic sentence splitter if Gemini key is not configured
      const sentences = rawText
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const step = Math.min(estimatedDuration / Math.max(sentences.length, 1), 6);
      const segments = sentences.map((s, idx) => ({
        id: idx + 1,
        start: Math.round(idx * step * 10) / 10,
        end: Math.round((idx + 1) * step * 10) / 10,
        text: s,
      }));
      return res.json({ success: true, segments });
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
    } catch {
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

// Endpoint: Explain word in Georgian & English
app.post(['/api/ai/explain', '/ai/explain'], async (req, res) => {
  const { word, sentence } = req.body;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'word is required' });
  }

  const cleanWord = word.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  const searchWord = cleanWord.length > 0 ? cleanWord : word.trim();

  const ai = getGeminiClient();
  if (ai) {
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
    } catch {
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
      } catch {}
    }
  }

  // Fallback translation
  try {
    const geoTrans = (await fetchGeorgianTranslation(searchWord)) || searchWord;
    return res.json({
      success: true,
      explanation: {
        word: searchWord,
        phonetic: '',
        georgianTranslation: geoTrans,
        simpleExplanation: `The English word "${searchWord}" in context.`,
        georgianExplanation: `სიტყვა "${searchWord}" ქართულად ნიშნავს: ${geoTrans}.`,
        exampleSentence: sentence && sentence.length > 5 ? sentence : `Practice using "${searchWord}" in everyday conversation.`,
      },
    });
  } catch {
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

// Endpoint: Evaluate sentence
app.post(['/api/evaluate-sentence', '/evaluate-sentence'], async (req, res) => {
  try {
    const { word, userSentence, targetMeaning } = req.body;
    if (!word || !userSentence) {
      return res.status(400).json({ error: 'word and userSentence are required' });
    }

    const cleanWord = String(word).trim();
    const cleanSentence = String(userSentence).trim();

    const ai = getGeminiClient();
    if (ai) {
      const prompt = `You are an encouraging, expert English language tutor evaluating a learner's generated sentence.
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
      } catch {}
    }

    // Algorithmic evaluation fallback
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
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Sentence evaluation failed' });
  }
});

// Endpoint: Generate dynamic memory task
app.post(['/api/generate-memory-task', '/generate-memory-task'], async (req, res) => {
  try {
    const { word, sentence, georgianTranslation } = req.body;
    if (!word) {
      return res.status(400).json({ error: 'word is required' });
    }

    const cleanWord = String(word).trim();
    const cleanSentence = String(sentence || '').trim();

    const ai = getGeminiClient();
    if (ai) {
      const prompt = `Create an active-recall memory challenge for learning the English word "${cleanWord}" (Georgian translation: "${georgianTranslation || ''}").
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
      } catch {}
    }

    // Algorithmic fallback
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
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Task generation failed' });
  }
});

export default app;
