import '../styles/app.css';
import { mount } from 'svelte';
import RepoBrowserApp from './RepoBrowserApp.svelte';

const app = mount(RepoBrowserApp, {
  target: document.getElementById('app')!,
});

export default app;
