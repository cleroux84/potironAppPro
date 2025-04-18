//send Shippingbo Invoice if new order from potiron.com

const express = require('express');
const { sendAutomaticInvoice } = require('../services/sendMails/mailForCustomers');
const { getAccessTokenMS365 } = require('../services/API/microsoft');
const { getAccessTokenFromDb } = require('../services/database/tokens/potiron_shippingbo');
const { updateOrderInvoiceSent } = require('../services/API/Shippingbo/Potiron/ordersCRUD');
const router = express.Router();

router.post('/sendInvoice', async (req, res) => {
    let accessTokenMS365 = await getAccessTokenMS365();
    let accessToken = await getAccessTokenFromDb();
    const newOrder = req.body;
    if(newOrder.additional_data.from === 'dispatched' && 
        newOrder.additional_data.to === 'in_preparation' && 
        ['POTIRON.COM', 'Pinkconnect'].includes(newOrder.object.origin) &&
        !newOrder.object.billing_adress?.instructions !== 'invoice_sent'
    ) {
        let mailSent = await sendAutomaticInvoice(accessTokenMS365, accessToken, newOrder);
        if(mailSent) {
            console.log('mail sent with invoice and update order', newOrder.object)
            updateOrderInvoiceSent(accessToken, newOrder.object.id)
        } else {
            console.log('error when sending mail with invoice')
        }
    }
}) 

module.exports = router;