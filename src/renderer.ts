/**
 * Renderer entry (Forge). Mounts React into #root and loads theme tokens.
 * Actual UI lives under src/renderer/.
 */
import './index.css';
import './renderer/theme/tokens.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}
createRoot(container).render(React.createElement(App));
