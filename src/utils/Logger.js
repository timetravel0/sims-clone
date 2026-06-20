const MAX_LOG = 6;
const logEl = () => document.getElementById('log');

const levels = {
  info:  { prefix: '[INFO]',  color: 'rgba(255,255,255,0.45)' },
  warn:  { prefix: '[WARN]',  color: '#ffa726' },
  error: { prefix: '[ERROR]', color: '#ef5350' },
};

function write(level, msg) {
  console[level]?.(msg);
  const el = logEl();
  if (!el) return;
  const line = document.createElement('div');
  line.style.color = levels[level].color;
  line.textContent = `${levels[level].prefix} ${msg}`;
  el.prepend(line);
  while (el.children.length > MAX_LOG) el.removeChild(el.lastChild);
}

export const Logger = {
  info:  (m) => write('info', m),
  warn:  (m) => write('warn', m),
  error: (m) => write('error', m),
};
