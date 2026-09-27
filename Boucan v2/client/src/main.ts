import './app/ui.css';
import { App } from './app/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');
const query = new URLSearchParams(location.search);

if (import.meta.env.DEV && query.has('preview')) {
  // Development only: one microgame alone, in a loop (see dev/preview.ts). Stripped from production builds.
  void import('./dev/preview').then(({ startPreview }) => startPreview(root, query));
} else {
  const app = new App(root);
  void app.start();

  // Development only: inspection hook for manual / automated checks (stripped from production builds).
  if (import.meta.env.DEV) {
    void import('./engine/audio').then(({ audio }) => {
      (window as unknown as { __boucan: unknown }).__boucan = { app, audio };
    });
  }
}
