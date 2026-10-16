export async function takeSharedText(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller || registration.active;
  if (!worker) return null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, 5000);
    channel.port1.onmessage = (event: MessageEvent<{ type?: string; text?: string | null }>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data?.type === 'SHARED_TEXT' ? event.data.text || null : null);
    };
    worker.postMessage({ type: 'TAKE_SHARED_TEXT' }, [channel.port2]);
  });
}
