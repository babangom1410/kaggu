import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import projectsRouter from './routes/projects';
import moodleRouter from './routes/moodle';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Routes
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/moodle', moodleRouter);

app.listen(PORT, () => {
  console.log(`[backend] Server running on http://localhost:${PORT}`);
});
