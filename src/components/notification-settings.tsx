"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Share } from "lucide-react";
import { removePushSubscription, savePushSubscription, saveReminderSettings, sendTestPush } from "@/app/actions/push";
import type { Profile } from "@/lib/types";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationSettings({ profile }: { profile: Profile & { notify_enabled?: boolean; morning_time?: string; evening_time?: string } }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saved, saveAction, saving] = useActionState(saveReminderSettings, undefined);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  function enable() {
    setMsg(null);
    start(async () => {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) return setMsg("Notifications aren't configured on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const res = await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }, navigator.userAgent);
      if (res.error) return setMsg(res.error);
      setState("on");
      setMsg("Notifications are on for this phone.");
    });
  }

  function disable() {
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Notifications are off for this phone.");
    });
  }

  function test() {
    setMsg(null);
    start(async () => {
      const res = await sendTestPush();
      setMsg(res.error ?? "Sent. It should pop up in a few seconds.");
    });
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-brand" />
        <p className="font-semibold">Reminders</p>
      </div>

      {state === "ios-install" && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          On iPhone, notifications only work once the app is on your Home Screen: tap <Share size={13} className="inline" /> <b>Share</b> → <b>Add to Home Screen</b>, open it from there, then come back here.
        </div>
      )}
      {state === "unsupported" && <p className="text-sm text-muted">This browser doesn&apos;t support notifications. Try Chrome on Android, or the Home Screen app on iPhone.</p>}
      {state === "denied" && <p className="text-sm text-red-700">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.</p>}

      {(state === "off" || state === "on") && (
        <div className="flex gap-2">
          {state === "off" ? (
            <button className="btn-primary flex-1" disabled={pending} onClick={enable}><Bell size={16} /> Turn on for this phone</button>
          ) : (
            <>
              <button className="btn-secondary flex-1" disabled={pending} onClick={test}>Send a test</button>
              <button className="btn-ghost" disabled={pending} onClick={disable}><BellOff size={16} /> Turn off</button>
            </>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-muted">{msg}</p>}

      <form action={saveAction} className="space-y-3 border-t border-line pt-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Send me daily reminders</span>
          <input type="checkbox" name="notify_enabled" defaultChecked={profile.notify_enabled ?? true} className="size-5 accent-[var(--brand)]" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Morning: build your day</span>
            <input type="time" name="morning_time" className="input" defaultValue={(profile.morning_time ?? "09:00").slice(0, 5)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Evening: close your day</span>
            <input type="time" name="evening_time" className="input" defaultValue={(profile.evening_time ?? "18:30").slice(0, 5)} />
          </label>
        </div>
        {saved?.error && <p className="text-sm text-red-600">{saved.error}</p>}
        {saved?.ok && !saving && <p className="text-sm text-emerald-700">Saved.</p>}
        <button className="btn-secondary w-full" disabled={saving}>{saving ? "Saving…" : "Save reminder times"}</button>
      </form>
    </section>
  );
}
