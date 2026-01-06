const SHOPIFYREASSORTTOKEN = process.env.SHOPIFYREASSORTTOKEN;
const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');
const fs = require('fs');
// const Handlebars = require('handlebars');
const path = require('path');
const { sendInvoiceReassort } = require('../../sendMails/mailForCustomers');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../microsoft');

// new customer webhook to create meta data from notes
const createMetaCustomer = async(clientToUpdate, updatedCustomer) => {
    const updateCustomerUrl = `https://gma-reassort.myshopify.com/admin/api/2024-07/customers/${clientToUpdate}.json`
    const updateOptions = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYREASSORTTOKEN
          },
          body: JSON.stringify(updatedCustomer)
    };
    try {
        const response = await fetch(updateCustomerUrl, updateOptions);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur lors de la création des meta données sur GMA Reassort', error);
    }
};

const getCustomerMeta = async(customerId) => {
    const metaUrl = `https://gma-reassort.myshopify.com/admin/api/2025-01/customers/${customerId}/metafields.json`
    const metaOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYREASSORTTOKEN
        }
    }
    try {
        const response = await fetch(metaUrl, metaOptions);
        if (!response.ok) {
            console.log(`Error while getting meta data by customer id: ${response.statusText}`);
            return {};
        }
        const data = await response.json();
        const metafields = data.metafields;
        if (!Array.isArray(metafields)) {
            console.error("Unexpected data format:", data);
            return {};
        }
        const find = (key) => 
            metafields.find(m => m.namespace === 'custom' && m.key === key)?.value || null
        return {
            company: find('company'),
            siret: find('siret'),
            tva: find('tva')
        }
    } catch (error) {
      console.error('Error to retrieve meta data by customer id', error);
      return {};
    }
};


const extractOrderData = async (order) => {
    const metaData = await getCustomerMeta(order.customer.id)
    // console.log('trié meta', metaData);
    const invoiceData = {
    // TODO construction of invoice number? should be unique
    invoiceNumber: `FA-${order.name}`,
    invoiceDate: new Date(order.processed_at).toLocaleDateString('fr-FR'),

    customer: {
        name: `${order.billing_address.first_name} ${order.billing_address.last_name}`,
        company: order.billing_address.company ? order.billing_address.company : metaData.company,
        address1: order.billing_address.address1,
        address2: order.billing_address.address2,
        zipCity: `${order.billing_address.zip} ${order.billing_address.city}`,
        email: order.email,
        siret: metaData.siret,
        tva: metaData.tva
    },
    totals: {
        subtotal: order.subtotal_price,
        shipping: order.total_shipping_price_set.shop_money.amount,
        tax: order.total_tax,
        total: order.total_price
    },
    items: order.line_items.map(item => ({
        name: item.title,
        quantity: item.quantity,
        price: item.price,
        total: (item.quantity * parseFloat(item.price))
    }))
    }
    return invoiceData;
};


