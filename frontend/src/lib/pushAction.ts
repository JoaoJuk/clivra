export interface PendingPushAction {
  questionId: string;
  categoryId: string;
}

export async function takePendingPushAction(): Promise<PendingPushAction | null> {
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
    channel.port1.onmessage = (event: MessageEvent<{ type?: string; questionId?: string; categoryId?: string }>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const data = event.data;
      resolve(data?.type === 'PUSH_ACTION' && data.questionId && data.categoryId
        ? { questionId: data.questionId, categoryId: data.categoryId }
        : null);
    };
    worker.postMessage({ type: 'TAKE_PUSH_ACTION' }, [channel.port2]);
  });
}
