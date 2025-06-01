const express = require('express');
const { Pool } = require('pg');  // PostgreSQL driver
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { DateTime } = require("luxon");
require('dotenv').config();

// Configuração do banco de dados PostgreSQL usando Railway DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Railway exige SSL
  }
});

pool.on('connect', () => {
  console.log('✅ Conectado ao banco de dados PostgreSQL');
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const wss = new WebSocket.Server({ server });

// Middlewares
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Rota raiz
app.get('/', (req, res) => {
  res.send('<h1>Servidor está funcionando!</h1><p>Acesse <a href="/dashboard">/dashboard</a> para visualizar o dashboard.</p>');
});

// Dashboard - último acesso
app.get('/dashboard', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT nome, uid, status, foto, TO_CHAR(data_hora, 'YYYY-MM-DD HH24:MI:SS') AS data_hora
      FROM acessos
      ORDER BY id DESC LIMIT 1
    `);
    res.render('dashboard', { dados: rows[0] || null });
  } catch (err) {
    console.error('❌ Erro na consulta SQL:', err);
    res.status(500).send('Erro ao acessar os dados do banco.');
  }
});

// API: últimos 50 registros sensores
app.get('/api/dados', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT temperatura, umidade, lux, TO_CHAR(data_hora, 'YYYY-MM-DD HH24:MI:SS') AS data_hora FROM (
        SELECT id, temperatura, umidade, lux, data_hora
        FROM sensores
        ORDER BY id DESC
        LIMIT 50
      ) sub
      ORDER BY id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('❌ Erro na consulta SQL:', err);
    res.status(500).json({ erro: 'Erro ao acessar os dados.' });
  }
});

// API para salvar dados sensores e emitir eventos socket.io e websocket
app.post('/salvar-sensor', async (req, res) => {
  try {
    const { temperatura, umidade, lux } = req.body;
    if (temperatura == null || umidade == null || lux == null) {
      return res.status(400).json({ erro: '❌ Dados incompletos' });
    }

    const data_hora = DateTime.now().setZone('America/Manaus').toFormat('yyyy-MM-dd HH:mm:ss');

    await pool.query(
      `INSERT INTO sensores (temperatura, umidade, lux, data_hora) VALUES ($1, $2, $3, $4)`,
      [temperatura, umidade, lux, data_hora]
    );

    const novoDado = { temperatura, umidade, lux, data_hora };

    io.emit('novo-dado', novoDado);

    const json = JSON.stringify(novoDado);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });

    console.log(`✅ Sensor registrado: T=${temperatura}, U=${umidade}, LUX=${lux}`);
    res.status(200).json({ mensagem: '✅ Dados salvos com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao salvar dados do sensor:', err);
    res.status(500).json({ erro: 'Erro ao salvar dados', detalhe: err.message });
  }
});

// Teste conexão banco
app.get('/teste-db', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT 1 + 1 AS resultado');
    res.json({ resultado: rows[0].resultado });
  } catch (err) {
    console.error('❌ Erro ao testar banco:', err);
    res.status(500).json({ erro: 'Erro ao testar banco', detalhe: err.message });
  }
});

// Último acesso via API
app.get('/ultimo-acesso', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT nome, uid, status, TO_CHAR(data_hora, 'YYYY-MM-DD HH24:MI:SS') AS data_hora, foto
      FROM acessos
      ORDER BY id DESC LIMIT 1
    `);
    res.json(rows[0] || { mensagem: 'Nenhum acesso encontrado' });
  } catch (err) {
    console.error('❌ Erro ao buscar o último acesso:', err);
    res.status(500).send('Erro no servidor');
  }
});

// Função para registrar novo acesso
async function registrarAcesso(nome, uid, status, foto) {
  try {
    nome = nome.trim();
    if (!nome || !uid || !status || !foto) return;

    const data_hora = DateTime.now().setZone('America/Manaus').toFormat('yyyy-MM-dd HH:mm:ss');

    await pool.query(
      `INSERT INTO acessos (nome, uid, status, foto, data_hora) VALUES ($1, $2, $3, $4, $5)`,
      [nome, uid, status, foto, data_hora]
    );

    console.log(`✅ Acesso registrado: ${nome}, UID: ${uid}, Status: ${status}, Data e Hora: ${data_hora}`);
  } catch (err) {
    console.error('❌ Erro ao registrar acesso no banco de dados:', err);
  }
}

// Inicializar servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));
