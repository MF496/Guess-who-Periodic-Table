const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const chalk = require('chalk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
  phase: 'waiting',
  players: {},
  playerOrder: [],
  currentTurn: null
};

io.on('connection', (socket) => {
  if (gameState.playerOrder.length < 2) {
    const playerNum = gameState.playerOrder.length + 1;
    gameState.playerOrder.push(socket.id);
    gameState.players[socket.id] = { playerNum, secretElement: null, ready: false };
    socket.emit('assigned', { playerNum });
    console.log(chalk.cyan(`Player ${playerNum} connected: ${socket.id}`));

    if (gameState.playerOrder.length === 2) {
      gameState.phase = 'setup';
      io.emit('phase-change', { phase: 'setup' });
      console.log(chalk.yellow('Two players connected — setup phase started.'));
    }
  } else {
    console.log(chalk.red('Third connection rejected — game full.'));
    socket.disconnect();
  }

  // Client sends the element symbol string (e.g. "Au")
  socket.on('choose-secret', ({ element }) => {
    if (!gameState.players[socket.id]) return;
    gameState.players[socket.id].secretElement = element; // symbol string
    gameState.players[socket.id].ready = true;
    console.log(chalk.green(`Player ${gameState.players[socket.id].playerNum} chose: ${element}`));

    const allReady =
      gameState.playerOrder.length === 2 &&
      gameState.playerOrder.every(id => gameState.players[id].ready);

    if (allReady) {
      gameState.phase = 'playing';
      gameState.currentTurn = gameState.playerOrder[0];
      io.emit('phase-change', {
        phase: 'playing',
        currentTurn: gameState.currentTurn
      });
      console.log(chalk.green('Both ready — game started!'));
    }
  });

  socket.on('flip-tile', ({ id, state }) => {
    socket.broadcast.emit('opponent-flip', { id, state });
  });

  socket.on('guess-element', ({ symbol }) => {
    const oppId = gameState.playerOrder.find(id => id !== socket.id);
    if (!oppId || !gameState.players[oppId]) return;
    const oppSecret = gameState.players[oppId].secretElement;

    if (symbol.trim().toLowerCase() === oppSecret.trim().toLowerCase()) {
      console.log(chalk.green(`Correct guess: ${symbol}! Player ${gameState.players[socket.id].playerNum} wins.`));
      io.emit('game-over', { winnerId: socket.id, secret: oppSecret });
    } else {
      console.log(chalk.red(`Wrong guess: ${symbol}. Opponent wins.`));
      io.emit('game-over', { winnerId: oppId, secret: oppSecret });
    }
  });

  socket.on('end-turn', () => {
    const idx = gameState.playerOrder.indexOf(socket.id);
    if (idx === -1) return;
    gameState.currentTurn = gameState.playerOrder[1 - idx];
    io.emit('turn-change', { currentTurn: gameState.currentTurn });
    console.log(chalk.cyan(`Turn passed to player ${gameState.players[gameState.currentTurn].playerNum}`));
  });

  socket.on('disconnect', () => {
    console.log(chalk.red(`Player ${socket.id} disconnected — resetting game.`));
    gameState = { phase: 'waiting', players: {}, playerOrder: [], currentTurn: null };
    io.emit('game-reset');    
  });
});

const art = `
 ___           _   _     _                         ___ _  _     __  _____ 
(  _ \\       _(_ )( )_  ( )                      / ___) )( )  / _  \\  ___)
| (_) )_   _(_)| ||  _) | |_   _   _    ___ ___ | (__ | || | ( (_) | (__  
|  _ (( ) ( ) || || |   |  _ \\( ) ( ) /  _   _  \\  __)| || |_ \\__  |  _  \\
| (_) ) (_) | || || |_  | |_) ) (_) | | ( ) ( ) | |   (__  __)   | | (_) |
(____/ \\___/(_)___)\\__) (_ __/ \\__  | (_) (_) (_)_)      (_)     (_)\\___/ 
                              ( )_| |                                     
                               \\___/                                      
`;

server.listen(3000, () => {
  console.log(chalk.green(art));
  console.log(('Server live at http://localhost:3000'));
});