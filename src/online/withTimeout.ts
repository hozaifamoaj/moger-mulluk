import { ONLINE } from '../sim/config';

// §12.7: "every Supabase call has a timeout". Races a promise against the
// timeout rather than relying on the client's own network timeout, so a
// stalled request can never block gameplay (CLAUDE.md rule 12).
export async function withTimeout<T>(promise: PromiseLike<T>, ms: number = ONLINE.timeoutMs): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
