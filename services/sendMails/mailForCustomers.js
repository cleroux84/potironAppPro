// Mail for customers

const fs = require('fs');
const { Client } = require('@microsoft/microsoft-graph-client');
const { signatureAttachement, initiMicrosoftGraphClient } = require('./mailForTeam');
const { getDiscountMailData, removeScheduledMail } = require('../database/scheduled_emails');
const { getAccessTokenMS365, refreshMS365AccessToken } = require('../API/microsoft');
const { checkDiscountCodeUsage } = require('../API/Shopify/priceRules');
const path = require('path');
require('dotenv').config();
require ('isomorphic-fetch');
const MAILDEV = process.env.MAILDEV;

//Send email to b2b customer when kBis validate
async function sendWelcomeMailPro(accessTokenMS365, firstnameCustomer, nameCustomer, mailCustomer, companyName, deliveryPref, paletteEquipment, paletteAppointment, paletteNotes) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let paletteNotesValue;
    let nameNoStar = nameCustomer.replace(/⭐/g, '').trim();
    if(paletteNotes !== undefined && paletteNotes !== "undefined") {
      paletteNotesValue = `<p style="margin: 0;">Notes complémentaires concernant la livraison : ${paletteNotes}</p>`;
    } else {
      paletteNotesValue = '';
    }
    let deliveryTextIfPalette = '';
      if(deliveryPref.includes("palette")) {
        deliveryTextIfPalette = `<p style="margin: 0;"> Equipement nécessaire : ${paletteEquipment}</p>
        <p style="margin: 0;">Nécessité de prendre RDV pour la livraison : ${paletteAppointment}</p>
        ${paletteNotesValue}
        `
      }
    const message = {
      subject: 'Validation de votre espace pro - Pro Potiron Paris', 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour ${firstnameCustomer} ${nameNoStar},</p>
          <p style="margin: 0;">Nous vous souhaitons la bienvenue chez Potiron Paris - Espace Pro !</p>
          <p style="margin: 0;">Une fois connecté avec votre login et votre mot de passe, vous aurez accès à l'ensemble de nos produits aux tarifs pour professionnels.</p>
          <p><a href="https://potiron.com">Visitez notre boutique</a></p>
          <p style="text-decoration: underline;">Rappel de vos préférences de livraison : </p>
          <p style="margin: 0;">Possibilité(s) de livraison : ${deliveryPref}</p>
          ${deliveryTextIfPalette}
          <p>Vous pouvez modifier ces informations directement sur votre compte client.</p>
          <p style="margin: 0;">Nous restons à votre entière disposition.</p>
          <p style="margin: 0;">Très belle journée,</p>
          <p>L'équipe de Potiron Paris</p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: mailCustomer
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log('Email to welcome pro customer send successfully');
    } catch (error) {
      console.error('Error send welcome pro mail', error);
    }  
  }

//Send email to customer with label colissmo attached
async function sendReturnDataToCustomer(accessTokenMS365, senderCustomer, pdfBase64Array, parcelNumbers, totalOrder, optionChoose) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let labelsText;
    if(parcelNumbers.length === 1) {
      labelsText = `l'étiquette de retour ci-jointe, il suffit de l'imprimer pour votre `;
    } else {
      labelsText = `les étiquettes de retour ci-jointes, il suffit de les imprimer pour vos `;
    }
    let optionText;
    if(optionChoose === 'option1') {
      optionText = `<p>A réception de votre colis, vous recevrez par mail, le code de réduction/avoir d'une valeur de ${totalOrder}€ valable 3 mois.</p>`
    } else if(optionChoose === 'option2') {
      optionText = `<p>A réception de votre colis, vous recevrez le remboursement de votre commande d'une valeur de ${totalOrder}€.</p>`
    }
    const pdfAttachments = pdfBase64Array.map((pdfBase64, index) => ({  
      '@odata.type': '#microsoft.graph.fileAttachment',   
      name: `etiquette_retour_colissimo_${index + 1}.pdf`,
      contentType: 'application/pdf',
      contentBytes: pdfBase64.replace(/^data:application\/pdf;base64,/, '')
    }))
    const message = {
        subject: 'Votre demande de retour Potiron Paris', 
        body: {
            contentType: 'HTML',
            content: `
              <p>Bonjour ${senderCustomer.name},</p>
              <p>Votre demande de retour a bien été prise en compte.</p>
              <p>Vous trouverez ${labelsText} colis.</p>
              <p>TEXTE A VOIR</p>
              ${optionText}
              <p>Très belle journée,</p>
              <p>L'équipe de Potiron Paris</p>
              <img src='cid:signature'/>
            `
        },
        toRecipients: [
            {
                emailAddress: {
                    address: "c.leroux@potiron.com"
                }
            }
        ],
        bccRecipients: [
            {
                emailAddress: {
                    address: MAILDEV
                }
            }
        ],
        attachments: [
            ...pdfAttachments,
            signatureAttachement
        ]
    };
 
    try {
        await client.api('/me/sendMail').post({ message });
        console.log("Email for customer return order successfully sent");
    } catch (error) {
        console.error('Error sending return order message', error);
    }
}