const generateInvoicePdf = async (invoiceData) => {
    const outputPath = path.join(
        __dirname,
        `../../../invoicesreassort/Invoice-${invoiceData.invoiceNumber}.pdf`
    );

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // ===========================
        // HEADER : GMA Reassort + facture/date
        // ===========================
        doc.fontSize(20).text('GMA Reassort', 50, 50);

        doc.fontSize(12)
           .text(`Facture : ${invoiceData.invoiceNumber}`, 400, 50, { align: 'right' })
           .text(`Date : ${invoiceData.invoiceDate}`, 400, 70, { align: 'right' });

        // ===========================
        // ADRESSES + SIRET / TVA
        // ===========================
        const gmaAddress = `GMA Reassort\n123 Rue Exemple\n75000 Paris\nSIRET : 123 456 789 00012\nTVA intracom : FRXX123456789`;
        doc.fontSize(10).text(gmaAddress, 50, 120);

        // Client
        const customerAddress = `${invoiceData.customer.name}\n`;
        const company = invoiceData.customer.company ? invoiceData.customer.company + '\n' : '';
        const address2 = `${invoiceData.customer.address1}\n${invoiceData.customer.zipCity}\n`;
        const customerSiret = invoiceData.customer.siret ? `SIRET : ${invoiceData.customer.siret}\n` : '';
        const customerTva = invoiceData.customer.tva ? `TVA intracom : ${invoiceData.customer.tva}\n` : '';
        const email = `Email : ${invoiceData.customer.email}`;

        doc.fontSize(10).text(company + customerAddress + address2 + customerSiret + customerTva + email, 400, 120, { align: 'right' });

        doc.moveDown(4);

        // ===========================
        // TABLE HEADER
        // ===========================
        const tableTop = 220;
        const itemX = 50;
        const qtyX = 350;
        const priceX = 400;
        const totalX = 470;

        doc.fontSize(10).text('Produit', itemX, tableTop);
        doc.text('Qté', qtyX, tableTop);
        doc.text('Prix', priceX, tableTop);
        doc.text('Total', totalX, tableTop);

        // Ligne séparatrice
        doc.moveTo(50, tableTop + 15)
           .lineTo(550, tableTop + 15)
           .stroke();

        // ===========================
        // TABLE ROWS
        // ===========================
        let y = tableTop + 25;
        invoiceData.items.forEach(item => {
            doc.text(item.name, itemX, y);
            doc.text(item.quantity, qtyX, y);
            doc.text(`${item.price} €`, priceX, y);
            doc.text(`${item.total.toFixed(2)} €`, totalX, y);
            y += 20;
        });

        // Ligne avant les totaux
        doc.moveTo(50, y + 5)
           .lineTo(550, y + 5)
           .stroke();

        // ===========================
        // TOTALS encadrés
        // ===========================
        const totalsX = 400;
        y += 15;
        // const totalsHeight = 60;
        // doc.rect(totalsX - 10, y - 5, 150, totalsHeight).stroke();

        doc.fontSize(10)
           .text(`Sous-total : ${invoiceData.totals.subtotal} €`, totalsX, y, { align: 'right' });
        doc.text(`Livraison : ${invoiceData.totals.shipping} €`, totalsX, y + 15, { align: 'right' });
        doc.text(`TVA : ${invoiceData.totals.tax} €`, totalsX, y + 30, { align: 'right' });
        doc.fontSize(12).text(`TOTAL : ${invoiceData.totals.total} €`, totalsX, y + 45, { align: 'right', bold: true });

        // ===========================
        // MENTIONS LEGALES / PIED
        // ===========================
        doc.fontSize(8)
           .text('Merci pour votre confiance.\nTVA non applicable, article 293 B du CGI si micro-entreprise.\nConservez ce document pour votre comptabilité.', 50, 750, { align: 'left' });

        // Fin du document
        doc.end();

        stream.on('finish', () => {
            console.log(`📄 Facture PDF générée: ${outputPath}`);
            resolve(outputPath);
        });

        stream.on('error', reject);
    });
};

const tagOrderInvoiceSent =  async (tagsToAdd, orderId) => {
    const body = {
        order: {
            id: orderId,
            tags : tagsToAdd
        }
    }
    const updateUrl = `https://gma-reassort.myshopify.com/admin/api/2025-01/orders/${orderId}.json`;
    const updateOptions = {
      method: 'PUT',
      headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
      },
      body: JSON.stringify(body)
    };
    try {
      const response = await fetch(updateUrl, updateOptions);
      const data = await response.json();
      console.log('Order updated with tags invoice sent', data)
    } catch (error) {
      console.error('error updating order with tags for invoice sent', orderId);
    }
  }

const generateInvoice = async(orderData) => {
    const invoiceData = await extractOrderData(orderData);
    const invoicePdfPath = await generateInvoicePdf(invoiceData);
    let accessTokenMS365 = await getAccessTokenMS365();
            if(!accessTokenMS365) {
              await refreshMS365AccessToken();
              accessTokenMS365 = await getAccessTokenMS365();
            }
    try {
        await sendInvoiceReassort(accessTokenMS365, orderData.email, invoicePdfPath);
        await fs.remove(invoicePdfPath);
        console.log('facture rm')
        // add tag on order
        const existingTags = orderData.tags || "";
        const tagsToAdd = addTagToOrder(existingTags, `facture-${invoiceData.invoiceNumber}`)
        await tagOrderInvoiceSent(tagsToAdd, orderData.id);
    } catch (error) {
        console.error('Error generating invoice', error)
    }
}

const addTagToOrder = (existingTags, newTag) => {
  const tagsArray = existingTags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  if (!tagsArray.includes(newTag)) {
    tagsArray.push(newTag);
  }

  return tagsArray.join(', ');
};


module.exports = {
    createMetaCustomer,
    generateInvoice
}