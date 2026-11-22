import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './tampilan.css';
import { App } from './App';
import { Pengaman } from './components/Pengaman';
import { setupPhaser } from './game/Game';
import { startConnection } from './kantor/connection';
import { mulaiPasang } from './kantor/pasang';
import { mulaiGetar } from './kantor/getar';
import './kantor/antrean';

const rootElement = document.getElementById('ui-root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(<Pengaman nama="aplikasi"><App /></Pengaman>);
}

setupPhaser('phaser-container');
startConnection();
mulaiPasang();
mulaiGetar();
