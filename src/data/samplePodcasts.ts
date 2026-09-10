import { PodcastLesson } from '../types';

export const SAMPLE_PODCASTS: PodcastLesson[] = [
  {
    id: 'habits-podcast',
    title: 'Atomic Habits: The Power of Tiny Changes',
    speaker: 'James Clear (Podcast Interview)',
    level: 'Beginner',
    videoId: 'mNeX4AH91io', // Authentic YouTube video clip
    durationFormatted: '02:40',
    description: 'A clear, engaging podcast discussion on how 1% improvements every single day compound into massive results over time.',
    subtitles: [
      { id: 1, start: 0.8, end: 4.8, text: "Habits are the compound interest of self improvement." },
      { id: 2, start: 5.2, end: 9.9, text: "The same way that money multiplies through compound interest, the effects of your habits multiply." },
      { id: 3, start: 10.3, end: 14.8, text: "They seem to make little difference on any given day, and yet the impact they deliver over months and years can be enormous." },
      { id: 4, start: 15.2, end: 19.5, text: "It is only when looking back two, five, or ten years later that the value of good habits becomes strikingly obvious." },
      { id: 5, start: 20.0, end: 24.5, text: "If you can get one percent better each day for one year, you'll end up thirty-seven times better." },
      { id: 6, start: 25.0, end: 29.8, text: "Conversely, if you get one percent worse each day for one year, you'll decline nearly down to zero." },
      { id: 7, start: 30.2, end: 35.0, text: "What starts as a small win or a minor setback accumulates into something much more." },
      { id: 8, start: 35.5, end: 40.2, text: "Habits are a double-edged sword: good habits make time your ally, while bad habits make time your enemy." },
      { id: 9, start: 40.8, end: 45.5, text: "Time magnifies whatever you feed it; feed good habits and time becomes your greatest asset." }
    ]
  },
  {
    id: 'steve-jobs-speech',
    title: 'Stanford Address: Connecting The Dots',
    speaker: 'Steve Jobs',
    level: 'Intermediate',
    videoId: 'UF8uR6Z6KLc',
    durationFormatted: '03:10',
    description: 'One of the most famous and inspiring speeches in the world, with clear American diction, perfect for shadowing and dictation.',
    subtitles: [
      { id: 1, start: 1.5, end: 6.2, text: "I am honored to be with you today at your commencement from one of the finest universities in the world." },
      { id: 2, start: 6.8, end: 10.8, text: "I never graduated from college; truth be told, this is the closest I've ever gotten to a college graduation." },
      { id: 3, start: 11.4, end: 15.6, text: "Today I want to tell you three stories from my life. That's it. No big deal. Just three stories." },
      { id: 4, start: 16.2, end: 20.5, text: "The first story is about connecting the dots." },
      { id: 5, start: 21.0, end: 25.4, text: "I dropped out of Reed College after the first six months, but then stayed around as a drop-in for another eighteen months or so." },
      { id: 6, start: 26.0, end: 30.5, text: "So why did I drop out? It started before I was born." },
      { id: 7, start: 31.0, end: 35.8, text: "You can't connect the dots looking forward; you can only connect them looking backwards." },
      { id: 8, start: 36.4, end: 41.5, text: "So you have to trust that the dots will somehow connect in your future." },
      { id: 9, start: 42.0, end: 47.2, text: "You have to trust in something: your gut, destiny, life, karma, whatever." }
    ]
  },
  {
    id: 'english-podcast-conversation',
    title: 'How to Think in English without Translating',
    speaker: 'Emma (English Teacher & Podcaster)',
    level: 'Intermediate',
    videoId: 'FUW_FN8ZmaU',
    durationFormatted: '02:15',
    description: 'Conversational podcast tips on stopping mental translation from your native language and forming direct thoughts in English.',
    subtitles: [
      { id: 1, start: 1.0, end: 5.5, text: "If you want to speak English fluently, you must learn to think directly in English." },
      { id: 2, start: 6.0, end: 10.8, text: "When you translate every sentence in your head, conversations become slow and frustrating." },
      { id: 3, start: 11.2, end: 15.5, text: "The secret is to start small by naming objects around you in English throughout the day." },
      { id: 4, start: 16.0, end: 20.8, text: "Look around your room right now: table, window, notebook, headphones." },
      { id: 5, start: 21.2, end: 26.0, text: "Step two is to think in simple sentences whenever you perform everyday actions." },
      { id: 6, start: 26.5, end: 31.0, text: "For instance: I am drinking water, or I need to answer this email." },
      { id: 7, start: 31.5, end: 36.5, text: "With daily practice, this simple routine will retrain your brain to think automatically." }
    ]
  },
  {
    id: 'ted-ed-learning',
    title: 'How Sleep Affects Your Brain and Memory',
    speaker: 'TED-Ed English Educational Series',
    level: 'Advanced',
    videoId: 'gedoSfZvBgE',
    durationFormatted: '02:50',
    description: 'Rich scientific vocabulary and rhythmic narration detailing the neurology of memory consolidation during sleep.',
    subtitles: [
      { id: 1, start: 1.2, end: 6.0, text: "It is late at night and you are cramming for a major exam tomorrow morning." },
      { id: 2, start: 6.5, end: 11.0, text: "You know you should get some rest, but you still have chapters left to read." },
      { id: 3, start: 11.5, end: 16.2, text: "Is it worth sacrificing sleep to study just a little bit more?" },
      { id: 4, start: 16.8, end: 21.5, text: "Neuroscientists have discovered that sleep is not merely downtime for your body." },
      { id: 5, start: 22.0, end: 27.0, text: "During deep sleep, your brain actively reorganizes and strengthens newly acquired memories." },
      { id: 6, start: 27.5, end: 32.5, text: "Without adequate sleep, your capacity to absorb new information drops dramatically." }
    ]
  }
];
