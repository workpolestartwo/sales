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
  const supported = useSyncExternalStore(noopSubscribe, () => Boolean(getRecognition()), () => false);
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
    r.continuous = !/android/i.test(navigator.userAgent);
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "", partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else partial += t;
      }
      if (finalText) base.current = joinText(base.current, finalText);
      // Keep the form's value in step with what's on screen, so Save never loses words still being processed.
      latestOnChange.current(joinText(base.current, partial));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Allow microphone access to use voice notes.");
      else if (e.error === "network") setError("Voice notes need an internet connection.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("Couldn't hear that. Try again.");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  function stop() {
    rec.current?.stop();
  }

  function switchLang(code: string) {
    try { localStorage.setItem(LANG_KEY, code); } catch {}
    window.dispatchEvent(new Event(LANG_EVENT));
  }

  return (
    <div>
      <div className="relative">
        <textarea
          id={id}
          rows={rows}
          className={`input py-2 ${supported ? "pr-12" : ""} ${className}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={listening}
        />
        {supported && (
          <button
            type="button"
            onClick={listening ? stop : start}
            aria-label={listening ? "Stop dictation" : "Speak instead of typing"}
            className={`absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-lg ${listening ? "animate-pulse bg-red-600 text-white" : "bg-bg text-brand"}`}
          >
            {listening ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}
          </button>
        )}
      </div>
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
