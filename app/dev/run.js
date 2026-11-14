// Run the review pipeline locally for one issue and print the review JSON.
// node dev/out/run.mjs CLSD-7 > dev/out/review.json
import { getReview, computeReview } from '../src/review.js';

const key = process.argv[2] || 'CLSD-7';
let job = null;
const first = await getReview(key, { enqueue: async (b) => (job = b) });
if (job) await computeReview(job.issueKey, job.hash);
const r = await getReview(key, { enqueue: async () => {} });
process.stdout.write(JSON.stringify(r, null, 1));