//send mail to customer with discount code after reception of return order + so retrieve customer + trigger sendEmailDiscountReminder with param
async function sendDiscountCodeAfterReturn(accessTokenMS365, customerData, orderName, discountCode, totalOrder, codeEndDate) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let nameNoStar = customerData.last_name.replace(/⭐/g, '').trim();
    let positiveAmount = parseFloat(Math.abs(totalOrder).toFixed(2));
    const message = {
      subject: `Remboursement sur Commande ${orderName}`, 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour ${customerData.first_name} ${nameNoStar}, </p>
          <p style="margin: 0;">Suite à la réception de votre colis retour concernant la commande ${orderName}</p>
          <p style="margin: 0;">Code de réduction: ${discountCode}, d'une valeur de ${positiveAmount}€ valable jusqu'au ${codeEndDate}.</p>
          <p>Très belle journée,</p>
          <p>L'équipe de Potiron Paris</p>
          <img src='cid:signature'/>
        `
      },
      //TODO : mail client : customerData.email
      toRecipients: [
        {
          emailAddress: {
            address: "c.leroux@potiron.com"
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email discountCode automated return sucessfully sent");
    } catch (error) {
      console.error('error sending discountcode message', error);
    }
  }

  //send mail alert if discount code already exists
  //send mail to customer with discount code after reception of return order + so retrieve customer + trigger sendEmailDiscountReminder with param
async function sendAlertMail(accessTokenMS365, customerData, orderName, returnId) {
  const client = initiMicrosoftGraphClient(accessTokenMS365);
  let nameNoStar = customerData.last_name.replace(/⭐/g, '').trim();
  const message = {
    subject: `ALERTE discount code pour retour sur commande ${orderName}`, 
    body: {
      contentType: 'HTML',
      content: `
        <p>Bonjour, </p>
        <p style="margin: 0;">${customerData.first_name} ${nameNoStar} a demandé un remboursement par code de réduction sur sa commande ${orderName}</p>
        <p style="margin: 0;">La commande retour dans shippingbo est ${returnId}.</p>
        <p style="margin: 0;">Il semble y a avoir une erreur : un code de réduction existe déjà pour cette commande !</p>
        <p>Très belle journée,</p>
        <p>L'équipe de Potiron Paris</p>
        <img src='cid:signature'/>
      `
    },
    //TODO : mail client : mailRecipent ?
    toRecipients: [
      {
        emailAddress: {
          address: "c.leroux@potiron.com"
        }
      }
    ],
    bccRecipients: [
      {
          emailAddress: {
              address: MAILDEV
          }
      }
    ],
    attachments: [
      signatureAttachement
    ]
  };
  try {
    await client.api('/me/sendMail').post({ message });
    console.log("Email discountCode automated return sucessfully sent");
  } catch (error) {
    console.error('error sending discountcode message', error);
  }
}
  
  //check if a discount code let 15 days and send reminder mail
  const checkScheduledEmails = async () => {
    const scheduledEmails = await getDiscountMailData();
  
    if(scheduledEmails.length === 0) {
      console.log("Aucun mail programmé pour aujourd'hui");
      return;
    }
  
    for (const emailData of scheduledEmails) {
      const { customer_email, order_name, discount_code, total_order, code_end_date, discount_code_id, price_rule_id } = emailData;
      const isUsedCode = await checkDiscountCodeUsage(emailData.price_rule_id, emailData.discount_code_id);
      if(!isUsedCode) {
        console.log('send email to remind discount code and delete line in db');
        await sendEmailDiscountReminder(emailData.discount_code, emailData.total_order, emailData.code_end_date, emailData.customer_email, emailData.order_name);
      } else {
        console.log('delete discount code already used');
      }
      await removeScheduledMail(emailData.id);
    }
  }
  //Send mail to customer 15days berfore expiration date example to test : exemple
const sendEmailDiscountReminder = async (discounCode, totalAmount, codeEndDate, customerMail, orderName) => {
  let formattedDate = new Date(codeEndDate).toLocaleDateString('fr-FR', {
    day: 'numeric',     month: 'long',     year: 'numeric' 
  });
  let positiveAmount = parseFloat(Math.abs(totalAmount).toFixed(2));

  let accessTokenMS365 = await getAccessTokenMS365();
    if(!accessTokenMS365) {
      await refreshMS365AccessToken();
      accessTokenMS365 = await getAccessTokenMS365();
    }
    console.log("codeenddate from db", codeEndDate);
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    const message = {
      subject: `Rappel Code de réduction`, 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Suite à la réception de votre colis retour concernant la commande ${orderName}</p>
          <p style="margin: 0;">Il ne vous reste plus que 15 jours pour utiliser votre code de réduction: ${discounCode}, d'une valeur de ${positiveAmount}€ valable jusqu'au ${formattedDate}.</p>
          <p>Très belle journée,</p>
          <p>L'équipe de Potiron Paris</p>
          <img src='cid:signature'/>
        `
      },
      //TODO : mail client : customerMail
      toRecipients: [
        {
          emailAddress: {
            address: "c.leroux@potiron.com"
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email Remind discountCode automated return sucessfully sent");
    } catch (error) {
      console.error('error sending discountcode message', error);
    }
  }

  async function sendReceiptAndWaitForRefund(accessTokenMS365, customerData, orderName, totalOrder) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let nameNoStar = customerData.last_name.replace(/⭐/g, '').trim();
    let totalOrderFixed = totalOrder.toFixed(2);
    const message = {
        subject: 'Accusé de réception de votre commande retour', 
        body: {
            contentType: 'HTML',
            content: `
              <p>Bonjour ${customerData.first_name} ${nameNoStar},</p>
              <p>Votre colis retour concernant la commande ${orderName}, vient d'être réceptionné.</p>
              <p>Vous recevrez votre remboursement d'un montant de ${totalOrderFixed}€ sous 5 jours ouvrés. </p>
              <p>TEXTE A VOIR</p>
              <p>Très belle journée,</p>
              <p>L'équipe de Potiron Paris</p>
              <img src='cid:signature'/>
            `
        },
        toRecipients: [
            {
                emailAddress: {
                    address: "c.leroux@potiron.com"
                }
            }
        ],
        bccRecipients: [
            {
                emailAddress: {
                    address: MAILDEV
                }
            }
        ],
        attachments: [
            signatureAttachement
        ]
    };
 
    try {
        await client.api('/me/sendMail').post({ message });
        console.log("Email for customer return order successfully sent");
    } catch (error) {
        console.error('Error sending return order message', error);
    }
}

