//send Shippingbo Invoice if new order from potiron.com

const express = require('express');
const { sendAutomaticInvoice } = require('../services/sendMails/mailForCustomers');
const { getAccessTokenMS365 } = require('../services/API/microsoft');
const { getAccessTokenFromDb } = require('../services/database/tokens/potiron_shippingbo');
const { updateOrderInvoiceSent } = require('../services/API/Shippingbo/Potiron/ordersCRUD');
const router = express.Router();

router.post('/sendInvoice', async (req, res) => {
    // let accessTokenMS365 = await getAccessTokenMS365();
    // let accessToken = await getAccessTokenFromDb();
    // const newOrder = req.body;
    // const orderId = newOrder.object.id;
    // const existingInstructions = newOrder.object.billing_address?.instructions || '';
    // const invoiceInstruction = `invoice_sent_${orderId}`;
    // const updatedInstructions = existingInstructions
    // ? `${existingInstructions} | ${invoiceInstruction}`
    // : invoiceInstruction;
    // if(newOrder.additional_data.from === 'dispatched' && 
    //     newOrder.additional_data.to === 'in_preparation' && 
    //     ['POTIRON.COM', 'Pinkconnect'].includes(newOrder.object.origin) &&
    //     !existingInstructions.includes(invoiceInstruction)
    // ) {
    //     let mailSent = await sendAutomaticInvoice(accessTokenMS365, accessToken, newOrder);
    //     if(mailSent) {
    //         // console.log('mail sent with invoice and update order', newOrder.object.id)
    //         updateOrderInvoiceSent(accessToken, newOrder.object.billing_address.id, invoiceInstruction)
    //     } else {
    //         console.log('error when sending mail with invoice')
    //     }
    // }
}) 

module.exports = router;