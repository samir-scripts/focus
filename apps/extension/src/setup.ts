import { mount } from 'svelte';
import Setup from './Setup.svelte';
const target = document.getElementById('app');
if (!target) throw new Error('Missing setup mount point');
mount(Setup, { target });
