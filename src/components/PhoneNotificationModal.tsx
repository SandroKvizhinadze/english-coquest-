import React, { useState } from 'react';
import {
  Bell,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  X,
  Send,
  Calendar,
  Sparkles,
  Volume2,
} from 'lucide-react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  areNotificationsEnabled,
  setNotificationsEnabled,
} from '../utils/notificationService';
import { SCIENTIFIC_STAGES } from '../utils/spacedRepetition';

interface PhoneNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PhoneNotificationModal: React.FC<PhoneNotificationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [permission, setPermission] = useState(getNotificationPermission());
  const [isEnabled, setIsEnabled] = useState(areNotificationsEnabled());
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEnable = async () => {
    const granted = await requestNotificationPermission();
    setPermission(getNotificationPermission());
    setIsEnabled(granted);
    if (granted) {
      setTestStatus('შეტყობინებები წარმატებით ჩაირთო!');
    } else {
      setTestStatus('შეტყობინებების ნებართვა დაბლოკილია ბრაუზერში.');
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    setTestStatus('შეტყობინება იგზავნება...');
    try {
      const sent = await sendTestNotification();
      if (sent) {
        setTestStatus('✅ შეტყობინება გაიგზავნა! შეამოწმეთ თქვენი ტელეფონის/მოწყობილობის ეკრანი.');
      } else {
        setTestStatus('გაგზავნა ვერ მოხერხდა. გთხოვთ დააჭიროთ "შეტყობინებების ჩართვა"-ს.');
      }
    } catch {
      setTestStatus('შეცდომა შეტყობინების გაგზავნისას.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-stone-100 animate-fade-in my-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Smartphone className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-100">
                ტელეფონზე შეტყობინებები
              </h2>
              <p className="text-xs text-stone-400">
                მეცნიერული ინტერვალები და დავალებები
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-200 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current status pill */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
            permission === 'granted'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {permission === 'granted' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <span className="font-medium">
              სტატუსი:{' '}
              {permission === 'granted'
                ? 'შეტყობინებები ნებადართულია ✓'
                : 'საჭიროა ნებართვის მიცემა'}
            </span>
          </div>

          {permission !== 'granted' && (
            <button
              onClick={handleEnable}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-md transition-colors cursor-pointer"
            >
              ჩართვა
            </button>
          )}
        </div>

        {/* Test Notification Action */}
        <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              შეტყობინების ტესტირება ტელეფონზე
            </span>
            <button
              onClick={handleTestNotification}
              disabled={isTesting}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/30 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              <span>გამოგზავნე ტესტი 📲</span>
            </button>
          </div>

          <p className="text-[11px] text-stone-400 leading-relaxed">
            დააჭირეთ ღილაკს, რათა დარწმუნდეთ, რომ შეტყობინება, ვიბრაცია და ხმა გამართულად მოდის
            თქვენს ეკრანზე.
          </p>

          {testStatus && (
            <p className="text-xs text-amber-300 bg-stone-900 p-2 rounded border border-stone-800 font-medium animate-fade-in">
              {testStatus}
            </p>
          )}
        </div>

        {/* Scientific Spaced Schedule List */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            მეცნიერული გამეორების გრაფიკი (Ebbinghaus & Cognitive Consolidation)
          </span>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {SCIENTIFIC_STAGES.slice(0, 4).map((s) => (
              <div
                key={s.stage}
                className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400">ეტაპი {s.stage + 1}</span>
                  <span className="font-mono text-stone-300 font-semibold">{s.shortLabel}</span>
                </div>
                <p className="text-[10px] text-stone-400 mt-1 leading-tight">{s.scientificGoal}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-stone-500 italic">
            * 1 დღის შემდეგ დავალებები გაგრძელდება 3 დღეში, 7 დღეში, 14 დღესა და 30 დღეში, სანამ
            სიტყვა სრულად არ გადავა მუდმივ მეხსიერებაში.
          </p>
        </div>

        {/* Mobile PWA Tip */}
        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-stone-300 space-y-1">
          <span className="font-semibold text-amber-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            როგორ მივიღოთ შეტყობინებები ტელეფონის ფონურ რეჟიმში?
          </span>
          <p className="text-[11px] text-stone-400 leading-relaxed">
            მობილურ ბრაუზერში (Safari iPhone-ზე ან Chrome Android-ზე) დააჭირეთ <strong>Share</strong>{' '}
            ან მენიუს ღილაკს და აირჩიეთ <strong>"Add to Home Screen" (მთავარ ეკრანზე დამატება)</strong>
            . აპლიკაცია იმუშავებს როგორც ჩვეულებრივი მობილური აპი!
          </p>
        </div>

        {/* Close button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            დახურვა
          </button>
        </div>
      </div>
    </div>
  );
};
