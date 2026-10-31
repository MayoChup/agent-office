import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { setupPhaser } from './game/Game';
import { startConnection } from './kantor/connection';

const rootElement = document.getElementById('ui-root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(<App />);
}

setupPhaser('phaser-container');
startConnection();
