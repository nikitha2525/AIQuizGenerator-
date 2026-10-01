import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`[Cortex API] Server listening on port ${PORT}`);
  console.log(`[Cortex API] Health check: http://localhost:${PORT}/api/health`);
});

// Gracefully handle port conflicts during --watch restarts
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Cortex API] Port ${PORT} busy, retrying in 1s...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 1000);
  } else {
    console.error('[Cortex API] Server error:', err);
    process.exit(1);
  }
});
