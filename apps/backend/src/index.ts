import express from 'express';

const app = express();
const PORT = 4000; // Using a fixed port for simplicity, backend service maps 4000:4000

app.get('/', (req, res) => {
  res.send('backend service is alive!');
});

app.listen(PORT, () => {
  console.log(`backend service is running on port ${PORT}`);
});
