const express = require('express');
const { getReturnContactData } = require('../services/database/return_contact');
const { getOrderByShopifyId } = require('../services/API/Shopify/orders');
const router = express.Router();

router.get('/returnForm:id', async (req, res) => {
    const { id } = req.params;
    const returnDataFromDb = await getReturnContactData(id);
    const shopifyOrder = await getOrderByShopifyId(returnDataFromDb.shopify_id);
    console.log('returnData', returnDataFromDb);
    console.log('shopify', shopifyOrder);
})

module.exports = router;