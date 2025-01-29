//Routes concerning automated return order 

const express = require('express');
const { getOrderByShopifyId, updateOrder, orderByMail } = require('../services/API/Shopify/orders');
const { checkIfPriceRuleExists, createPriceRule, isReturnableDate } = require('../services/API/Shopify/priceRules');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../services/API/microsoft');
const { sendDiscountCodeAfterReturn, sendReturnDataToCustomer, sendReceiptAndWaitForRefund, sendAlertMail } = require('../services/sendMails/mailForCustomers');
const { saveDiscountMailData } = require('../services/database/scheduled_emails');
const { getAccessTokenFromDb } = require('../services/database/tokens/potiron_shippingbo');
const { getAccessTokenWarehouseFromDb } = require('../services/database/tokens/gma_shippingbo');
const { orderById } = require('../services/API/Shopify/customers');
const { getShippingboOrderDetails } = require('../services/API/Shippingbo/Potiron/ordersCRUD');
const { getWarehouseOrderDetails, getshippingDetails } = require('../services/API/Shippingbo/Gma/ordersCRUD');
const { createLabel, getShippingPrice, calculateTotalShippingCost, getGroupedItemsForRefund, calculateShippingCostForGroupedItems, getGroupedItemsForLabels } = require('../services/API/colissimo');
const { getProductWeightBySku } = require('../services/API/Shopify/products');
const { checkIfReturnOrderExist, createReturnOrder } = require('../services/API/Shippingbo/Gma/returnOrdersCRUD');
const { sendReturnDataToSAV, sendRefundDataToSAV, mailToSendRefund, sendReturnedProductWithProblem } = require('../services/sendMails/mailForTeam');
const { saveReturnContactData } = require('../services/database/return_contact');
const router = express.Router();

//give data for return order demand with contact form
router.post('/returnContact', async (req, res) => {
  const {warehouseId, shopifyId, items} = req.body;
  // console.log('items to return', items);
  const savedReturnData = await saveReturnContactData(warehouseId, shopifyId, items);

  res.status(200).json({
    success: true,
    returnDbId: savedReturnData,
  });
})

//trigger on shippingbo webhook (cancel order / will become returned ?) to create and send discount code to customer
router.post('/returnOrderCancel', async (req, res) => {
    const orderCanceled = req.body;
    let accessTokenMS365 = await getAccessTokenMS365();
    if(!accessTokenMS365) {
      await refreshMS365AccessToken();
      accessTokenMS365 = await getAccessTokenMS365();
    }
    if(orderCanceled.additional_data.from === 'new'
      && orderCanceled.additional_data.to ==='returned'
      && (orderCanceled.object.reason === 'Retour Auto ASSET' || orderCanceled.object.reason === 'Retour Auto REFUND')
    ) {
      const shopifyIdString = orderCanceled.object.reason_ref;
      const shopifyId = Number(shopifyIdString);
      const getAttributes = await getOrderByShopifyId(shopifyId);
      const noteAttributes = getAttributes.order.note_attributes;
      const customerIdAttr = noteAttributes.find(attr => attr.name === "customerId");
      const customerId = customerIdAttr ? customerIdAttr.value : null;
      const orderName = getAttributes.order.name;
      const totalAmountAttr = noteAttributes.find(attr => attr.name === "totalOrderReturn");
      const totalAmount = totalAmountAttr ? parseFloat(totalAmountAttr.value) : null;
      const orderCanceledId = orderCanceled.object.id;
      const shopifyOrder = await getOrderByShopifyId(orderCanceled.object.reason_ref);   
      const customerData = shopifyOrder.order.customer;

      if(orderCanceled.object.reason === 'Retour Auto ASSET') {
        try {
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
            
              
              await sendDiscountCodeAfterReturn(accessTokenMS365, customerData, orderName, discountCode, discountAmount, formattedDate);
              if(customerData.email) {
                await saveDiscountMailData(customerData.email, orderName, discountCode, discountAmount, discountEnd, discountCodeId, priceRuleId);
              } else {
                console.log('Client sans Mail lié: ', customerData.id);
              }
            } else {
              console.log('send mail to magalie and dev to alert reduc already exists');
              await sendAlertMail(accessTokenMS365, customerData, orderName, orderCanceledId);
            }
          } catch (error) {
          console.error("error webhook discount code", error);
        }
      } else if(orderCanceled.object.reason === 'Retour Auto REFUND') {
        //Send Mail to Magalie to send refund
        await mailToSendRefund(accessTokenMS365, customerData, orderCanceledId, orderName, totalAmount);
        //Send Mail to Customer to aknowledge receipt and wait for refund within 48hours ?
        await sendReceiptAndWaitForRefund(accessTokenMS365, customerData, orderName, totalAmount);
      }
    } else if(
      orderCanceled.additional_data.from === 'new'
      && orderCanceled.additional_data.to ==='closed'
      && (orderCanceled.object.reason === 'Retour Auto ASSET' || orderCanceled.object.reason === 'Retour Auto REFUND')
    ) {
      const shopifyIdString = orderCanceled.object.reason_ref;
      const shopifyId = Number(shopifyIdString);
      const getAttributes = await getOrderByShopifyId(shopifyId);
      const noteAttributes = getAttributes.order.note_attributes;
      const customerIdAttr = noteAttributes.find(attr => attr.name === "customerId");
      const customerId = customerIdAttr ? customerIdAttr.value : null;
      const orderName = getAttributes.order.name;
      const totalAmountAttr = noteAttributes.find(attr => attr.name === "totalOrderReturn");
      const totalAmount = totalAmountAttr ? parseFloat(totalAmountAttr.value) : null;
      const orderCanceledId = orderCanceled.object.id;
      const shopifyOrder = await getOrderByShopifyId(orderCanceled.object.reason_ref);   
      const customerData = shopifyOrder.order.customer;
      //Send Mail to Magalie and Mélanie to investigate return products problems 
      await sendReturnedProductWithProblem(accessTokenMS365, customerData, orderName, orderCanceled);
    }
    res.status(200).send('webhook reçu')
})

