const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/labour', require('./routes/labour'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/fuel', require('./routes/fuel'));
app.use('/api/machinery', require('./routes/machinery'));
app.use('/api/government', require('./routes/government'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/daily-reports', require('./routes/reports'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/boq', require('./routes/boq'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/ra-bill', require('./routes/ra-bill'));

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
