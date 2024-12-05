//Routes concerning pro orders
const express = require('express');
const router = express.Router();

const { getAccessTokenFromDb } = require('../services/database/tokens/potiron_shippingbo');
const { createDraftOrder, updateDraftOrderWithDraftId, lastDraftOrder, draftOrderById } = require('../services/API/Shopify/draftOrders');
const { getAccessTokenWarehouseFromDb } = require('../services/database/tokens/gma_shippingbo');
const { getShippingboOrderDetails, cancelShippingboDraft, updateShippingboOrder } = require('../services/API/Shippingbo/Potiron/ordersCRUD');
const { getWarehouseOrderDetails, updateWarehouseOrder, updateWarehouseOrderPayments } = require('../services/API/Shippingbo/Gma/ordersCRUD');
const { getCustomerMetafields } = require('../services/API/Shopify/customers');


//trigger on shippingbo webhook (create order)
router.post('/updateDraftOrder', async (req, res) => {
  const createdOrder= req.body;
  let accessTokenWarehouse = getAccessTokenWarehouseFromDb();
  if(createdOrder.object.origin === 'Potironpro' && (createdOrder.object.origin_ref).includes('provisoire')) {
    console.log('order to update with waiting_for_payment in 5 minutes', createdOrder.object.id);
    let shippingboId = createdOrder.object.id; 
    setTimeout (updateWarehouseOrderPayments, 5 * 60 * 1000, accessTokenWarehouse, shippingboId);
  }
})

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

//webhook on update draft order : https://potironapppro.onrender.com/proOrder/updatedDraftOrder
router.post('/updatedDraftOrder', async (req, res) => {
    const updatedDraftData= req.body;
    const draftTagString = updatedDraftData.tags || '';
    const draftTagArray = draftTagString.split(',').map(tag => tag.trim());
    const draftTagExists = draftTagArray.some(tag => tag.startsWith("draft"));
    const isCommandePro = draftTagArray.includes('Commande PRO');
    const isCompleted = updatedDraftData.status;
    const draftName = updatedDraftData.name;
    const draftId = "draft" + draftName.replace('#','');
    const orderId = updatedDraftData.id;
    const metafields = await getCustomerMetafields(updatedDraftData.customer.id);
    let deliveryPref;
    let deliveryPrefTag;
    let deliveryPrefValue;
    if(metafields) {
      deliveryPref = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'delivery_pref');
      if(deliveryPref) {  
        deliveryPrefValue = deliveryPref.value;
        deliveryPrefTag = "Livraison : " + deliveryPrefValue;
      }
    }
    let deliveryEquipment;
    let deliveryEquipmentValue;
    let deliveryEquipmentTag;
    let deliveryAppointment;
    let deliveryAppointmentValue;
    let deliveryAppointmentTag;
    let deliveryNotes;
    let deliveryNotesValue;
    let deliveryNotesTag;
    if( deliveryPref && deliveryPrefValue.includes('palette')) {
      deliveryEquipment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_equipment');
      deliveryAppointment = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_appointment');
      deliveryEquipmentValue = deliveryEquipment ? deliveryEquipment.value : '';
      deliveryEquipmentTag = "Equipement : " + deliveryEquipmentValue;
      deliveryAppointmentValue = deliveryAppointment ? (deliveryAppointment.value === true ? "Oui": deliveryAppointment.value === false ? "Non" : deliveryAppointment.value): null;
      deliveryAppointmentTag = "Rendez-vous : " + deliveryAppointmentValue;
      deliveryNotes = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'palette_notes');
      deliveryNotesValue = deliveryNotes ? deliveryNotes.value : '';
      const deliveryNotesEncoded = deliveryNotesValue.replace(/,/g, '-');
      deliveryNotesTag = 'Notes : ' + deliveryNotesEncoded;
    }
    let accessToken = await getAccessTokenFromDb();
      if (isCompleted === true && isCommandePro) {
        try {
          const draftDetails = await getShippingboOrderDetails(accessToken, draftId);
          if(draftDetails) {
            const {id: shippingboDraftId} = draftDetails;
            await cancelShippingboDraft(accessToken, shippingboDraftId);
          }
        } catch(err) {
          console.log('error shippingboId', err);
        }
    } else if(isCommandePro && !draftTagExists) {
      try {
        draftTagArray.push(draftId);
        draftTagArray.push(deliveryPrefTag);
        if(deliveryEquipment && deliveryEquipmentValue !== '') {
          draftTagArray.push(deliveryEquipmentTag);
        }
        if(deliveryAppointment && deliveryAppointmentValue !== null) {
          draftTagArray.push(deliveryAppointmentTag);
        }
        if(deliveryNotes && deliveryNotesValue !== '') {
          draftTagArray.push(deliveryNotesTag)
        }
        const updatedOrder = {
          draft_order: {
            id: orderId,
            tags: draftTagArray.join(', ')
          }
         };
        await updateDraftOrderWithDraftId(updatedOrder, orderId);
        res.status(200).send('Order updated');
      } catch(err) {
        console.log('error shippingboId', err);
      }
    }
  })
  
//get last draft order with customer id
router.get('/last-draft-order/:customer_id', async (req, res) => {
    const customerId = req.params.customer_id;
    try {
      const lastDraft = await lastDraftOrder(customerId);
      res.json(lastDraft);
    } catch (error) {
      res.status(500).send('Error retrieving last draft order by customer id');
    }
  })
  
//get draft order by order id
  router.get('/getDraftOrder/:draftOrderId', async (req, res) => {
    const draftOrderId = req.params.draftOrderId;
    try {
      const draftOrderData = await draftOrderById(draftOrderId); 
      res.json(draftOrderData);
    } catch (error) {
      res.status(500).send('Error retrieving draft order by id');
    }
  })

  module.exports = router;