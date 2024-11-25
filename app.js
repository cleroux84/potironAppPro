const express = require('express');
const cron = require('node-cron');
const multer = require('multer');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer'); 
const path = require('path');
const fs = require('fs');
const { from } = require('form-data');
const { type } = require('os');
const { error } = require('console');
const Shopify = require('shopify-api-node');
const cors = require('cors');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 300;
const { refreshMS365AccessToken, getAccessTokenMS365 } = require('./services/API/microsoft.js');
const { createLabel } = require('./services/API/colissimo.js');
const { initializeTokens } = require('./services/API/manageTokens.js');
const { saveDiscountMailData } = require('./services/database/scheduled_emails.js');
const { sendEmailWithKbis, sendReturnDataToSAV } = require('./services/sendMails/mailForTeam.js');
const { sendWelcomeMailPro, sendReturnDataToCustomer, sendDiscountCodeAfterReturn, checkScheduledEmails } = require('./services/sendMails/mailForCustomers.js');
const { getAccessTokenFromDb } = require('./services/database/tokens/potiron_shippingbo.js');
const { getAccessTokenWarehouseFromDb } = require('./services/database/tokens/gma_shippingbo.js');
const { getShippingboOrderDetails, updateShippingboOrder, cancelShippingboDraft } = require('./services/API/Shippingbo/Potiron/ordersCRUD.js');
const { getWarehouseOrderDetails, updateWarehouseOrder, getWarehouseOrderToReturn, getshippingDetails } = require('./services/API/Shippingbo/Gma/ordersCRUD.js');
const { checkIfReturnOrderExist, createReturnOrder, updateReturnOrder } = require('./services/API/Shippingbo/Gma/returnOrdersCRUD.js');
const { setupShippingboWebhook, deleteWebhook, deleteAllWebhooks, getWebhooks } = require('./services/API/Shippingbo/webhook.js');
const { orderById, createProCustomer, updateProCustomer, getCustomerMetafields, deleteMetafield } = require('./services/API/Shopify/customers.js');
const { getOrderByShopifyId, updateOrder } = require('./services/API/Shopify/orders.js');
const { createDraftOrder, draftOrderById, lastDraftOrder, updateDraftOrderWithDraftId } = require('./services/API/Shopify/draftOrders.js');
const { getProductWeightBySku } = require('./services/API/Shopify/products.js');
const { createPriceRule, checkIfPriceRuleExists, isReturnableDate } = require('./services/API/Shopify/priceRules.js');

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
cron.schedule('0 9 * * *', checkScheduledEmails, { //9h00
//cron.schedule('50 10 * * *', checkScheduledEmails, { //10h50
  schedule: true,
  timezone: "Europe/Paris"
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
