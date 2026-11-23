"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";

// Minimal typing for the browser Speech Recognition API (Chrome/Android, Safari/iOS).
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** iPhone/iPad (iPadOS reports itself as a Mac, so touch support is checked too). */
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

const LANG_KEY = "dictation-lang";
const LANG_EVENT = "dictation-lang-changed";
const noopSubscribe = () => () => {};
function subscribeLang(cb: () => void) {
  window.addEventListener(LANG_EVENT, cb);
  return () => window.removeEventListener(LANG_EVENT, cb);
}
function readLang() {
  try { return localStorage.getItem(LANG_KEY) ?? "en-IN"; } catch { return "en-IN"; }
}

const LANGS = [
  { code: "en-IN", label: "EN" },
  { code: "hi-IN", label: "हि" },
];

/**
 * Dictation for notes fields: tap the mic, speak, and the words are typed in.
 * Uses the phone's own speech recognition, so nothing is recorded or stored.
 * Hidden on browsers that don't support it.
 */
export function VoiceTextarea({
  value,
  onChange,
  rows = 2,
  placeholder,
  id,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  // iOS exposes the browser speech API, but it doesn't start reliably in Home Screen apps.
  // There the mic opens the keyboard, whose built-in dictation works everywhere.
  const ios = useSyncExternalStore(noopSubscribe, isIOS, () => false);
  const browserSpeech = useSyncExternalStore(noopSubscribe, () => Boolean(getRecognition()), () => false);
  const supported = browserSpeech && !ios;
  const showMic = supported || ios;
  const [iosHint, setIosHint] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "en-IN");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const base = useRef(value);
  const latestOnChange = useRef(onChange);

  useEffect(() => { latestOnChange.current = onChange; });
  useEffect(() => () => rec.current?.stop(), []);

  function start() {
    const R = getRecognition();
    if (!R) return;
    setError(null);
    base.current = value;
    const r = new R();
    r.lang = lang;
    // Android Chrome repeats earlier words in continuous mode, so it listens one phrase at a time.
    const android = /android/i.test(navigator.userAgent);
    r.continuous = !android;
    r.interimResults = true;
    r.onresult = (e) => {
      // Rebuild this session's text on every event, so a repeated result can't duplicate words.
      // Android may report growing copies of the same phrase, so only its latest result counts.
      const results = Array.from(e.results);
      const parts = android ? results.slice(-1) : results;
      const spoken = parts.map((x) => x[0].transcript).join(" ").replace(/\s+/g, " ");
      // Keep the form's value in step with what's on screen, so Save never loses words still being processed.
      latestOnChange.current(joinText(base.current, spoken));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Allow microphone access to use voice notes.");
      else if (e.error === "network") setError("Voice notes need an internet connection.");
      else if (e.error === "no-speech") setError("Didn't hear anything. Tap the mic and try again.");
      else if (e.error === "audio-capture") setError("Couldn't access the microphone. Close other apps using it and try again.");
      else if (e.error !== "aborted") setError("Couldn't hear that. Try again.");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone. Try again.");
    }
  }

  function stop() {
    rec.current?.stop();
  }

  function openKeyboardDictation() {
    field.current?.focus();
    setIosHint(true);
  }

  function switchLang(code: string) {
    try { localStorage.setItem(LANG_KEY, code); } catch {}
    window.dispatchEvent(new Event(LANG_EVENT));
  }

  return (
    <div>
      <div className="relative">
        <textarea
          ref={field}
          id={id}
          rows={rows}
          className={`input py-2 ${showMic ? "pr-12" : ""} ${className}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={listening}
        />
        {showMic && (
          <button
            type="button"
            onClick={ios ? openKeyboardDictation : listening ? stop : start}
            aria-label={listening ? "Stop dictation" : "Speak instead of typing"}
            className={`absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-lg ${listening ? "animate-pulse bg-red-600 text-white" : "bg-bg text-brand"}`}
          >
            {listening ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}
          </button>
        )}
      </div>
      {ios && iosHint && (
        <p className="mt-1 text-xs text-muted">
          Tap the <Mic size={12} className="inline" /> on your keyboard and speak. No mic there? Turn on Settings → General → Keyboard → Enable Dictation.
        </p>
      )}
      {supported && (listening || error) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {listening && <span className="text-red-700">Listening… tap ■ when done</span>}
          {error && <span className="text-red-600">{error}</span>}
          {listening ? null : (
            <span className="ml-auto flex gap-1">
              {LANGS.map((l) => (
                <button key={l.code} type="button" className="chip min-h-6 px-2 text-[11px]" data-on={lang === l.code} onClick={() => switchLang(l.code)}>{l.label}</button>
              ))}
            </span>
          )}
        </div>
      )}
      {supported && !listening && !error && (
        <div className="mt-1 flex justify-end gap-1">
          {LANGS.map((l) => (
            <button key={l.code} type="button" className="chip min-h-6 px-2 text-[11px]" data-on={lang === l.code} onClick={() => switchLang(l.code)} aria-label={`Dictate in ${l.code}`}>{l.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function joinText(a: string, b: string) {
  const t = b.trim();
  if (!t) return a;
  return a.trim() ? `${a.trim()} ${t}` : t.charAt(0).toUpperCase() + t.slice(1);
}
