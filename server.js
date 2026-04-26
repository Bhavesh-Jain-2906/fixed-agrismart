require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cropRoutes = require('./routes/cropRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/crops', cropRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.get('/api/config', (req, res) => {
  res.json({
    WEATHER_API_KEY: process.env.WEATHER_API_KEY,
    IPINFO_TOKEN: process.env.IPINFO_TOKEN,
    OPENCAGE_API_KEY: process.env.OPENCAGE_API_KEY,
    UNSPLASH_API_KEY: process.env.UNSPLASH_API_KEY
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are an expert farmer in India. Provide concise, helpful advice on farming, crop management, weather impacts, and agricultural best practices.' },
          ...messages
        ]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Failed to fetch AI response' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
