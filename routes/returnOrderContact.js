const express = require('express');
const router = express.Router();

router.get('/returnForm:id', async (req, res) => {
    const { id } = req.params;
    console.log('id to find in db', id);
})