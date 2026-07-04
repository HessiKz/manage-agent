/** Context passed to bridge handlers and step executors during support UI playback. */

export type SupportPlayerContext = {
  setStatus: (label: string) => void;
  navigate: (path: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  highlight: (selector: string) => Promise<void>;
  click: (selector: string) => Promise<void>;
  typeIntoElement: (selector: string, text: string) => Promise<void>;
  typeWithCallback: (
    label: string,
    text: string,
    onChar: (partial: string) => void | Promise<void>
  ) => Promise<void>;
};
