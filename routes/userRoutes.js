const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const query = 'SELECT id, username, role FROM users ORDER BY id ASC';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const userRole = role || 'user';
    const query = 'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role';
    const result = await pool.query(query, [username, password, userRole]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id/role
router.put('/:id/role', async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;
    const query = 'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role';
    const result = await pool.query(query, [role, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
