const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const router = express.Router();

const apiKey = process.env.MISTRAL_API_KEY; 

app.post('/chat', async (req, res) => {
  const userMessage = req.body.message;

  try {
    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-small',
        messages: [
          {
            role: 'system',
            content: 'Tu es un assistant service client pour la boutique Shopify X. Réponds avec clarté et amabilité.'
          },
          {
            role: 'user',
            content: userMessage
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`, 
          'Content-Type': 'application/json'
        }
      }
    );

    const assistantReply = response.data.choices[0].message.content;
    console.log('PPL Back');
    res.json({ reply: assistantReply });

  } catch (error) {
    console.error('Erreur Mistral API:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Erreur avec l’API Mistral' });
  }
});

app.listen(3000, () => {
  console.log('Chatbot Mistral API disponible sur http://localhost:3000');
});

module.exports = router;
