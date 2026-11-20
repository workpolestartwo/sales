import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not set");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  configured = true;
}

/**
 * Sends a notification to each subscription. Subscriptions the browser has
 * dropped (uninstalled, permission revoked) are deleted.
 */
export async function sendPush(supabase: SupabaseClient, subs: SubRow[], payload: PushPayload): Promise<number> {
  configure();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }),
  );
  return sent;
}