//Get closedAt and isReturnable for account order
router.get('/getClosedOrder', async (req, res) => {
  let accessToken = await getAccessTokenFromDb();
  const shopifyId = req.query.shopifyId;
  try {
    const shippingboDataPotiron = await getShippingboOrderDetails(accessToken, shopifyId);
    const closeOrderDelivery = shippingboDataPotiron.closed_at;
    const isReturnable = await isReturnableDate(closeOrderDelivery);
    res.status(200).json({closeOrderDelivery: closeOrderDelivery, isReturnable: isReturnable}) 

  } catch (error) {
    console.error("Error checking if is returnable", error) 
  }
  

})

//Get initial Order customer want return with mail and orderName
router.get('/getOrderById', async (req, res) => {
  let accessToken = await getAccessTokenFromDb();
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  const orderName = req.query.getOrder_name;
  const orderMail = req.query.getOrder_mail;
  const customerId = req.query.customer_id;
  let successData = true;
  let messageData;

  try {
    let orderData;
    // Data initial order from Shopify
    if (customerId) {
      orderData = await orderById(orderName, orderMail, customerId);
    } else {
      orderData = await orderByMail(orderName, orderMail);
    }

    if(!orderData) { // no order with that mail/customerId and order name
      successData = false;
      messageData = "no order";

      res.status(200).json({
        success: successData,
        messageData: messageData,
      });
    } else {
      const shopifyOrderId = orderData.id;
      const shippingboDataPotiron = await getShippingboOrderDetails(accessToken, shopifyOrderId); 
      const shippingboDataWarehouse = await getWarehouseOrderDetails(accessTokenWarehouse, shippingboDataPotiron.id);
      const originalOrder = await getOrderByShopifyId(shopifyOrderId);
      const closeOrderDelivery = shippingboDataWarehouse.closed_at;
      
      const isReturnable = await isReturnableDate(closeOrderDelivery);
      // if(!isReturnable) {
      //   successData = false;
      //   messageData = "too late";
      // }
      if(originalOrder.order.source_name !== "web") {
        if(orderData.tags.includes('Commande PRO')) {
          successData = false;
          messageData = "pro order";
        } else {
          successData = false;
          messageData = "retailer";
        }
      }
      // get data order from shippingbo warehouse
      const orderDetails = await getshippingDetails(accessTokenWarehouse, shippingboDataWarehouse.id);
      const orderItems = orderDetails.order.order_items;
      const orderWarehouseId = orderDetails.order.id;
      // check if order is from France
      if(orderDetails.order.shipping_address.country !== 'FR') {
        successData = false;
        messageData = 'foreigner';
      }
      //check state of order 
      if(orderDetails.order.state !== "closed") {
        successData = false;
        if(orderDetails.order.state === 'canceled') {
          messageData = 'canceled';
        }
        if(orderDetails.order.state === 'to_be_prepared' || 
          orderDetails.order.state === 'in_preparation' ||
          orderDetails.order.state === 'at_pickup_location' ||
          orderDetails.order.state === 'rejected' ||
          orderDetails.order.state === 'waiting_for_payment' ||
          orderDetails.order.state === 'waiting_for_stock' ||
          orderDetails.order.state === 'back_from_client' 
        ) {
          messageData = 'not closed'
        } 
        if(orderDetails.order.state === 'splitted') {
          messageData = 'splitted'
        }
      }
  
      const lineItemsForPrice = originalOrder.order.line_items;
      const lineItemsMapping = lineItemsForPrice.reduce((acc, item) => {
        acc[item.sku] = {
          price: parseFloat(item.price),
          currency: item.price_set.shop_money.currency_code,
        };
        return acc;
      }, {});
  
      const enrichOrderItems = async (orderItems) => {
        const enrichedItems = await Promise.all(orderItems.map(async (item) => {
          const sku = item.product_ref; 
          const priceData = lineItemsMapping[sku] || { price: null };
          const productVariant = await getProductWeightBySku(sku);
  
          return {
            ...item,
            price: priceData.price,
            imageUrl: productVariant?.product?.featuredImage?.originalSrc || null, 
          };
        }));
      return enrichedItems;
    };
    const enrichedOrderItems = await enrichOrderItems(orderItems);
  
    res.status(200).json({
      success: successData,
      orderItems: enrichedOrderItems,
      orderWarehouse: orderDetails,
      originalOrder: originalOrder,
      messageData: messageData
    });
  }
  } catch (error) {
    res.status(500).send('Error retrieving order with ordername and mail');
  }
});

