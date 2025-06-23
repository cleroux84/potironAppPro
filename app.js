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
  origin: "https://potiron.com",
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
const { createOrderFromCSV, getAfibelOrders, generateCsv, sendCSVToShippingbo, getNewOrdersFile } = require('./services/API/Shopify/afibel.js');
const { getOrderDetails } = require('./services/API/Shippingbo/Potiron/ordersCRUD.js');
app.use('/returnOrder', returnOrderRoute);
app.use('/proCustomer', proCustomerRoute);
app.use('/proOrder', proOrderRoute);
app.use('/returnContact', returnContactRoute);
app.use('/allOrders', allOrdersRoute);

// Initialisation des tokens 
initializeTokens();
// deleteAllWebhooks();
// setupShippingboWebhook();
getWebhooks();

// getOrderDetails(120086989);
// generateCsv();
// sendCSVToShippingbo();

//CHECK Scheduled emails in DB every day
// cron.schedule('0 9 * * *', checkScheduledEmails, { //9h00
// // cron.schedule('50 10 * * *', checkScheduledEmails, { //10h50
//   schedule: true,
//   timezone: "Europe/Paris"
// });
// //GET NEW ORDERS FROM AFIBEL every day 
// cron.schedule('58 8 * * *', getNewOrdersFile, { //9h00
//     schedule: true,
//     timezone: "Europe/Paris"
//   });


cron.schedule('50 9  * * *', () => {
  console.log("⏰ getNewOrdersFile déclenché à : ", new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
  getNewOrdersFile();
  // generateCsv();
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
