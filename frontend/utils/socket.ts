import { io, Socket } from 'socket.io-client';
import { auth } from './auth';

let socket: Socket | null = null;

export const initializeSocket = () => {
  if (!socket) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
    console.log('Connecting to WebSocket server:', wsUrl);

    socket = io(wsUrl, {
      auth: {
        token: auth.currentUser?.getIdToken(),
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Connected to socket server');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      // Try to reconnect after a delay
      setTimeout(() => {
        if (socket && !socket.connected) {
          console.log('Attempting to reconnect...');
          socket.connect();
        }
      }, 5000);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from socket server:', reason);
      if (reason === 'io server disconnect' && socket) {
        // The disconnection was initiated by the server, you need to reconnect manually
        setTimeout(() => {
          if (socket && !socket.connected) {
            console.log('Attempting to reconnect after server disconnect...');
            socket.connect();
          }
        }, 5000);
      }
    });
  }
  return socket;
};

export const getSocket = () => {
  if (!socket) {
    throw new Error('Socket not initialized');
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
