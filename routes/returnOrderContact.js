const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { getReturnContactData } = require('../services/database/return_contact');
const { getOrderByShopifyId } = require('../services/API/Shopify/orders');
const { getProductWeightBySku } = require('../services/API/Shopify/products');
const { sendReturnRequestPictures } = require('../services/sendMails/mailForTeam');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../services/API/microsoft');
const { sendAknowledgmentReturnPix } = require('../services/sendMails/mailForCustomers');
const router = express.Router();


const uploadMultiple = multer({
    storage: multer.diskStorage({
        destination: function(req, file, cb) {
            cb(null, 'uploads/');
        },
        filename: function(req, file, cb) {
            cb(null, `${Date.now()}-${file.originalname}`);
        }
    })
});

router.post('/upload-photos', uploadMultiple.array('photos', 5), async (req, res) => {
    try {
        const productInfo = JSON.parse(req.body.productInfo);
        const customerData = JSON.parse(req.body.customerData);
        const uploadedFiles = req.files;

        const productData = productInfo.map(product => {
            return {
                productId: product.productId,
                productTitle: product.title,
                productQuantity: product.quantity,
                productPrice: product.price,
                productReason: product.reason,
                justification: product.justification,
                photos: uploadedFiles
                .filter(file => file.originalname.startsWith(product.productId))
                .map(file => file.path),
            };
        });
        let accessTokenMS365 = await getAccessTokenMS365();
        if(!accessTokenMS365) {
          await refreshMS365AccessToken();
          accessTokenMS365 = await getAccessTokenMS365();
        }
        await sendReturnRequestPictures(accessTokenMS365, customerData, productData);
        await sendAknowledgmentReturnPix(accessTokenMS365, customerData, productData);

        uploadedFiles.forEach(file => {
            fs.unlink(file.path, error => {
                if(error) console.error(`Error deleting files ${file.path}`, error);
            });
        });
        res.status(200).send('Données photos et details produits à retourner envoyés avec succès')
    } catch (error) {
        console.error('Error data pictures', error);
        res.status(500).send('Error data pictures'); 
    }
})

router.get('/returnForm:id', async (req, res) => { 
    const { id } = req.params;
    const returnDataFromDb = await getReturnContactData(id);
    const shopifyOrder = await getOrderByShopifyId(returnDataFromDb.shopify_id);

    const dataCustomer = {
        orderName : shopifyOrder.order.name,
        customerMail : shopifyOrder.order.email,
        orderCreatedAt: shopifyOrder.order.created_at,
        fullName: shopifyOrder.order.customer.first_name + ' ' + shopifyOrder.order.customer.last_name 
    }

    const items = returnDataFromDb.items_to_return;
    const enrichItemsWithData = async (items) => {
        const enrichedItems = [];
        for(const item of items) {
            const productDetails = await getProductWeightBySku(item.product_user_ref);
            if(productDetails) {
                enrichedItems.push({
                    ...item,
                    title: productDetails.product.title,
                    imageUrl: productDetails.product.featuredImage.originalSrc
                });
            } else {
                console.error('Details du produit non trouvé')
            }
        }
        return enrichedItems;
    }
    const itemsToReturn = await enrichItemsWithData(items);


    // console.log('dataCustomer', dataCustomer);
    res.json({ dataCustomer, itemsToReturn })
})

module.exports = router;