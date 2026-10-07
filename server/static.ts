import 'dotenv/config';
import express from 'express';
import { installFrontend } from './frontend.js';

const app = express();
app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'web', revision: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown' }));
installFrontend(app);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Mzansi Mega Store web listening on ${port}`));
