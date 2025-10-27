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
const testIA = require('./routes/mistral.js');
const { createOrderFromCSV, getAfibelOrders, generateCsv, sendCSVToShippingbo, getNewOrdersFile, getAfibelTrackings } = require('./services/API/Shopify/afibel.js');
const { getOrderDetails } = require('./services/API/Shippingbo/Potiron/ordersCRUD.js');
app.use('/returnOrder', returnOrderRoute);
app.use('/proCustomer', proCustomerRoute);
app.use('/proOrder', proOrderRoute);
app.use('/returnContact', returnContactRoute);
app.use('/allOrders', allOrdersRoute);
app.use('/test', testIA);
// Initialisation des tokens 
initializeTokens();
// deleteAllWebhooks();
// setupShippingboWebhook();
getWebhooks();



cron.schedule('10 11  * * *', () => {
  console.log("⏰ generateCsv déclenché à : ", new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
  // generateCsv();
  getAfibelTrackings(181870436);
  getAfibelTrackings(181888630);
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
