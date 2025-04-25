import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Firebase Admin initialization
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
  if (!serviceAccount.project_id) {
    throw new Error('Missing or invalid Firebase service account credentials');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase Admin Initialized');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  process.exit(1);
}

const app = express();

// ✅ Use cors middleware
app.use(cors({
  origin: 'https://random-chat-frontend-202138484562.us-central1.run.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

// ✅ Health check endpoint
app.get('/api/status', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 8080,
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'https://random-chat-frontend-202138484562.us-central1.run.app',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  path: '/socket.io/',
});

const waitingUsers: string[] = [];
const rooms = new Map<string, Set<string>>();

function findPartner(socketId: string): { id: string } | null {
  for (const [roomId, participants] of rooms.entries()) {
    if (participants.has(socketId)) {
      for (const participantId of participants) {
        if (participantId !== socketId) {
          return { id: participantId };
        }
      }
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('authenticate', async (token: string) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      socket.data.userId = decodedToken.uid;
      console.log('🔐 Authenticated user:', decodedToken.uid);
    } catch (error) {
      console.error('❌ Auth failed:', error);
      socket.disconnect();
    }
  });

  socket.on('find_match', () => {
    let attempts = 0;
    const maxAttempts = 10;

    while (waitingUsers.length > 0 && attempts < maxAttempts) {
      attempts++;
      const partnerId = waitingUsers.pop()!;
      const partnerSocket = io.sockets.sockets.get(partnerId);

      if (partnerSocket) {
        const roomId = `${socket.id}-${partnerId}`;
        rooms.set(roomId, new Set([socket.id, partnerId]));

        socket.join(roomId);
        partnerSocket.join(roomId);

        io.to(roomId).emit('match_found', roomId);
        return;
      }
    }

    waitingUsers.push(socket.id);
  });

  socket.on('offer', (offer) => {
    const partner = findPartner(socket.id);
    if (partner) socket.to(partner.id).emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    const partner = findPartner(socket.id);
    if (partner) socket.to(partner.id).emit('answer', answer);
  });

  socket.on('ice_candidate', (candidate) => {
    const partner = findPartner(socket.id);
    if (partner) socket.to(partner.id).emit('ice_candidate', candidate);
  });

  socket.on('message', (message) => {
    for (const [roomId, participants] of rooms.entries()) {
      if (participants.has(socket.id)) {
        io.to(roomId).emit('message', {
          id: Date.now().toString(),
          text: message,
          sender: socket.id,
          timestamp: new Date(),
        });
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);

    const waitingIndex = waitingUsers.indexOf(socket.id);
    if (waitingIndex !== -1) {
      waitingUsers.splice(waitingIndex, 1);
    }

    for (const [roomId, participants] of rooms.entries()) {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          rooms.delete(roomId);
        } else {
          const remaining = Array.from(participants)[0];
          io.to(remaining).emit('partner_disconnected');
        }
      }
    }
  });
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/status`);
}).on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
