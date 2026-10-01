import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Mzansi Mega Store API listening on ${port}`));
