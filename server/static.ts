import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';

const app = express();
const dist = path.join(process.cwd(), 'dist');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'", 'https:'], imgSrc: ["'self'", 'data:', 'https:'], styleSrc: ["'self'", "'unsafe-inline'"] } } }));
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'web' }));
app.use(express.static(dist, { maxAge: '1h', etag: true }));
app.use((_request, response) => response.sendFile(path.join(dist, 'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Moya Market web listening on ${port}`));
