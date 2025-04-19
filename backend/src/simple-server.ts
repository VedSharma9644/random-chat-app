// src/server-simple.ts
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/api/status', (req, res) => {
  res.json({ status: 'online' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});