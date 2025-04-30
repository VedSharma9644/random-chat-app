"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const admin = __importStar(require("firebase-admin"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
}
catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    process.exit(1);
}
const app = (0, express_1.default)();
// ✅ Use cors middleware
app.use((0, cors_1.default)({
    origin: 'https://random-chat-frontend-202138484562.us-central1.run.app',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
// Handle preflight requests
app.options('*', (0, cors_1.default)());
app.use(express_1.default.json());
// ✅ Health check endpoint with logging
app.get('/api/status', (req, res) => {
    console.log('🔍 Health check request received:', {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        origin: req.headers.origin
    });
    res.status(200).json({
        status: 'online',
        timestamp: new Date().toISOString(),
        port: process.env.PORT || 8080,
    });
});
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
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
const waitingUsers = [];
const rooms = new Map();
function findPartner(socketId) {
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
    socket.on('authenticate', (token) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const decodedToken = yield admin.auth().verifyIdToken(token);
            socket.data.userId = decodedToken.uid;
            console.log('🔐 Authenticated user:', decodedToken.uid);
        }
        catch (error) {
            console.error('❌ Auth failed:', error);
            socket.disconnect();
        }
    }));
    socket.on('find_match', () => {
        console.log('🔍 User looking for match:', socket.id);
        console.log('👥 Current waiting users:', waitingUsers);
        // Check if user is already in a room
        for (const [roomId, participants] of rooms.entries()) {
            if (participants.has(socket.id)) {
                console.log('❌ User already in a room:', socket.id);
                return;
            }
        }
        // Check if user is already waiting
        if (waitingUsers.includes(socket.id)) {
            console.log('❌ User already waiting:', socket.id);
            return;
        }
        // Check if there's already a waiting user
        if (waitingUsers.length > 0) {
            const partnerId = waitingUsers.pop();
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                const roomId = `${socket.id}-${partnerId}`;
                rooms.set(roomId, new Set([socket.id, partnerId]));
                socket.join(roomId);
                partnerSocket.join(roomId);
                // Randomly decide who is the initiator
                const isInitiator = Math.random() < 0.5;
                // Emit match_found to both users with their respective roles
                socket.emit('match_found', { roomId, initiator: isInitiator });
                partnerSocket.emit('match_found', { roomId, initiator: !isInitiator });
                console.log('✅ Match found:', {
                    roomId,
                    user1: { id: socket.id, initiator: isInitiator },
                    user2: { id: partnerId, initiator: !isInitiator }
                });
                return;
            }
        }
        // If no match found, add to waiting list
        waitingUsers.push(socket.id);
        console.log('⏳ Added to waiting list:', socket.id);
    });
    socket.on('offer', (offer) => {
        const partner = findPartner(socket.id);
        if (partner)
            socket.to(partner.id).emit('offer', offer);
    });
    socket.on('answer', (answer) => {
        const partner = findPartner(socket.id);
        if (partner)
            socket.to(partner.id).emit('answer', answer);
    });
    socket.on('ice_candidate', (candidate) => {
        const partner = findPartner(socket.id);
        if (partner)
            socket.to(partner.id).emit('ice_candidate', candidate);
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
                }
                else {
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
