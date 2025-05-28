const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root', // Substitua pelo usuário do seu MySQL
    password: 'Teddyana21452668!', // Substitua pela senha do seu MySQL
    database: 'projeto_arduino'
});

connection.connect((err) => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err);
        return;
    }
    console.log('Conectado ao MySQL!');
});

module.exports = connection;
