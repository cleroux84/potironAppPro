const express = require('express');
const { getReturnContactData } = require('../services/database/return_contact');
const { getOrderByShopifyId } = require('../services/API/Shopify/orders');
const router = express.Router();

router.get('/returnForm:id', async (req, res) => {
    const { id } = req.params;
    const returnDataFromDb = await getReturnContactData(id);
    const shopifyOrder = await getOrderByShopifyId(returnDataFromDb.shopify_id);

    const dataCustomer = {
        orderName : shopifyOrder.order.name,
        customerMail : shopifyOrder.order.email,
        orderCreatedAt: shopifyOrder.order.created_at,
        fullName: shopifyOrder.order.customer.first_name + shopifyOrder.order.customer.last_name 
    }

    console.log('dataCustomer', dataCustomer);
})

module.exports = router;