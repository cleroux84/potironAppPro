const express = require('express');
const { getReturnContactData } = require('../services/database/return_contact');
const { getOrderByShopifyId } = require('../services/API/Shopify/orders');
const { getProductWeightBySku } = require('../services/API/Shopify/products');
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

    const items = returnDataFromDb.items_to_return;
    const enrichItemsWithData = async (items) => {
        const enrichedItems = [];
        for(const item of items) {
            const productDetails = await getProductWeightBySku(item.product_user_ref);
            if(productDetails) {
                enrichedItems.push({
                    ...item,
                    title: productDetails.title,
                    imageUrl: productDetails.imageUrl
                });
            } else {
                console.error('Details du produit non trouvé')
            }
        console.log('enrichedItems', enrichedItems);
        }
    }
    enrichItemsWithData(items);


    console.log('dataCustomer', dataCustomer);
})

module.exports = router;