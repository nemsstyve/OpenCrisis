import express from 'express';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'opencrisis-backend',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[backend] Server running on port ${PORT}`);
});
