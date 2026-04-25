const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// State mapping object to normalize incoming ipinfo state names
const stateMapping = {
  "andhra pradesh": "Andhra Pradesh",
  "arunachal pradesh": "Arunachal Pradesh",
  "assam": "Assam",
  "bihar": "Bihar",
  "chhattisgarh": "Chhattisgarh",
  "goa": "Goa",
  "gujarat": "Gujarat",
  "haryana": "Haryana",
  "himachal pradesh": "Himachal Pradesh",
  "jharkhand": "Jharkhand",
  "karnataka": "Karnataka",
  "kerala": "Kerala",
  "madhya pradesh": "Madhya Pradesh",
  "mp": "Madhya Pradesh",
  "maharashtra": "Maharashtra",
  "manipur": "Manipur",
  "meghalaya": "Meghalaya",
  "mizoram": "Mizoram",
  "nagaland": "Nagaland",
  "odisha": "Odisha",
  "punjab": "Punjab",
  "rajasthan": "Rajasthan",
  "sikkim": "Sikkim",
  "tamil nadu": "Tamil Nadu",
  "tn": "Tamil Nadu",
  "telangana": "Telangana",
  "tripura": "Tripura",
  "uttar pradesh": "Uttar Pradesh",
  "up": "Uttar Pradesh",
  "uttarakhand": "Uttarakhand",
  "west bengal": "West Bengal",
  "delhi": "Delhi"
};

// GET /api/crops/state/:state
router.get('/state/:state', async (req, res) => {
  try {
    const incomingState = req.params.state.toLowerCase().trim();
    // Use mapped name if available, otherwise use the lowercased incoming state
    const normalizedState = stateMapping[incomingState] ? stateMapping[incomingState].toLowerCase() : incomingState;
    
    // Case-insensitive query using LOWER() to match against ANY elements in the array
    const query = `
      SELECT id, name, quality, ideal_weather, states, water_required, soil_density, soil_type 
      FROM crops 
      WHERE LOWER($1) = ANY(SELECT LOWER(unnest(states)))
    `;
    
    const result = await pool.query(query, [normalizedState]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching crops by state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/crops/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = 'SELECT * FROM crops WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Crop not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching crop details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/crops (all crops)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM crops ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all crops:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/crops
router.post('/', async (req, res) => {
  try {
    const { name, quality, ideal_weather, states, water_required, soil_density, soil_type } = req.body;
    const query = `
      INSERT INTO crops (name, quality, ideal_weather, states, water_required, soil_density, soil_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [name, quality, ideal_weather, states, water_required, soil_density, soil_type];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding crop:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/crops/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM crops WHERE id = $1', [id]);
    res.json({ message: 'Crop deleted successfully' });
  } catch (error) {
    console.error('Error deleting crop:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
