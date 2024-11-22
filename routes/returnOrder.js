//Routes concerning automated return order 

const express = require('express');
const { getOrderByShopifyId } = require('../services/API/Shopify/orders');
const { checkIfPriceRuleExists, createPriceRule } = require('../services/API/Shopify/priceRules');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../services/API/microsoft');
const { sendDiscountCodeAfterReturn } = require('../services/sendMails/mailForCustomers');
const { saveDiscountMailData } = require('../services/database/scheduled_emails');
const router = express.Router();

//trigger on shippingbo webhook (cancel order / will become returned ?) to create and send discount code to customer
router.post('/returnOrderCancel', async (req, res) => {
    const orderCanceled = req.body;
    if(orderCanceled.object.reason === 'Retour automatisé en ligne'
      && orderCanceled.additional_data.from === 'new'
      && orderCanceled.additional_data.to ==='canceled' //TODO change for "returned" with a new webhook
    ) 
    {
      try {
        const shopifyIdString = orderCanceled.object.reason_ref;
        const shopifyId = Number(shopifyIdString);
        const getAttributes = await getOrderByShopifyId(shopifyId);
        const noteAttributes = getAttributes.order.note_attributes;
        const customerIdAttr = noteAttributes.find(attr => attr.name === "customerId");
        const customerId = customerIdAttr ? customerIdAttr.value : null;
        const orderName = getAttributes.order.name;
        const totalAmountAttr = noteAttributes.find(attr => attr.name === "totalOrderReturn");
        const totalAmount = totalAmountAttr ? parseFloat(totalAmountAttr.value) : null;
        const ruleExists = await checkIfPriceRuleExists(orderName);
        // Create discount code in shopify if price rule does not exist
        if(!ruleExists) {
            let priceRules = await createPriceRule(customerId, orderName, totalAmount);
            const priceRuleId = priceRules.discountData.discount_code.price_rule_id;
            const discountCodeId = priceRules.discountData.discount_code.id;
            const discountCode = priceRules.discountData.discount_code.code;
            const discountAmount = priceRules.discountRule.price_rule.value;
            const discountEnd = priceRules.discountRule.price_rule.ends_at;
            const discountDate = new Date(discountEnd);
            const formattedDate = discountDate.toLocaleDateString('fr-FR', {     day: 'numeric',     month: 'long',     year: 'numeric' });  
           
            const shopifyOrder = await getOrderByShopifyId(orderCanceled.object.reason_ref);
            let accessTokenMS365 = await getAccessTokenMS365();
            if(!accessTokenMS365) {
              await refreshMS365AccessToken();
              accessTokenMS365 = await getAccessTokenMS365();
            }
            const customerData = shopifyOrder.order.customer;
            await sendDiscountCodeAfterReturn(accessTokenMS365, customerData, orderName, discountCode, discountAmount, formattedDate);
            await saveDiscountMailData(customerData.email, orderName, discountCode, discountAmount, discountEnd, discountCodeId, priceRuleId);
          }
      } catch (error) {
        console.error("error webhook discount code", error);
      }
    }
    res.status(200).send('webhook reçu')
})

module.exports = router;