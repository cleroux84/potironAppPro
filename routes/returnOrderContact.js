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
    const orderItems = returnDataFromDb.items_to_return;
    const enrichOrderItems = async (orderItems) => {
        const enrichedItems = await Promise.all(orderItems.map(async (item) => {
          const sku = item.product_ref; 
          const priceData = lineItemsMapping[sku] || { price: null };
          const productVariant = await getProductWeightBySku(sku);
  
          return {
            ...item,
            price: priceData.price,
            imageUrl: productVariant?.product?.featuredImage?.url || null, 
          };
        }));
      return enrichedItems;
    };
    const enrichedOrderItems = await enrichOrderItems(orderItems);
    console.log('dataCustomer', dataCustomer);
    console.log('enrichItems', enrichedOrderItems);
})

module.exports = router;