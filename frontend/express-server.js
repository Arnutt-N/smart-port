const express = require('express');
const path = require('path');
const app = express();
const PORT = 5174;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Handle SPA routing - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Frontend running at: http://localhost:${PORT}`);
  console.log(`📱 Network: http://0.0.0.0:${PORT}`);
  console.log(`✅ All routes (/, /login, /dashboard) will work`);
});