async function sendAknowledgmentReturnPix(accessTokenMS365, customerData, productData) {
  const client = initiMicrosoftGraphClient(accessTokenMS365);
  let customerName = customerData.fullName;
  let orderName = customerData.orderName;
  let customerMail = customerData.customerMail;
  let emailContent = `
<p>Bonjour ${customerName},</p>
<p style="margin: 0;">Nous accusons réception de votre demande de retour concernant la commande ${orderName}.</p>
<p style="margin: 0;">Rappel des produits ci-dessous et photos en pièces jointes : </p>
<ul>
  `;
  const attachments = [];
  productData.forEach((product) => {
      const productName = product.productId; 
      const productPrice = product.productPrice; 
      const justification = product.justification || "Pas d'explication complémentaire fournie."; 
      const productTitle = product.productTitle;
      const productReason = product.productReason;
      const productQuantity = product.productQuantity;

      emailContent += `
              <li><b>${productName} - ${productTitle}</b><br/>
              Quantité: ${productQuantity} - Prix: ${productPrice}€<br/>
              Raison choisie: ${productReason}<br/>
              Explication complémentaire : ${justification}<br/>
      `;
      product.photos.forEach((photoPath, index) => {
          const photoName = path.basename(photoPath);
          const photoData = fs.readFileSync(photoPath); 

          attachments.push({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: `photo_${productName}_${index + 1}.jpg`,  
              contentBytes: photoData.toString('base64'), 
              contentType: 'image/jpeg'
          });

          // emailContent += `<img src='cid:${photoName}' /> <br/>`; 
      });

      emailContent += `</li>`;
  });

  emailContent += `</ul>
                  <p>Vous aurez un retour dans un délai de 3 jours ouvrés.</p>
                  <p>Très belle journée,</p>
                  <p>L'équipe de Potiron Paris</p>
                  <img src='cid:signature'/>`;

  const message = {
      subject: 'Accusé de réception de votre demande de retour',
      body: {
          contentType: 'HTML',
          content: emailContent
      },
      toRecipients: [
          {
            //TODO mail du customer : customerMail
              emailAddress: {
                  address: MAILDEV
              }
          }
      ],
      bccRecipients: [
          {
              emailAddress: {
                  address: MAILDEV
              }
          }
      ],
      attachments: [...attachments, signatureAttachement] 
  };

  try {
      await client.api('/me/sendMail').post({ message: message });
      console.log("Email envoyé avec succès");
  } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email AR pix:', error);
  }
}

  module.exports = {
    sendWelcomeMailPro,
    sendReturnDataToCustomer,
    sendDiscountCodeAfterReturn,
    checkScheduledEmails,
    sendReceiptAndWaitForRefund,
    sendAlertMail,
    sendAknowledgmentReturnPix
  }