'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useServerHealth } from '@/hooks/useServerHealth'

const Page = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isMatched, setIsMatched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [messages, setMessages] = useState<Array<{ text: string; sender: string; timestamp: Date }>>([])
  const [inputMessage, setInputMessage] = useState('')
  const { status: serverStatus, error: connectionError } = useServerHealth()
  const reconnectAttempts = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_DELAY = 5000 // 5 seconds
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const connectSocket = useCallback(() => {
    if (serverStatus !== 'online') {
      console.log('Server is not online, waiting for connection...');
      return null;
    }

    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    if (!newSocket) {
      console.error('Failed to create socket connection');
      return null;
    }

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      reconnectAttempts.current++;
      
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Failed to connect after multiple attempts');
        newSocket.disconnect();
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      reconnectAttempts.current = 0;
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      if (reason === 'io server disconnect') {
        setTimeout(() => {
          newSocket.connect();
        }, RECONNECT_DELAY);
      }
    });

    setSocket(newSocket);
    return newSocket;
  }, [serverStatus]);

  useEffect(() => {
    if (serverStatus === 'online') {
      const newSocket = connectSocket();
      if (!newSocket) return;

      newSocket.on('match_found', (roomId: string) => {
        console.log('✅ Matched in room:', roomId);
        setIsMatched(true);
        setIsSearching(false);
        setMessages([]);
      });

      newSocket.on('message', (message: { text: string; sender: string; timestamp: Date }) => {
        setMessages(prev => [...prev, message]);
      });

      newSocket.on('partner_disconnected', () => {
        alert('Partner disconnected');
        resetChat();
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [connectSocket, serverStatus]);

  const startSearch = () => {
    if (socket) {
      resetChat();
      socket.emit('find_match');
      setIsSearching(true);
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && inputMessage.trim()) {
      socket.emit('message', inputMessage.trim());
      setInputMessage('');
    }
  };

  const resetChat = () => {
    setIsMatched(false);
    setIsSearching(false);
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Server Status Indicator */}
      <div className={`fixed top-4 right-4 p-2 rounded-md ${
        serverStatus === 'online' ? 'bg-green-100 text-green-800' :
        serverStatus === 'offline' ? 'bg-red-100 text-red-800' :
        'bg-yellow-100 text-yellow-800'
      }`}>
        Server: {serverStatus}
        {connectionError && <div className="text-sm">{connectionError}</div>}
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-bold">Random Chat</h1>

        {connectionError && (
          <div className="bg-red-100 text-red-700 p-4 rounded-md">
            {connectionError}
          </div>
        )}

        {!isMatched && !isSearching && (
          <button
            onClick={startSearch}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start Chat
          </button>
        )}

        {isSearching && (
          <div className="text-center p-4">
            <p className="text-gray-600">🔍 Searching for a chat partner...</p>
          </div>
        )}

        {isMatched && (
          <div className="space-y-4">
            <div className="h-96 overflow-y-auto bg-white rounded-lg shadow p-4 space-y-2">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg ${
                    msg.sender === socket?.id
                      ? 'bg-blue-100 ml-auto'
                      : 'bg-gray-100'
                  } max-w-[80%] break-words`}
                >
                  {msg.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 p-2 border rounded"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Send
              </button>
            </form>

            <button
              onClick={resetChat}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              End Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Page; 