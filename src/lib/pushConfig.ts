// This is the PUBLIC half of the VAPID key pair — safe to ship in client
// code. The PRIVATE half must only ever live as a Supabase Edge Function
// secret (VAPID_PRIVATE_KEY) and never appear here or anywhere else in
// the client bundle. See supabase/functions/send-push/index.ts.
export const VAPID_PUBLIC_KEY = "BLNX32yhWPIsHkxToLkws2FZUnhALFqx3EtVbsrptOxKmJahdBsqf3BH2w5utLjgcnrOeQ1FM1AVmjujLUqEvCI";

/** Converts a base64url VAPID public key into the Uint8Array format the
 *  Push API's `applicationServerKey` option expects. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
