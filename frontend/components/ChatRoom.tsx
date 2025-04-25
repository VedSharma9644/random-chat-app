// working version of chat room with UI implemented at 04/21/2025 05:11 PM
'use client';

import { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { initializeSocket } from '@/utils/socket';
import { UserIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: string;
}

export default function ChatRoom() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let mounted = true;

    const initSocket = async () => {
      try {
        const socket = await initializeSocket();
        if (!mounted) return;
        
        socketRef.current = socket;

        socket.on('match_found', (partnerId: string) => {
          console.log('Match found with partner:', partnerId);
          if (!partnerId) {
            console.error('Invalid partner ID received');
            return;
          }
          setPartnerId(partnerId);
          setConnected(true);
          setSearching(false);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              text: '🎉 Connected with a chat partner! Say hello!',
              sender: 'system',
              timestamp: new Date().toISOString(),
            },
          ]);
        });

        socket.on('message', (data: { id: string; text: { text: string; to: string }; sender: string; timestamp: string }) => {
          console.log('Received message:', data);
          if (!data.text || !data.sender) return;
          
          const message: Message = {
            id: data.id,
            text: typeof data.text === 'string' ? data.text : data.text.text,
            sender: data.sender === socket.id ? 'me' : 'partner',
            timestamp: data.timestamp,
          };
          setMessages((prev) => [...prev, message]);
        });

        socket.on('partner_disconnected', () => {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              text: '❌ Your chat partner disconnected.',
              sender: 'system',
              timestamp: new Date().toISOString(),
            },
          ]);
          setConnected(false);
          setPartnerId(null);
          setSearching(false);
        });
      } catch (error) {
        console.error('Failed to initialize socket:', error);
      }
    };

    initSocket();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.off('match_found');
        socketRef.current.off('message');
        socketRef.current.off('partner_disconnected');
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startSearch = async () => {
    try {
      const socket = await initializeSocket();
      socket.emit('find_match');
      setSearching(true);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: '🔍 Searching for a partner...',
          sender: 'system',
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Failed to start search:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: '❌ Failed to connect to chat server.',
          sender: 'system',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const sendMessage = async () => {
    console.log('Attempting to send message:', { input, partnerId });
    if (!input.trim() || !partnerId) {
      console.log('Cannot send message:', { hasInput: !!input.trim(), hasPartnerId: !!partnerId });
      return;
    }

    try {
      const socket = await initializeSocket();
      const messageData = {
        id: Date.now().toString(),
        text: input,
        sender: socket.id,
        timestamp: new Date().toISOString(),
      };
      console.log('Emitting message event with data:', messageData);
      socket.emit('message', messageData);
      setInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="bg-[#075e54] px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden flex items-center justify-center">
              <UserIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
              connected ? 'bg-green-500' : 'bg-gray-400'
            } border-2 border-white`}></span>
          </div>
          <div>
            <h1 className="text-white font-semibold">Random Chat v--1</h1>
            <span className="text-xs text-[#8eb2ae]">
              {connected ? 'Online' : searching ? 'Searching...' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {connected && (
            <button
              onClick={() => window.location.reload()}
              className="text-white hover:bg-[#0c766b] p-2 rounded-full transition-colors"
            >
              <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!connected && !searching && (
          <button
            onClick={startSearch}
            className="w-full px-4 py-2 bg-[#128c7e] text-white rounded-full hover:bg-[#0a7441] transition-colors"
          >
            Start Chat
          </button>
        )}

        {connected && (
          <>
            <div className="border p-2 h-[calc(100vh-220px)] overflow-y-auto mb-4 rounded bg-[#efeae2]">
              {messages.map((msg) => (
                <div key={msg.id} className={`mb-2 ${msg.sender === 'me' ? 'text-right' : ''}`}>
                  <div className="text-xs text-gray-500 mb-1">
                    {msg.sender === 'me' ? 'You' : msg.sender === 'partner' ? 'Partner' : 'System'}
                  </div>
                  <span
                    className={`inline-block px-3 py-1 rounded-lg ${
                      msg.sender === 'me'
                        ? 'bg-[#128c7e] text-white'
                        : msg.sender === 'partner'
                        ? 'bg-white text-black'
                        : 'bg-[#ffd279] text-black'
                    }`}
                  >
                    {msg.text}
                  </span>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                className="flex-grow px-4 py-2 rounded-full border focus:outline-none focus:border-[#128c7e]"
                placeholder="Type a message..."
              />
              <button
                onClick={sendMessage}
                className="px-6 py-2 bg-[#128c7e] text-white rounded-full hover:bg-[#0a7441] transition-colors"
              >
                Send
              </button>
            </div>
          </>
        )}

        {searching && !connected && (
          <div className="text-center mt-4">
            <p className="text-gray-600">Searching for a partner...</p>
          </div>
        )}
      </div>
    </div>
  );
}
