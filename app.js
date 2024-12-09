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
app.use('/returnOrder', returnOrderRoute);
app.use('/proCustomer', proCustomerRoute);
app.use('/proOrder', proOrderRoute);

// Initialisation des tokens 
initializeTokens();
// deleteAllWebhooks();
// setupShippingboWebhook();
getWebhooks();

//CHECK Scheduled emails in DB every day
// cron.schedule('0 9 * * *', checkScheduledEmails, { //9h00
cron.schedule('20 16 * * *', checkScheduledEmails, { //9h00

//cron.schedule('50 10 * * *', checkScheduledEmails, { //10h50
  schedule: true,
  timezone: "Europe/Paris"
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
