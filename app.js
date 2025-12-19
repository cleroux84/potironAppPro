const express = require('express');
const cron = require('node-cron');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 300;
const { initializeTokens } = require('./services/API/manageTokens.js');
const { setupShippingboWebhook, deleteWebhook, deleteAllWebhooks, getWebhooks } = require('./services/API/Shippingbo/webhook.js');
const { checkScheduledEmails } = require('./services/sendMails/mailForCustomers.js');

const corsOptions = {
  origin: ["https://potiron.com", "https://0l56kborkbvdteo2-57473073302.shopifypreview.com", "https://6q23ttxwyorid7ah-57473073302.shopifypreview.com"],
  method: 'GET, HEAD, PUT, PATCH, POST, DELETE',
  credentials: true,
  optionSuccessStatus: 204
}


app.set('appName', 'potironAppPro');
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(cors({
  origin: "https://potiron.com",
  methods: 'GET, HEAD, PUT, PATCH, POS, DELETE',
  credentials: true,
  optionsSuccessStatus: 204
}))

const returnOrderRoute = require('./routes/returnOrder.js');
const proCustomerRoute = require('./routes/proCustomer.js');
const proOrderRoute = require('./routes/proOrder.js');
const returnContactRoute = require('./routes/returnOrderContact.js');
const allOrdersRoute = require('./routes/allOrders.js');
const gmaReassortRoute = require('./routes/gmaReassortRoute.js');
const testIA = require('./routes/mistral.js');
const { createOrderFromCSV, getAfibelOrders, generateCsv, sendCSVToShippingbo, getNewOrdersFile } = require('./services/API/Shopify/afibel.js');
const { getOrderDetails } = require('./services/API/Shippingbo/Potiron/ordersCRUD.js');
app.use('/returnOrder', returnOrderRoute);
app.use('/proCustomer', proCustomerRoute);
app.use('/proOrder', proOrderRoute);
app.use('/returnContact', returnContactRoute);
app.use('/allOrders', allOrdersRoute);
app.use('/reassort', gmaReassortRoute);
app.use('/test', testIA);
// Initialisation des tokens 
initializeTokens();
// deleteAllWebhooks();
// setupShippingboWebhook();
getWebhooks();

// To get a token with dev dashboard shopify - decomment, push and enter in navigation :
//  : 
// https://gma-reassort.myshopify.com/admin/oauth/authorize?
// client_id= found in dev dashbord app settings
// scope=customers,metafields&
// redirect_uri=https://potironapppro.onrender.com/callback& //be sure it's in redirect urls in dev dashbord app
// state=xyz123&
// grant_options[]=per-user

// app.get('/callback', async (req, res) => {
//     const { code, state } = req.query;

//     if (state !== 'xyz123') return res.status(400).send('State invalide');

//     try {
//         const shop = 'gma-reassort.myshopify.com';
//         const client_id = process.env.SHOPIFY_CLIENT_ID;
//         const client_secret = process.env.SHOPIFY_CLIENT_SECRET;

//         const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ client_id, client_secret, code })
//         });

//         const data = await response.json();

//         console.log('Ton Shopify Access Token:', data.access_token);

//         res.send('Token généré ! Vérifie la console serveur pour le copier dans ton .env');

//     } catch (error) {
//         console.error('Erreur lors de l’échange du code contre le token :', error);
//         res.status(500).send('Erreur lors de la génération du token');
//     }
// });

cron.schedule('0 19  * * *', () => {
  console.log("⏰ generateCsv déclenché à : ", new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
  generateCsv();
}, {
  timezone: "Europe/Paris"
});

cron.schedule('01 22  * * *', () => {
  console.log("⏰ getNewOrdersFile déclenché à : ", new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
  getNewOrdersFile();
}, {
  timezone: "Europe/Paris"
});

cron.schedule('30 9 * * *', () => {
  console.log("⏰ checkScheduledEmails déclenché à : ", new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
  checkScheduledEmails();
}, {
  timezone: "Europe/Paris"
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
