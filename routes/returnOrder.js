//Routes concerning automated return order 

const express = require('express');
const { getOrderByShopifyId, updateOrder, orderByMail } = require('../services/API/Shopify/orders');
const { checkIfPriceRuleExists, createPriceRule, isReturnableDate } = require('../services/API/Shopify/priceRules');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../services/API/microsoft');
const { sendDiscountCodeAfterReturn, sendReturnDataToCustomer } = require('../services/sendMails/mailForCustomers');
const { saveDiscountMailData } = require('../services/database/scheduled_emails');
const { getAccessTokenFromDb } = require('../services/database/tokens/potiron_shippingbo');
const { getAccessTokenWarehouseFromDb } = require('../services/database/tokens/gma_shippingbo');
const { orderById } = require('../services/API/Shopify/customers');
const { getShippingboOrderDetails } = require('../services/API/Shippingbo/Potiron/ordersCRUD');
const { getWarehouseOrderDetails, getshippingDetails } = require('../services/API/Shippingbo/Gma/ordersCRUD');
const { createLabel, getShippingPrice, calculateTotalShippingCost } = require('../services/API/colissimo');
const { getProductWeightBySku } = require('../services/API/Shopify/products');
const { checkIfReturnOrderExist, createReturnOrder } = require('../services/API/Shippingbo/Gma/returnOrdersCRUD');
const { sendReturnDataToSAV } = require('../services/sendMails/mailForTeam');
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

//Get initial Order customer want return
router.get('/getOrderById', async (req, res) => {
  let accessToken = await getAccessTokenFromDb();
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  const orderName = req.query.getOrder_name;
  const orderMail = req.query.getOrder_mail;
  const customerId = req.query.customer_id;
  try {
    // const orderData = await orderById(orderName, orderMail, 6406535905430); // pas colissimo #8021
    // const orderData = await orderById(orderName, orderMail, 8063057985864); //4 colissimo #8012
    // const orderData = await orderById(orderName, orderMail, 8074569285960); //2 colissimo #8058
    // const orderData = await orderById(orderName, orderMail, 8174393917768); //4 articles identiques colissimo #8294
    // const orderData = await orderById(orderName, orderMail, 8045312737608); //3 articles colissimo #7865
    // const orderData = await orderById(orderName, orderMail, 8076398264648); //3 articles colissimo #8102
      let orderData;
      if (customerId) {
        orderData = await orderById(orderName, orderMail, customerId); //moi livré : #6989
      } else {
        orderData = await orderByMail(orderName, orderMail);
      }
      const shopifyOrderId = orderData.id;
      const shippingboDataPotiron = await getShippingboOrderDetails(accessToken, shopifyOrderId); 
      const shippingboDataWarehouse = await getWarehouseOrderDetails(accessTokenWarehouse, shippingboDataPotiron.id);
      const originalOrder = await getOrderByShopifyId(shopifyOrderId);
      const closeOrderDelivery = shippingboDataWarehouse.closed_at;
   
      const isReturnable = await isReturnableDate(closeOrderDelivery);
      console.log("is returnable ?", isReturnable);
   
      const orderDetails = await getshippingDetails(accessTokenWarehouse, shippingboDataWarehouse.id);
      const shipmentDetails = orderDetails.order.shipments;
      const orderItems = orderDetails.order.order_items;
      const orderWarehouseId = orderDetails.order.id;
   
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
            imageUrl: productVariant?.product?.featuredImage?.url || null, 
          };
        }));
        return enrichedItems;
      };
         const enrichedOrderItems = await enrichOrderItems(orderItems);
   
      if (orderData.tags.includes('Commande PRO')) {
        return res.status(200).json({
          success: false,
          orderItems: enrichedOrderItems,
          orderName: orderName,
          orderDetails: orderDetails,
          message: 'Contacter le SAV'
        });
      }
   
      res.status(200).json({
        success: true,
        orderItems: enrichedOrderItems,
        orderId: orderWarehouseId,
        orderDetails: orderDetails,
        shopifyOrderId: shopifyOrderId,
        originalOrder: originalOrder
      });
   
    } catch (error) {
      res.status(500).send('Error retrieving order warehouse by id');
    }
  });

let quantitiesByRefs;

