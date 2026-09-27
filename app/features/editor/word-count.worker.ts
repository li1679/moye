import { countWords } from './text-tools';

type CountRequest = { id: number; text: string };
type CountResponse = { id: number; count: number };

self.onmessage = (event: MessageEvent<CountRequest>) => {
  const request = event.data;
  const response: CountResponse = { id: request.id, count: countWords(request.text) };
  self.postMessage(response);
};
