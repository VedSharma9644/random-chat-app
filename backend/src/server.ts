import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import * as admin from 'firebase-admin'
import dotenv from 'dotenv'

dotenv.config()

// Initialize Firebase Admin from environment variable
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY || '{}')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
})

// Store waiting users and active rooms
const waitingUsers: string[] = []
const activeRooms: { [key: string]: string[] } = {}

// Store active rooms and their participants
const rooms = new Map<string, Set<string>>();

// Helper function to find a partner in a room
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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  // Handle user authentication
  socket.on('authenticate', async (token: string) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token)
      socket.data.userId = decodedToken.uid
      console.log('User authenticated:', decodedToken.uid)
    } catch (error) {
      console.error('Authentication error:', error)
      socket.disconnect()
    }
  })

  // Handle user looking for a match
  socket.on('find_match', () => {
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.pop()!;
      const roomId = `${socket.id}-${partnerId}`;
      
      // Create room with both users
      rooms.set(roomId, new Set([socket.id, partnerId]));
      
      // Join both users to the room
      socket.join(roomId);
      const partnerSocket = io.sockets.sockets.get(partnerId);
      partnerSocket?.join(roomId);
      
      // Notify both users
      io.to(roomId).emit('match_found', roomId);
    } else {
      waitingUsers.push(socket.id);
    }
  })

  // Handle WebRTC signaling
  socket.on('offer', (offer: RTCSessionDescriptionInit) => {
    const partner = findPartner(socket.id);
    if (partner) {
      socket.to(partner.id).emit('offer', offer);
    }
  });

  socket.on('answer', (answer: RTCSessionDescriptionInit) => {
    const partner = findPartner(socket.id);
    if (partner) {
      socket.to(partner.id).emit('answer', answer);
    }
  });

  socket.on('ice_candidate', (candidate: RTCIceCandidateInit) => {
    const partner = findPartner(socket.id);
    if (partner) {
      socket.to(partner.id).emit('ice_candidate', candidate);
    }
  });

  // Handle messages
  socket.on('message', (message: string) => {
    const roomId = Object.keys(activeRooms).find(room => 
      activeRooms[room].includes(socket.id)
    )
    
    if (roomId) {
      io.to(roomId).emit('message', {
        id: Date.now().toString(),
        text: message,
        sender: socket.id,
        timestamp: new Date()
      })
    }
  })

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove from waiting list
    const waitingIndex = waitingUsers.indexOf(socket.id);
    if (waitingIndex !== -1) {
      waitingUsers.splice(waitingIndex, 1);
    }
    
    // Clean up rooms
    for (const [roomId, participants] of rooms.entries()) {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          rooms.delete(roomId);
        } else {
          // Notify remaining participant
          const remainingParticipant = Array.from(participants)[0];
          io.to(remainingParticipant).emit('partner_disconnected');
        }
      }
    }
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})


app.get('/', (req, res) => {
  res.send('Welcome to the Chat App!');
});
