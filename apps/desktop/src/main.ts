import '@focus/ui/tokens.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing desktop mount point');
mount(App, { target });
