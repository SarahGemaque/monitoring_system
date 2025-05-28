// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Ajuste aqui a porta serial (ex: "COM3" no Windows, "/dev/ttyUSB0" no Linux, etc.)
const portName = 'COM3'; 
const baudRate = 9600;

// Abre a porta serial
const port = new SerialPort(portName, { baudRate: baudRate }, (err) => {
  if (err) {
    return console.log('Erro ao abrir a porta serial:', err.message);
  }
});

// Cria um parser para ler até o caractere que indica final de mensagem
// (no seu caso, parece ser o ponto '.' - ajuste conforme seu Arduino)
const parser = port.pipe(new Readline({ delimiter: '.' }));

// Quando chegar algum dado do Arduino, repassamos a todos os clientes WebSocket
parser.on('data', (line) => {
  console.log('Dados recebidos da serial:', line);

  // Envia para todos os clientes conectados via WebSocket
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(line);
    }
  });
});

// Servir arquivos estáticos da pasta "public"
app.use(express.static('public'));

// Exemplo de rota HTTP (opcional, se precisar de API REST):
app.get('/api/teste', (req, res) => {
  res.json({ status: 'ok' });
});

// Quando um cliente WebSocket se conecta
wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado!');

  // Se quiser, pode enviar uma mensagem inicial
  ws.send('Conexão estabelecida com o servidor Node.js via WebSocket');
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});