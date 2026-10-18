import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.DEV) {
  import('./sim/clock').then((m) => Object.assign(window, { __clock: m.clock, __sim: m.sim }));
}