let quantitiesByRefs;

router.post('/checkIfsReturnPossible', async (req, res) => { 
  const { orderWarehouse, orderShopify, return_items, quantities, filteredItems, returnAllOrder, productSkuCalc } = req.body;
  const itemsToReturn = return_items.split(','); 
  const quantitiesByRefs = JSON.parse(quantities);
  let initialDelivery = orderWarehouse.order.total_shipping_tax_included_cents;
  // const reasonsByRefs = JSON.parse(reasons);   
  // let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
 
  try {
    // const warehouseOrder = await getshippingDetails(accessTokenWarehouse, warehouseOrderId);
    const warehouseOrder = orderWarehouse;
    const shipments = warehouseOrder.order.shipments;
    let allItemsHaveColissimo = true;
    let totalAsset = 0;
    let totalRefund = 0;
    let totalWeight = 0;
    let priceByWeight;
    if(returnAllOrder) {
      if(initialDelivery > 0) {
        totalAsset = (((warehouseOrder.order.total_price_cents) - initialDelivery)/100).toFixed(2);
      } else {
        totalAsset = (warehouseOrder.order.total_price_cents / 100).toFixed(2);
      }
      totalWeight = shipments.reduce((sum, shipment) => sum + (shipment.total_weight || 0), 0) / 1000;

      if(shipments.length === 1) {
        priceByWeight = await getShippingPrice(totalWeight);
        totalRefund = totalAsset - priceByWeight;
      } else {
        priceByWeight = await calculateTotalShippingCost(shipments, filteredItems);
        totalRefund = totalAsset - priceByWeight;
      }
    } else {
      if(productSkuCalc.length === 1 && productSkuCalc[0].quantity === 1)  {
        for(const sku of productSkuCalc) {
          const productFound = await getProductWeightBySku(sku.product_user_ref);
          if(productFound) {
            totalAsset += sku.unit_price * sku.quantity;
            totalWeight += productFound.weight * sku.quantity;
            priceByWeight = await getShippingPrice(totalWeight);
            totalRefund = totalAsset - priceByWeight;
          }
        }
      } else {
        for(const sku of productSkuCalc) {
          totalAsset += sku.unit_price * sku.quantity;
        }
        const groupedItems = getGroupedItemsForRefund(shipments, filteredItems, quantitiesByRefs);
        priceByWeight = await calculateShippingCostForGroupedItems(groupedItems, shipments);
        totalRefund = totalAsset - priceByWeight;
      }
    }
 
    itemsToReturn.forEach(ref => {
      const foundItem = shipments.find((shipment, index) => {
        const item = shipment.order_items_shipments.find(item => item.order_item_id.toString() === ref);
        if (item) {
          const shippingMethod = shipment.shipping_method_name;
          // const reason = reasonsByRefs[ref]; 
          if (shippingMethod && shippingMethod.includes("Colissimo")) {
            console.log(`Référence ${ref} trouvée dans l'expédition ${index} avec la méthode d'expédition : ${shippingMethod}`);
          } else {
            console.log(`Référence ${ref} trouvée dans l'expédition ${index} mais sans méthode d'expédition "colissimo".`);
            allItemsHaveColissimo = false;
          }
          return true;
        }
        return false;
      });
 
      if (!foundItem) {
        console.log(`Référence ${ref} non trouvée dans les expéditions.`);
        allItemsHaveColissimo = false;
      }
    });
 
    if (!allItemsHaveColissimo) {
      return res.status(200).json({
        success: false
      });
    }

    const returnValues = {
      totalAsset: totalAsset,
      totalRefund: totalRefund
    }
 
    res.json({
      success: true,
      orderWarehouse: warehouseOrder,
      orderShopify: orderShopify,
      productRefs: return_items,
      filteredItems: filteredItems,
      returnValues: returnValues,
      productSkuCalc: productSkuCalc,
      quantities: quantities,
    });
 
  } catch (error) {
    console.error('Erreur lors de la vérification des expéditions:', error);
    res.status(500).send('Erreur lors de la vérification des expéditions');
  }
});

