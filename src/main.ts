// Entry point. `?preview=1` renders a fixed camera view (visual QA); otherwise the game boots.
import './ui/styles.css';

const q = new URLSearchParams(location.search);
if (!document.getElementById('ui')) {
  const ui = document.createElement('div');
  ui.id = 'ui';
  document.body.append(ui);
}
if (q.get('preview')) import('./dev/preview').then((m) => m.boot());
else import('./game/boot').then((m) => m.boot());
