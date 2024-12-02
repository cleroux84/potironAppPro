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
    let remainingQuantityToReturn = 0; // Quantité totale à retourner (calculée depuis filteredItems)
    const itemsGroupedByShipment = [];
    // Récupérer la quantité totale à retourner
    filteredItems.forEach(item => {
        remainingQuantityToReturn += item.quantity;
    });
 
    // Parcourir les colis et ajouter les produits à retourner
    shipments.forEach(shipment => {
        if (remainingQuantityToReturn <= 0) return; // Si la quantité à retourner est déjà atteinte, on arrête
 
        const returnedItemsInThisShipment = [];
        let shipmentProductCount = 0; // Nombre de produits retournés dans ce colis
 
        // Filtrer les produits dans ce colis
        shipment.order_items_shipments.forEach(orderItem => {
            const matchedItem = filteredItems.find(filtered => filtered.id === orderItem.order_item_id);
 
            if (matchedItem && remainingQuantityToReturn > 0) {
                // Calculer la quantité de ce produit à retourner (min entre la quantité restante à retourner et la quantité dans ce colis)
                const quantityToReturn = Math.min(matchedItem.quantity, remainingQuantityToReturn);
 
                // Réduire la quantité restante à retourner
                remainingQuantityToReturn -= quantityToReturn;
 
                // Ajouter les produits retournés dans ce colis
                returnedItemsInThisShipment.push({
                    orderItemId: matchedItem.id,
                    quantity: quantityToReturn,
                    productRef: matchedItem.product_ref
                });
 
                shipmentProductCount += quantityToReturn;
            }
        });
 
        // Si des produits ont été ajoutés à ce colis, on le garde
        if (returnedItemsInThisShipment.length > 0) {
            itemsGroupedByShipment.push({
                shipmentId: shipment.id,
                returnedItems: returnedItemsInThisShipment,
                shipmentProductCount: shipmentProductCount
            });
        }
    });
 
    return itemsGroupedByShipment;
};
 
const calculateShippingCostForGroupedItems = async (itemsGroupedByShipment) => {
    let totalRefund = 0;
 
    for (const shipment of itemsGroupedByShipment) {
        const { shipmentId, returnedItems } = shipment;
 
        let totalWeight = 0;
 
        // Calculer le poids total des produits retournés dans ce colis
        for (const item of returnedItems) {
            const productWeight = await getProductWeightBySku(item.productRef);
            if (productWeight) {
                totalWeight += productWeight.weight * item.quantity; // Poids total des produits retournés dans ce colis
            }
        }
 
        // Si le poids total est supérieur à 0, calculer les frais
        if (totalWeight > 0) {
            const shippingCost = await getShippingPrice(totalWeight / 1000); // Convertir en kg
            totalRefund += shippingCost; // Ajouter au total des frais de retour
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