router.post('/returnProduct', async (req, res) => {
  let accessTokenMS365 = await getAccessTokenMS365();
  if(!accessTokenMS365) {
    await refreshMS365AccessToken();
    accessTokenMS365 = await getAccessTokenMS365();
  }
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  const { orderWarehouse, orderShopify, returnOption, returnAll, productSku, filteredItems, quantities} = req.body;
  const customerId = orderShopify.order.customer.id;
  const orderId = orderWarehouse.order.id;
  const shopifyOrderId = orderShopify.order.id;
  const quantitiesByRefs = JSON.parse(quantities);

  //Retrieve data from initial order shippingbo GMA
  const warehouseOrder = orderWarehouse;
  let weightToReturn = 0;
  let totalOrder = 0;
  let totalAsset = 0;
  let priceByWeight = 0;
  let totalRefund = 0;
  let parcel;
  let createLabelData = [];
  let parcelNumbers = [];
  let pdfBase64 = [];
  let returnOrderData;
  let returnOrderId;
  let shopifyId;
  let optionChoose;
  const initialNumberOfPackages = warehouseOrder.order.shipments.length;
  const shipments = warehouseOrder.order.shipments;

   //Check if return order exists in shippingbo warehouse
   const returnOrderExists = await checkIfReturnOrderExist(accessTokenWarehouse, warehouseOrder.order.id);
   console.log('returnOrderExists ?', returnOrderExists);

  //  if(!returnOrderExists) {

    if(returnOption === "option1") {
      optionChoose = "option1"
      //Create return Order in Shippingbo GMA
      returnOrderData = await createReturnOrder(accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId, optionChoose);
      returnOrderId = returnOrderData.return_order.id;
      shopifyId = returnOrderData.return_order.reason_ref;
    } else if( returnOption === "option2") {
      optionChoose = "option2"
      //Create return Order in Shippingbo GMA
      returnOrderData = await createReturnOrder(accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId, optionChoose);
      returnOrderId = returnOrderData.return_order.id;
      shopifyId = returnOrderData.return_order.reason_ref;
    }
    const senderCustomer = {
      'name': warehouseOrder.order.shipping_address.fullname,
      'address': warehouseOrder.order.shipping_address.street1,
      'address2': warehouseOrder.order.shipping_address.street2,
      'city': warehouseOrder.order.shipping_address.city,
      "postalCode": warehouseOrder.order.shipping_address.zip,
      "country": warehouseOrder.order.shipping_address.country,
      "email": warehouseOrder.order.shipping_address.email,
      "phone": warehouseOrder.order.shipping_address.phone1,
      "origin_ref": warehouseOrder.order.origin_ref,
      "order_id": returnOrderId
    };
    
    //Create Labels and set total amounts asset and refund
    if(returnAll) {
      totalAsset = ((req.body.totalOrder)/100).toFixed(2);
      if(initialNumberOfPackages === 1) {
        weightToReturn = warehouseOrder.order.shipments
        .reduce((total, shipment) => total + (shipment.total_weight / 1000), 0);
        priceByWeight = await getShippingPrice(weightToReturn);
        totalRefund = totalAsset - priceByWeight;

        parcel = {
          "weight": weightToReturn,
          "insuranceAmount": 0,
          "insuranceValue": 0,
          "nonMachinable": false,
          "returnReceipt": false
        };
        const labelData = await createLabel(senderCustomer, parcel);
        if(labelData) {
          createLabelData.push(labelData);
          parcelNumbers = createLabelData.map(data => data.parcelNumber);
          pdfBase64 = createLabelData.map(data => data.pdfData);
        }

      } else { 
        priceByWeight = await calculateTotalShippingCost(warehouseOrder.order.shipments, filteredItems);
        totalRefund = totalAsset - priceByWeight;

        const parcels = shipments.map(shipment => ({
          "weight": shipment.total_weight / 1000,
          "insuranceAmount": 0,
          "insuranceValue": 0,
          "nonMachinable": false,
          "returnReceipt": false
        }));

        for(parcel of parcels) {
          const labelData = await createLabel(senderCustomer, parcel);
          if(labelData) { 
            createLabelData.push(labelData);
            parcelNumbers = createLabelData.map(data => data.parcelNumber);
            pdfBase64 = createLabelData.map(data => data.pdfData);
          }
        }
      }
      
      totalOrder = req.body.totalOrder;
      totalOrder = (totalOrder / 100).toFixed(2);
      totalRefund = totalRefund.toFixed(2);
    } else {
      totalAsset = ((req.body.totalOrder)/100).toFixed(2);
      if(productSku.length === 1) {
        if(productSku[0].quantity === 1) {
          const productFoundSku = await getProductWeightBySku(productSku[0].product_user_ref);
          weightToReturn += productFoundSku.weight * productSku[0].quantity;
          totalOrder += productSku[0].unit_price * productSku[0].quantity;
          priceByWeight = await getShippingPrice(weightToReturn);
          totalRefund = totalOrder - priceByWeight;

          parcel = {
            "weight": weightToReturn,
            "insuranceAmount": 0,
            "insuranceValue": 0,
            "nonMachinable": false,
            "returnReceipt": false
          };
          const labelData = await createLabel(senderCustomer, parcel);
          if(labelData) {
            createLabelData.push(labelData);
            parcelNumbers = createLabelData.map(data => data.parcelNumber);
            pdfBase64 = createLabelData.map(data => data.pdfData);
          }
        } else {
          console.log("si 1 produit mais plusieurs quantité") 
          const returnQuantities = { [productSku[0].product_user_ref]: productSku[0].quantity };
          for(const sku of productSku) {
            totalOrder += sku.unit_price * sku.quantity;
          }
          const groupedItems = getGroupedItemsForRefund(warehouseOrder.order.shipments, filteredItems, quantitiesByRefs)
          priceByWeight = await calculateShippingCostForGroupedItems(groupedItems, warehouseOrder.order.shipments);
          totalRefund = totalOrder - priceByWeight;

          const groupedItemsByShipment = getGroupedItemsForLabels(shipments, filteredItems, returnQuantities);
          
          for (const shipmentId in groupedItemsByShipment) {
            const itemsInShipment = groupedItemsByShipment[shipmentId];
        
            for (const item of itemsInShipment) {
                const productWeight = await getProductWeightBySku(item.product_ref);
                const weightPerUnit = productWeight.weight;
        
                for (let i = 0; i < item.quantity; i++) {
                    const parcel = {
                        "weight": weightPerUnit,
                        "insuranceAmount": 0,
                        "insuranceValue": 0,
                        "nonMachinable": false,
                        "returnReceipt": false
                    };
        
                    const labelData = await createLabel(senderCustomer, parcel);
                    if (labelData) {
                        createLabelData.push(labelData);
                        parcelNumbers = createLabelData.map(data => data.parcelNumber);
                        pdfBase64 = createLabelData.map(data => data.pdfData);
                    }
                }
            }
          }
        }
      } else {
        console.log('Retour de plusieurs produits répartis sur plusieurs colis');
        const returnQuantities = productSku.reduce((acc, sku) => {
            acc[sku.product_user_ref] = sku.quantity;
            return acc;
        }, {});
        
        const groupedItemsByShipment = getGroupedItemsForLabels(shipments, filteredItems, returnQuantities);
        for (const shipmentId in groupedItemsByShipment) {
          const itemsInShipment = groupedItemsByShipment[shipmentId];
      
          for (const item of itemsInShipment) {
              const productWeight = await getProductWeightBySku(item.product_ref);
              const weightPerUnit = productWeight.weight;
      
              for (let i = 0; i < item.quantity; i++) {
                  const parcel = {
                      "weight": weightPerUnit,
                      "insuranceAmount": 0,
                      "insuranceValue": 0,
                      "nonMachinable": false,
                      "returnReceipt": false
                  };
      
                  const labelData = await createLabel(senderCustomer, parcel);
                  if (labelData) {
                      createLabelData.push(labelData);
                      parcelNumbers = createLabelData.map(data => data.parcelNumber);
                      pdfBase64 = createLabelData.map(data => data.pdfData);
                  }
              }
          }
        }
        for(const sku of productSku) {
          totalOrder += sku.unit_price * sku.quantity;
        }
        const groupedItems = getGroupedItemsForRefund(warehouseOrder.order.shipments, filteredItems, quantitiesByRefs)
        priceByWeight = await calculateShippingCostForGroupedItems(groupedItems, warehouseOrder.order.shipments);
        totalRefund = totalOrder - priceByWeight;
      }
    totalOrder = totalOrder.toFixed(2);
    totalRefund = totalRefund.toFixed(2);
  }

    if (returnOption === "option1") {
        // let optionChoose = "option1"
        // //Create return Order in Shippingbo GMA
        // const returnOrderData = await createReturnOrder(accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId, optionChoose);
        // const returnOrderId = returnOrderData.return_order.id;
        // const shopifyId = returnOrderData.return_order.reason_ref;

      // Create attributes Shopify Order for future discount code
      const attributes = [
          {name: "customerId", value: customerId},
          {name: "totalOrderReturn", value: totalOrder}
        ];
        const updatedAttributes = {
          order: {
            id: orderId,
            note_attributes: attributes
          }
        }
      //update shopify order with attributes to have discount data for future discount code
       await updateOrder(updatedAttributes ,shopifyId);
      //send email to Magalie with parcel number and shopify Id and return order GMA Id
       await sendReturnDataToSAV(accessTokenMS365, senderCustomer, parcelNumbers, returnOrderId, totalOrder)
      //send email to customer with labels and parcel number
       await sendReturnDataToCustomer(accessTokenMS365, senderCustomer, pdfBase64, parcelNumbers, totalOrder, optionChoose);

       return res.status(200).json({
        success: true,
        option: "asset",
        getOrder: warehouseOrder,
        returnOrder: returnOrderData,
        label: createLabelData,
        totalReturn: totalOrder
      })
    // } else {
    //     console.log('return order already exists : contact SAV !');
    //     return res.status(200).json({
    //       success: false,
    //       message: 'Contacter le SAV - un return order existe déjà pour cette commande'
    //     })    
    // }  
    } else if( returnOption === "option2") {
      // let optionChoose = "option2"
      //   //Create return Order in Shippingbo GMA
      //   const returnOrderData = await createReturnOrder(accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId, optionChoose);
      //   const returnOrderId = returnOrderData.return_order.id;
      //   const shopifyId = returnOrderData.return_order.reason_ref;
        const attributes = [
          {name: "customerId", value: customerId},
          {name: "totalOrderReturn", value: totalRefund}
        ];
        const updatedAttributes = {
          order: {
            id: orderId,
            note_attributes: attributes
          }
        }
      //update shopify order with attributes to have refund data for mail refund Magalie
       await updateOrder(updatedAttributes ,shopifyId);
      //send email to Magalie with parcel number and shopify Id and return order GMA Id
       await sendRefundDataToSAV(accessTokenMS365, senderCustomer, parcelNumbers, returnOrderId, totalRefund);
      //send email to customer with labels and parcel number
      await sendReturnDataToCustomer(accessTokenMS365, senderCustomer, pdfBase64, parcelNumbers, totalRefund, optionChoose)


      return res.status(200).json({
        success: true,
        option: "refund",
        getOrder: warehouseOrder,
        returnOrder: returnOrderData,
        label: createLabelData,
        totalReturn: totalRefund
      })
    }
  //  } else {
  //   //TODO if return order already exists
  //   console.log('return Order already exists')
  //  }
})

module.exports = router;