const express = require('express');
const router = express.Router();

router.post('/sendInvoice', async (req, res) => {
    const newOrder = req.body;
    console.log('new order Shippingbo', newOrder);
}) 

module.exports = router;