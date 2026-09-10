import { VocabularyItem } from '../types';
import { getStageInfo } from './spacedRepetition';

const NOTIFICATIONS_ENABLED_KEY = 'linguo_phone_notifications_enabled';
const LAST_NOTIFIED_MAP_KEY = 'linguo_last_notified_words_v1';

let swRegistration: ServiceWorkerRegistration | null = null;

// Initialize Service Worker
export async function initNotificationService(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('Notification Service Worker registered successfully');
    } catch (err: any) {
      console.warn('Service Worker registration note:', err?.message || 'unknown');
    }
  }
}

export function isNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export function areNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  if (saved === 'false') return false;
  return getNotificationPermission() === 'granted';
}

export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

// Play notification sound
export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Pleasant two-tone chime (E5 -> G#5 -> B5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc1.frequency.exponentialRampToValueAtTime(830.61, now + 0.12); // G#5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.12); // B5
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.61);
  } catch {}
}

// Request permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    setNotificationsEnabled(granted);

    if (granted) {
      playNotificationChime();
      // Show confirmation
      await sendPhoneNotification('🔔 შეტყობინებები ჩართულია!', {
        body: 'ყოველ 30 წთ, 1 სთ, 4 სთ და 1 დღეში მიიღებთ მეცნიერულ დავალებებს სიტყვების დასამახსოვრებლად.',
        tag: 'linguo-welcome',
      });
    }

    return granted;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return false;
  }
}

// Send phone/desktop notification
export async function sendPhoneNotification(
  title: string,
  options: {
    body: string;
    tag?: string;
    data?: any;
    requireInteraction?: boolean;
  }
): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const fullOptions: any = {
    body: options.body,
    tag: options.tag || `linguo-${Date.now()}`,
    data: options.data || {},
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200, 100, 200], // Phone vibration pattern
    requireInteraction: options.requireInteraction ?? false,
    silent: false,
  };

  playNotificationChime();

  // Try Service Worker registration first (works best on mobile PWA & Android)
  if (swRegistration && 'showNotification' in swRegistration) {
    try {
      await swRegistration.showNotification(title, fullOptions);
      return true;
    } catch (swErr) {
      console.warn('SW notification fallback to window.Notification:', swErr);
    }
  }

  // Fallback to standard window Notification
  try {
    const n = new Notification(title, fullOptions);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch (err: any) {
    console.error('Notification display error:', err?.message || 'unknown');
    return false;
  }
}

// Test notification button helper
export async function sendTestNotification(): Promise<boolean> {
  const perm = getNotificationPermission();
  if (perm !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) return false;
  }

  return sendPhoneNotification('🧠 ტესტ-შეტყობინება ტელეფონზე', {
    body: 'შეტყობინებები გამართულია! 30 წუთში, 1 საათში და ა.შ. მიიღებთ დავალებებს.',
    tag: 'linguo-test-alert',
    requireInteraction: true,
  });
}

// Track recently notified items to avoid duplicates
function getRecentlyNotifiedMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_NOTIFIED_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function recordNotificationSent(wordId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const map = getRecentlyNotifiedMap();
    map[wordId] = Date.now();
    localStorage.setItem(LAST_NOTIFIED_MAP_KEY, JSON.stringify(map));
  } catch {}
}

// Check due words and send push notification
export async function checkAndNotifyDueWords(dueItems: VocabularyItem[]): Promise<void> {
  if (!dueItems || dueItems.length === 0) return;
  if (!areNotificationsEnabled()) return;

  const now = Date.now();
  const recentlyNotified = getRecentlyNotifiedMap();
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  // Filter items not notified in the last 10 minutes
  const unnotifiedItems = dueItems.filter((item) => {
    const lastNotified = recentlyNotified[item.id] || 0;
    return now - lastNotified > TEN_MINUTES_MS;
  });

  if (unnotifiedItems.length === 0) return;

  const first = unnotifiedItems[0];
  const stageInfo = getStageInfo(first.stage);

  let title: string;
  let body: string;

  if (unnotifiedItems.length === 1) {
    title = `🧠 დროა სიტყვის გამეორების: "${first.word}"`;
    body = `მეცნიერული ინტერვალი: ${stageInfo.label}. ქართულად: "${first.georgianTranslation}". შეასრულეთ 30-წამიანი დავალება!`;
  } else {
    title = `🧠 გასამეორებელია ${unnotifiedItems.length} სიტყვა (${first.word}...)`;
    body = `მეცნიერული ინტერვალი: ${stageInfo.shortLabel}. გადაიტანეთ სიტყვები გრძელვადიან მეხსიერებაში.`;
  }

  const success = await sendPhoneNotification(title, {
    body,
    tag: `linguo-due-${first.id}`,
    requireInteraction: true,
  });

  if (success) {
    unnotifiedItems.forEach((item) => recordNotificationSent(item.id));
  }
}
