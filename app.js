const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const SERIAL_PORT = 'COM5'; // Ajuste para sua porta COM
const BAUD_RATE = 9600;     // Deve bater com Serial.begin()

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const wss = new WebSocket.Server({ server });

// Configuração do banco de dados
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'Teddyana21452668!',
  database: 'projeto_arduino'
};
const { DateTime } = require("luxon");


let db;
async function connectToDatabase() {
  try {
    db = await mysql.createPool(dbConfig);
    console.log('✅ Conectado ao banco de dados MySQL');
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco de dados:', err);
    setTimeout(connectToDatabase, 5000);
  }
}
connectToDatabase();

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Rota principal
app.get('/', (req, res) => {
  res.send('<h1>Servidor está funcionando!</h1><p>Acesse <a href="/dashboard">/dashboard</a> para visualizar o dashboard.</p>');
});

// Dashboard
app.get('/dashboard', async (req, res) => {
  try {
    if (!db) throw new Error('Conexão com o banco de dados não está disponível.');
    const [results] = await db.query(
      `SELECT nome, uid, status, foto, DATE_FORMAT(data_hora, '%Y-%m-%d %H:%i:%s') AS data_hora
       FROM acessos ORDER BY id DESC LIMIT 1`
    );
    res.render('dashboard', { dados: results[0] || null });
  } catch (err) {
    console.error('❌ Erro na consulta SQL:', err);
    res.status(500).send('Erro ao acessar os dados do banco.');
  }
});

// API de dados dos sensores
app.get('/api/dados', async (req, res) => {
    try {
      if (!db) throw new Error('Conexão com o banco de dados não está disponível.');
      const [results] = await db.query(`
        SELECT temperatura, umidade, lux, data_hora FROM (
          SELECT id, temperatura, umidade, lux, DATE_FORMAT(data_hora, "%Y-%m-%d %H:%i:%s") AS data_hora
          FROM sensores
          ORDER BY id DESC
          LIMIT 50
        ) sub
        ORDER BY id ASC;
      `);
      res.json(results);
    } catch (err) {
      console.error('❌ Erro na consulta SQL:', err);
      res.status(500).json({ erro: 'Erro ao acessar os dados.' });
    }
  });
  

// Salvar dados dos sensores (POST externo)
app.post('/salvar-sensor', async (req, res) => {
  try {
    const { temperatura, umidade, lux } = req.body;
    if (temperatura == null || umidade == null || lux == null) {
      return res.status(400).json({ erro: '❌ Dados incompletos' });
    }
    const data_hora = DateTime.now().setZone('America/Manaus').toFormat('yyyy-MM-dd HH:mm:ss');


    await db.query(
      `INSERT INTO sensores (temperatura, umidade, lux, data_hora)
       VALUES (?, ?, ?, ?)`,
      [temperatura, umidade, lux, data_hora]
    );
    console.log(`✅ Sensor registrado: T=${temperatura}, U=${umidade}, LUX=${lux}`);
    res.status(200).json({ mensagem: '✅ Dados salvos com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao salvar dados do sensor:', err);
    res.status(500).json({ erro: 'Erro ao salvar dados' });
  }
});

// Último acesso
app.get('/ultimo-acesso', async (req, res) => {
  try {
    if (!db) throw new Error('Conexão com o banco de dados não está disponível.');
    const [results] = await db.query(
      `SELECT nome, uid, status, data_hora, foto
       FROM acessos ORDER BY id DESC LIMIT 1`
    );
    res.json(results[0] || { mensagem: 'Nenhum acesso encontrado' });
  } catch (err) {
    console.error('❌ Erro ao buscar o último acesso:', err);
    res.status(500).send('Erro no servidor');
  }
});

// Função para registrar acesso
async function registrarAcesso(nome, uid, status, foto) {
  try {
    if (!db) throw new Error('Conexão com o banco de dados não está disponível.');
    nome = nome.trim();
    if (!nome || !uid || !status || !foto) return;
    const data_hora = DateTime.now().setZone('America/Manaus').toFormat('yyyy-MM-dd HH:mm:ss');


    await db.query(
      `INSERT INTO acessos (nome, uid, status, foto, data_hora)
       VALUES (?, ?, ?, ?, ?)`,
      [nome, uid, status, foto, data_hora]
    );
    console.log(`✅ Acesso registrado: ${nome}, UID: ${uid}, Status: ${status}, Data e Hora: ${data_hora}`);
  } catch (err) {
    console.error('❌ Erro ao registrar acesso no banco de dados:', err);
  }
}

// Bloco de leitura da Serial do Arduino (agora com JSON)
const arduinoPort = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
const arduinoParser = arduinoPort.pipe(new ReadlineParser({ delimiter: '\n' }));

arduinoPort.on('open', () => console.log(`📡 Serial aberta em ${SERIAL_PORT}@${BAUD_RATE}`));
arduinoParser.on('data', async (line) => {
  const trimmed = line.trim();
  try {
    const dados = JSON.parse(trimmed);
    const { temperatura, umidade, lux } = dados;
    if (
      typeof temperatura !== 'number' ||
      typeof umidade !== 'number' ||
      typeof lux !== 'number'
    ) {
      console.warn('⚠️ Dados inválidos recebidos da serial:', dados);
      return;
    }
    const data_hora = DateTime.now().setZone('America/Manaus').toFormat('yyyy-MM-dd HH:mm:ss');

    await db.query(
      `INSERT INTO sensores (temperatura, umidade, lux, data_hora)
       VALUES (?, ?, ?, ?)`,
      [temperatura, umidade, lux, data_hora]
    );
    console.log(`✅ Inserido via Serial: T=${temperatura}, U=${umidade}, LUX=${lux}`);
  } catch (err) {
    console.warn('⚠️ Formato inválido na serial:', trimmed);
  }
});

// Iniciar servidor
const PORT = 3001;
server.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));
