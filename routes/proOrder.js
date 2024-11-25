//Routes concerning pro orders
const express = require('express');
const router = express.Router();

const { getAccessTokenFromDb } = require('../services/database/tokens/potiron_shippingbo');
const { createDraftOrder } = require('../services/API/Shopify/draftOrders');
const { getAccessTokenWarehouseFromDb } = require('../services/database/tokens/gma_shippingbo');
const { getShippingboOrderDetails, cancelShippingboDraft, updateShippingboOrder } = require('../services/API/Shippingbo/Potiron/ordersCRUD');
const { getWarehouseOrderDetails, updateWarehouseOrder } = require('../services/API/Shippingbo/Gma/ordersCRUD');

//create draft order from cart page if b2B is connected
router.post('/create-pro-draft-order', async (req, res) => {
    try {
      const orderData = req.body; 
      const items = orderData.items;
      const lineItems = items.map(item => ({
        title: item.title,
        price: (item.price / 100).toFixed(2),
        quantity: item.quantity,
        variant_id: item.variant_id,
      }));
  
      const draftOrder = {
        draft_order: {
          line_items: lineItems,
          customer: {
            id: orderData.customer_id 
          },
          use_customer_default_address: true,
          tags: "Commande PRO"
        }
      };
      let accessToken = await getAccessTokenFromDb();
      const data = await createDraftOrder(draftOrder, accessToken);
      res.status(200).json(data); 
    } catch (error) {
      console.error('Erreur lors de la création du brouillon de commande :', error);
      res.status(500).json({ error: 'Erreur lors de la création du brouillon de commande.' });
    }
  });

//webhook on order update : https://potironapppro.onrender.com/proOrder
//Check if a tag starts with "draft" to update shippingbo Potiron Paris AND GMA Entrepôt order and cancel shippingbo draft order 
router.post('/proOrder', async (req, res) => {
    var orderData = req.body;
    var orderId = orderData.id;
    var orderTags = orderData.tags;
    const tagsArr = orderData.customer.tags.split(', ');
    const tagsArray = orderTags.split(', ').map(tag => tag.trim());
    const draftTagExists = tagsArray.some(tag => tag.startsWith('draft'));
    let draftId = '';
    if(draftTagExists) {
      draftId = tagsArray.find(tag => tag.startsWith('draft'));
    }
    const isCommandePro = tagsArray.includes('Commande PRO');
    const isB2B = tagsArr.includes('PRO validé');
    let accessToken = await getAccessTokenFromDb();
    let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
    if(isB2B && isCommandePro) {
      const draftDetails = await getShippingboOrderDetails(accessToken, draftId);
      const orderDetails = await getShippingboOrderDetails(accessToken, orderId);
      if(draftDetails) {
        const {id: shippingboDraftId} = draftDetails;
        await cancelShippingboDraft(accessToken, shippingboDraftId);
      }
      if(orderDetails) {
        const {id: shippingboId, origin_ref: shippingboOriginRef} = orderDetails
        await updateShippingboOrder(accessToken, shippingboId, shippingboOriginRef);
        const warehouseDetails = await getWarehouseOrderDetails(accessTokenWarehouse, shippingboId);
        if(warehouseDetails) {
          const {id: shippingboIdwarehouse, origin_ref: shippingboWarehouseOriginRef} = warehouseDetails
          await updateWarehouseOrder(accessTokenWarehouse, shippingboIdwarehouse, shippingboWarehouseOriginRef);
          } else {
            console.log("empty warehouse details")
          }
      }
    } else {
      console.log('update order pour client non pro');
    }
  });

  module.exports = router;