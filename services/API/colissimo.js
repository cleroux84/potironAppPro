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
                console.log(productRef, shippingPrice);
                totalShippingCost += parseFloat(shippingPrice);
            }
        }
    }

    return totalShippingCost.toFixed(2);
};

const groupReturnedItemsByShipment = (shipments, filteredItems) => {
    const itemsGroupedByShipment = {};
 
    shipments.forEach(shipment => {
        const shipmentId = shipment.id;
 
        // Initialisation de l'objet pour contenir les articles retournés pour ce colis
        const returnedItemsInShipment = [];
 
        shipment.order_items_shipments.forEach(orderItem => {
            const matchedItem = filteredItems.find(filtered => filtered.id === orderItem.order_item_id);
 
            if (matchedItem) {
                // On vérifie combien de ce produit sont dans le colis et combien le client souhaite retourner
                const quantityToReturn = Math.min(matchedItem.quantity, orderItem.quantity);
                // Ajouter à l'array avec la quantité retournée
                returnedItemsInShipment.push({
                    orderItemId: matchedItem.id,
                    quantity: quantityToReturn, // La quantité retournée pour ce produit dans ce colis
                    productRef: matchedItem.product_ref
                });
            }
        });
 
        if (returnedItemsInShipment.length > 0) {
            itemsGroupedByShipment[shipmentId] = returnedItemsInShipment;
        }
    });
 
    return itemsGroupedByShipment;
};
 
const calculateShippingCostForGroupedItems = async (itemsGroupedByShipment, shipments) => {
    let totalRefund = 0;
 
    for (const [shipmentId, returnedItems] of Object.entries(itemsGroupedByShipment)) {
        const shipment = shipments.find(s => s.id === parseInt(shipmentId));
        let totalWeight = 0;
 
        // Calcul du poids total des articles retournés dans ce colis
        for (const item of returnedItems) {
            const productWeight = await getProductWeightBySku(item.productRef);
            if (productWeight) {
                // Ajouter le poids du produit retourné dans ce colis en tenant compte de la quantité
                totalWeight += productWeight.weight * item.quantity;
            }
        }
 
        // Calculer le coût de retour basé sur le poids total du colis
        if (totalWeight > 0) {
            const shippingCost = await getShippingPrice(totalWeight / 1000); // Convertir en kg
            console.log(`Colis ${shipmentId}: Poids total = ${totalWeight}g, Frais de retour = ${shippingCost}€`);
            totalRefund += shippingCost;
        }
    }
 
    return totalRefund;
};
 
module.exports = {
    createLabel,
    getShippingPrice,
    calculateTotalShippingCost,
    calculateShippingCostForGroupedItems,
    groupReturnedItemsByShipment
};