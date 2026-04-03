import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import projectsRouter from './routes/projects';
import moodleRouter from './routes/moodle';
import licensesRouter from './routes/licenses';
import llmRouter from './routes/llm';
import adminOrgsRouter from './routes/admin/organizations';
import adminLicensesRouter from './routes/admin/licenses';
import adminPlansRouter from './routes/admin/plans';
import adminSubscriptionsRouter from './routes/admin/subscriptions';
import adminUsageRouter from './routes/admin/usage';
import { adminAuthMiddleware } from './middleware/admin-auth.middleware';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
// 20mb global limit — scenarize routes receive base64-encoded PDFs
app.use(express.json({ limit: '20mb' }));

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Routes
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/moodle', moodleRouter);

// Public license endpoints (called by Moodle plugin)
app.use('/api/v1/licenses', licensesRouter);

// LLM endpoints (auth required)
app.use('/api/v1/llm', llmRouter);

// Admin routes (JWT + is_platform_admin)
app.use('/api/v1/admin/organizations', adminAuthMiddleware, adminOrgsRouter);
app.use('/api/v1/admin/licenses',      adminAuthMiddleware, adminLicensesRouter);
app.use('/api/v1/admin/plans',         adminAuthMiddleware, adminPlansRouter);
app.use('/api/v1/admin/subscriptions', adminAuthMiddleware, adminSubscriptionsRouter);
app.use('/api/v1/admin/usage',         adminAuthMiddleware, adminUsageRouter);

const server = app.listen(PORT, () => {
  console.log(`[backend] Server running on http://localhost:${PORT}`);
});

// Disable all server-level timeouts — SSE routes keep connections open for 30-120s
server.setTimeout(0);
server.requestTimeout = 0;
server.headersTimeout = 65_000;
