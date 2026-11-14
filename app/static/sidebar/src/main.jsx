import React from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import App from './App.jsx';
import './styles.css';

// Follow the user's Jira theme (light/dark) through design tokens.
view.theme.enable().catch(() => {});

createRoot(document.getElementById('root')).render(<App />);
