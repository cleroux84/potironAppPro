const express = require('express');
const router = express.Router();

router.post('/sendInvoice', async (req, res) => {
    const newOrder = req.body;
    if(newOrder.additional_data.from === 'dispatched'
        && newOrder.additional_data.to === 'in_preparation'
        && newOrder.object.origin === 'POTIRON.COM') {
        console.log('send invoice for : ', newOrder.object.id);
    }
}) 

module.exports = router;