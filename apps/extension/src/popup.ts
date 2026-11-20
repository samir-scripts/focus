import { mount } from 'svelte';
import Popup from './Popup.svelte';
const target = document.getElementById('app');
if (!target) throw new Error('Missing popup mount point');
mount(Popup, { target });