router.post('/checkIfsReturnPossible', async (req, res) => {  // Changement de 'get' à 'post'
  const { warehouseOrderId, return_items, quantities, reasons, filteredItems, returnAllOrder, productSkuCalc, orderName, createdOrder, originalDiscounts } = req.body;
  const itemsToReturn = return_items.split(','); 
  const quantitiesByRefs = JSON.parse(quantities);
  const reasonsByRefs = JSON.parse(reasons);  
 
  console.log('Ref & raisons', reasonsByRefs);
 
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
 
  try {
    const warehouseOrder = await getshippingDetails(accessTokenWarehouse, warehouseOrderId);
    const shipments = warehouseOrder.order.shipments;
    let allItemsHaveColissimo = true;

    let totalAsset = 0;
    let totalRefund = 0;
    let totalWeight = 0;
    let priceByWeight;
    if(returnAllOrder) {
      totalAsset = (warehouseOrder.order.total_price_cents / 100).toFixed(2);
      totalWeight = shipments.reduce((sum, shipment) => sum + (shipment.total_weight || 0), 0) / 1000;
      console.log("option 1 : ", totalAsset);

      if(shipments.length === 1) {
        priceByWeight = await getShippingPrice(totalWeight);
        totalRefund = totalAsset - priceByWeight;
      } else {
        priceByWeight = await calculateTotalShippingCost(shipments, filteredItems);
        console.log('il faut calculer le prix avec le poids de chaque produit', priceByWeight);
        totalRefund = totalAsset - priceByWeight;
      }
      console.log('option 2: ', totalRefund);
    } else {
      for(const sku of productSkuCalc) {
        console.log("productSku", productSkuCalc);
        const productFound = await getProductWeightBySku(sku.product_user_ref);
        if(productFound) {
          totalAsset += sku.unit_price * sku.quantity;
          console.log('option 1', totalAsset);
          totalWeight += productFound.weight * sku.quantity;
          priceByWeight = await getShippingPrice(totalWeight);
          totalRefund = totalAsset - priceByWeight;
          console.log('option 2: ', totalRefund);
        }
      }
    }
 
    itemsToReturn.forEach(ref => {
      const foundItem = shipments.find((shipment, index) => {
        const item = shipment.order_items_shipments.find(item => item.order_item_id.toString() === ref);
        if (item) {
          const shippingMethod = shipment.shipping_method_name;
          const reason = reasonsByRefs[ref];
          console.log(`Ref ${ref} - Raison : "${reason}"`);
 
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
        success: false,
        message: 'Contacter le SAV'
      });
    }
 
    res.json({
      success: true,
      message: 'Articles colissimo !',
      order: warehouseOrder,
      productRefs: return_items,
      filteredItems: filteredItems,
      totalAsset: totalAsset,
      totalRefund: totalRefund,
      totalWeight: totalWeight,
      orderName: orderName,
      createdOrder: createdOrder,
      originalDiscounts: originalDiscounts
    });
 
  } catch (error) {
    console.error('Erreur lors de la vérification des expéditions:', error);
    res.status(500).send('Erreur lors de la vérification des expéditions');
  }
});

router.post('/returnProduct', async (req, res) => {
  let accessTokenWarehouse = await getAccessTokenWarehouseFromDb();
  let customerId;
 
  const orderName = req.body.orderName;
  const productRefs = req.body.productRefs.split(',');
  const productSku = req.body.productSku;
  const optionChosen = req.body.returnOption;
  const orderId = req.body.orderId;
  const returnAll = req.body.returnAllOrder;
  const shopifyOrderId = req.body.shopifyOrderId;
  console.log('return all', returnAll);
  if(!customerId) {
    let initialiOrder = await getOrderByShopifyId(shopifyOrderId);
    customerId = initialiOrder.order.customer.id;
  } else {
    customerId = req.body.customerId;
  }
  if (optionChosen === "option1") {
    //Retrieve data from initial order
    const warehouseOrder = await getshippingDetails(accessTokenWarehouse, orderId);
    const senderCustomer = {
      'name': warehouseOrder.order.shipping_address.fullname,
      'address': warehouseOrder.order.shipping_address.street1,
      'address2': warehouseOrder.order.shipping_address.street2,
      'city': warehouseOrder.order.shipping_address.city,
      "postalCode": warehouseOrder.order.shipping_address.zip,
      "country": warehouseOrder.order.shipping_address.country,
      "email": warehouseOrder.order.shipping_address.email,
      "phone": warehouseOrder.order.shipping_address.phone1,
      "origin_ref": warehouseOrder.order.origin_ref
    };
    let weightToReturn = 0;
    let totalOrder = 0;
    let parcel;
    let createLabelData = [];
    let parcelNumbers = [];
    let pdfBase64 = [];
    const initialNumberOfPackages = warehouseOrder.order.shipments.length;
    console.log('nombre de colis dans la commande initiale: ', initialNumberOfPackages);
    const shipments = warehouseOrder.order.shipments;

    //Customer wants to return all initial order
    if(returnAll) {
      if(initialNumberOfPackages === 1) {
        weightToReturn = warehouseOrder.order.shipments
        .reduce((total, shipment) => total + (shipment.total_weight / 1000), 0);
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
    } else {
      if(productSku.length === 1) {
        if(productSku[0].quantity === 1) {
          const productFoundSku = await getProductWeightBySku(productSku[0].product_user_ref);
          weightToReturn += productFoundSku.weight * productSku[0].quantity;
          totalOrder += productSku[0].unit_price * productSku[0].quantity;
          console.log("return 1 product", weightToReturn);
          console.log('total return 1 product', totalOrder);
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
        }
      } else {
        console.log('si plusieurs produits et plusieurs colis')
      }
      //TODO
      //return weight by weight => problem about number of packages !  
    //   console.log('productPrice sku', productSku );
    //   console.log("shipments", shipments);
    //   for (const sku of productSku) {
    //     const productFoundSku = await getProductWeightBySku(sku.product_user_ref);
    //     if(productFoundSku) {
    //       weightToReturn += productFoundSku.weight * sku.quantity;
    //       totalOrder += sku.unit_price * sku.quantity;
    //     }
    // }
    //   parcel = {
    //   "weight": weightToReturn,
    //   "insuranceAmount": 0,
    //   "insuranceValue": 0,
    //   "nonMachinable": false,
    //   "returnReceipt": false
    // };
    totalOrder = totalOrder.toFixed(2);
  }
    //create object from initial order for label and weight and totalOrder if returnAll or not
    // const senderCustomer = {
    //   'name': warehouseOrder.order.shipping_address.fullname,
    //   'address': warehouseOrder.order.shipping_address.street1,
    //   'address2': warehouseOrder.order.shipping_address.street2,
    //   'city': warehouseOrder.order.shipping_address.city,
    //   "postalCode": warehouseOrder.order.shipping_address.zip,
    //   "country": warehouseOrder.order.shipping_address.country,
    //   "email": warehouseOrder.order.shipping_address.email,
    //   "phone": warehouseOrder.order.shipping_address.phone1,
    //   "origin_ref": warehouseOrder.order.origin_ref
    // };
    // const parcel = {
    //   "weight": weightToReturn,
    //   "insuranceAmount": 0,
    //   "insuranceValue": 0,
    //   "nonMachinable": false,
    //   "returnReceipt": false
    // };
    //Check if return order exists in shippingbo warehouse
    const returnOrderExists = await checkIfReturnOrderExist(accessTokenWarehouse, warehouseOrder.order.id);
    console.log('returnOrderExists ?', returnOrderExists);
    
    // Create discount code in shopify
    // if(!ruleExists) {
    //   if(!returnOrderExists){
        // priceRules = await createPriceRule(customerId, orderName, totalOrder);
        // const discountCode = priceRules.discountData.discount_code.code;
        // const discountAmount = priceRules.discountRule.price_rule.value;
        // const discountEnd = priceRules.discountRule.price_rule.ends_at;
        // const discountDate = new Date(discountEnd);
        // const formattedDate = discountDate.toLocaleDateString('fr-FR', {     day: 'numeric',     month: 'long',     year: 'numeric' });
        
    //     //create a return order in shippingbo warehouse
        // const returnOrderData = await createReturnOrder(accessTokenWarehouse, orderId, returnAll, productSku, shopifyOrderId);
        // const returnOrderId = returnOrderData.return_order.id;
        // const shopifyId = returnOrderData.return_order.reason_ref;
        // const attributes = [
        //   // {name: "warehouseId", value: warehouseOrder.order.id},
        //   {name: "customerId", value: customerId},
        //   {name: "totalOrderReturn", value: totalOrder}
        // ];
        // const updatedAttributes = {
        //   order: {
        //     id: orderId,
        //     note_attributes: attributes
        //   }
        // }
        // //update shopify order with attributes to have discount data for future creation
        // updateOrder(updatedAttributes ,shopifyId)

    //     // create a return label with colissimo API
        // const createLabelData = await createLabel(senderCustomer, parcel);
        // const parcelNumber = createLabelData.parcelNumber;

      let accessTokenMS365 = await getAccessTokenMS365();
      if(!accessTokenMS365) {
        await refreshMS365AccessToken();
        accessTokenMS365 = await getAccessTokenMS365();
      }
    //   //send email to Magalie with parcel number and shopify Id and return order Id
      // await sendReturnDataToSAV(accessTokenMS365, senderCustomer, parcelNumbers, returnOrderId, totalOrder)
    //   //send email to customer with link to dwld label and parcel number
      // await sendReturnDataToCustomer(accessTokenMS365, senderCustomer, pdfBase64, parcelNumbers, totalOrder);

        return res.status(200).json({
          // success: true,
          // data: priceRules,
          // getOrder: warehouseOrder,
          // returnOrder: returnOrderData,
          label: createLabelData
        })
    //   } else {
    //     console.log('return order already exists : contact SAV !');
    //     return res.status(200).json({
    //       success: false,
    //       message: 'Contacter le SAV - un return order existe déjà pour cette commande'
    //     }) 
    //   }
    // } else {
    //   console.log('price rule already exists : contact SAV !');
    //   return res.status(200).json({
    //     success: false,
    //     message: 'Contacter le SAV - un price rule existe déjà pour cette commande'
    //   })      
    // }
   
    //update the return order with parcel number (numéro de colis) from colissimo - WIP
    // const updateReturnOrderWithLabel = await updateReturnOrderWithLabel(accessTokenWarehouse, returnOrderId, parcelNumber)
   
  } else if( optionChosen === "option2") {

    console.log("generate label + remboursement ? + mail à  ??")
  }
  
})

module.exports = router;