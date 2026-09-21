import app from './src/app.js';

// Vercel serverless entry: runs Express on Vercel's req/res and settles when the app calls back.
export default async function handler(req, res) {
  await new Promise((resolve, reject) => {
    app(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
