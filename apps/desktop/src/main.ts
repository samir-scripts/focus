import '@focus/ui/tokens.css';
import './ink-motion.css';
import { mount } from 'svelte';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing desktop mount point');
const sessionsWindow = isTauri() && getCurrentWindow().label === 'sessions';
mount(App, { target, props: sessionsWindow ? { sessionsWindow, browserBridge: null } : {} });
