// Create Label from CBox API
const fetch = require('node-fetch');
const { getProductWeightBySku } = require('./Shopify/products');
require('dotenv').config();
 
const colissimoApiKey = process.env.CBOX_API_KEY;
const colissimoContract = process.env.CBOX_CONTRACT;
const colissimoPassword = process.env.CBOX_PWD;
 
const createLabel = async (senderCustomer, parcel) => {
    const data = {
        "contractNumber": colissimoContract,
        "password": colissimoPassword,
        "outputFormat": {
            "x": 0,
            "y": 0,
            "returnType": "SendPDFLinkByMail",
            "outputPrintingType": "PDF_10x15_300dpi",
        },
        "letter": {
            "service": {
            "productCode": "DOM",
            "depositDate": new Date().toISOString(),
            "mailBoxPicking": false
            },
            "parcel": {
                "weight": parcel.weight
            },
            "sender": {
                "address": {
                    "companyName": senderCustomer.name,
                    "line2": senderCustomer.address,
                    "line3": senderCustomer.address2,
                    "city": senderCustomer.city,
                    "zipCode": senderCustomer.postalCode,
                    "countryCode": senderCustomer.country,
                    "email": senderCustomer.email,
                    "phoneNumber": senderCustomer.phone
                }
            },
            "addressee": {
                "address": {
                    "companyName": "GMA Potiron PARIS",
                    "line2": "501 Avenue de la couronne",
                    "line3": "GMA BAT 2",
                    "city": "EPONE",
                    "zipCode": "78680",
                    "countryCode": "FR",
                    "email": "c.leroux@potiron.com",
                    "phoneNumber": "06"
                }
            }
        }
    };
  
    const colissimoUrl = 'https://ws.colissimo.fr/sls-ws/SlsServiceWSRest/2.0/generateLabel';
    const colissimoOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apiKey': colissimoApiKey
        },
        body: JSON.stringify(data)
    };
 
    try {
        const response = await fetch(colissimoUrl, colissimoOptions);
        const buffer = await response.arrayBuffer(); 
        const textResponse = new TextDecoder().decode(buffer); 
        // console.log('text response', textResponse);
         if (textResponse.includes('%PDF')) {
            const pdfBase64 = Buffer.from(buffer).toString('base64');
            const parcelNumber = extractParcelNumber(textResponse);
            return {
                pdfData: `data:application/pdf;base64,${pdfBase64}`,
                parcelNumber: parcelNumber,
                origin_ref: senderCustomer.origin_ref
            }
        } else {
            console.log('no pdf colissimo ?')
        }
        return null; 
    } catch (error) {
        console.error('Erreur lors de la création de l\'étiquette depuis CBox', error);
    }
};

const extractParcelNumber = (textResponse) => {
    const regex = /"parcelNumber":"(\w+)"/; 
    const match = textResponse.match(regex);
    return match ? match[1]: null;
}

const getShippingPrice = async (weight) => {
    let priceByWeight;

    if (weight < 2) {
        priceByWeight = 6.9;
    } else if (weight >= 2 && weight < 10) {
        priceByWeight = 9;
    } else if (weight >= 10 && weight < 15) {
        priceByWeight = 29;
    } else {
        priceByWeight = 49;
    }

    return parseFloat(priceByWeight.toFixed(2));
};


const calculateTotalShippingCost = async (shipments, filteredItems) => {
    let totalShippingCost = 0;

    for (const shipment of shipments) {
        for (const orderItem of shipment.order_items_shipments) {
            const orderItemId = orderItem.order_item_id;
            const matchedItem = filteredItems.find(item => item.id === orderItemId);
            if (matchedItem) {
                const productRef = matchedItem.product_ref;
                const productWeight = await getProductWeightBySku(productRef);
                const shippingPrice = await getShippingPrice(productWeight.weight);
                // console.log(productRef, shippingPrice);
                totalShippingCost += parseFloat(shippingPrice);
            }
        }
    }

    return totalShippingCost.toFixed(2);
};

const getGroupedItemsForRefund = (shipments, filteredItems, returnQuantities) => {
    const groupedItems = {};
 
    for (const shipment of shipments) {
        const shipmentId = shipment.id;
 
        for (const orderItem of shipment.order_items_shipments) {
            const matchedItem = filteredItems.find(item => item.id === orderItem.order_item_id);
 
            if (matchedItem) {
                const remainingQuantity = returnQuantities[matchedItem.id] || 0;
                if (remainingQuantity > 0) {
                    if (!groupedItems[shipmentId]) {
                        groupedItems[shipmentId] = [];
                    }
 
                    const quantityToReturn = Math.min(orderItem.quantity, remainingQuantity);
                    groupedItems[shipmentId].push({
                        ...matchedItem,
                        returnQuantity: quantityToReturn
                    });
 
                    returnQuantities[matchedItem.id] -= quantityToReturn;
                }
            }
        }
    }
    // console.log("groupedItems", groupedItems);
    return groupedItems;
};

const calculateShippingCostForGroupedItems = async (itemsGrouped, shipments) => {
    let totalShippingCost = 0;
 
    for (const [shipmentId, items] of Object.entries(itemsGrouped)) {
        let shipmentWeight = 0;
 
        for (const item of items) {
            const productWeight = await getProductWeightBySku(item.product_ref);
            shipmentWeight += productWeight.weight * item.returnQuantity;
        }
 
        const shipmentDetails = shipments.find(shipment => shipment.id === parseInt(shipmentId, 10));
        if (shipmentDetails) {
            const shippingPrice = await getShippingPrice(shipmentWeight);
            totalShippingCost += shippingPrice;
        }
    }
 
    return totalShippingCost.toFixed(2);
};

function getGroupedItemsForLabels(shipments, filteredItems, returnQuantities) {
    const groupedItems = {};
 
    shipments.forEach(shipment => {
        const shipmentId = shipment.id;
 
        shipment.order_items_shipments.forEach(orderItem => {
            const itemId = orderItem.order_item_id;
            const matchedItem = filteredItems.find(item => item.id === itemId);
 
            if (matchedItem && returnQuantities[matchedItem.product_ref]) {
                if (!groupedItems[shipmentId]) groupedItems[shipmentId] = [];
 
                const quantityToReturn = Math.min(returnQuantities[matchedItem.product_ref], matchedItem.quantity);
 
                groupedItems[shipmentId].push({
                    ...matchedItem,
                    quantity: quantityToReturn
                });
 
                returnQuantities[matchedItem.product_ref] -= quantityToReturn;
            }
        });
    });
    console.log("groupedItems", groupedItems);
    return groupedItems;
}
 
module.exports = {
    createLabel,
    getShippingPrice,
    calculateTotalShippingCost,
    getGroupedItemsForRefund,
    calculateShippingCostForGroupedItems,
    getGroupedItemsForLabels
};