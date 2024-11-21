//Requests for scheduled_emails table database
const client = require('../db.js');


//Record Data customer and discount code in DB to send scheduled mail
const saveDiscountMailData = async (email, orderName, discountCode, totalAmount, endDate, discountCodeId, PriceRuleId) => {
    const sendDate = new Date(endDate);
    sendDate.setDate(sendDate.getDate() - 15);

    const query = `
        INSERT INTO scheduled_emails (customer_email, order_name, discount_code, total_order, code_end_date, send_date, discount_code_id, price_rule_id )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `
    const values = [email, orderName, discountCode, totalAmount, endDate, sendDate, discountCodeId, PriceRuleId];

    try {
        const result = await client.query(query, values);
        console.log("Data pour email programmé enregistré en DB");
    } catch (error) {
        console.error('Error recording discount data in scheduled emails table', error);
    }
}

//Retrieve Data from DB in scheduled_emails table 
const getDiscountMailData = async () => {
    const today = new Date().toISOString().split('T')[0];
    const query = `
        SELECT * FROM scheduled_emails WHERE send_date::date = $1 
    `;
    const values = [today];
    try {
        const result = await client.query(query, values);
        return result.rows;
    } catch (error) {
        console.error("Error retrieving data from scheduled emails table", error);
        return [];  
    }
}

//Remove scheduled mail in db
const removeScheduledMail = async (lineId) => {
    const query = `DELETE FROM scheduled_emails WHERE id = $1`;
    const values = [lineId];
   
    try {
      const result = await client.query(query, values);
      console.log(`Ligne avec id ${lineId} supprimée`, result.rowCount);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Erreur lors de la suppression de la ligne :", error);
    }
  };

  module.exports = {
    saveDiscountMailData,
    getDiscountMailData,
    removeScheduledMail
  }