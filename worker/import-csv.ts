import 'dotenv/config';
import { CsvAdapter } from './adapters/csv.js';
import { ingest } from './ingest.js';

const filePath = process.argv[2];
if (!filePath) throw new Error('Usage: npm run worker:import-csv -- ./products.csv');
console.log(await ingest(new CsvAdapter(filePath)));
process.exit(0);
