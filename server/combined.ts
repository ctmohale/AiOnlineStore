import 'dotenv/config';
import app from './app.js';
import { installFrontend } from './frontend.js';

const port = Number(process.env.PORT || 3000);
installFrontend(app, { apiBase: `http://127.0.0.1:${port}/api` });
app.listen(port, () => console.log(`Mzansi Mega Store application listening on ${port}`));
