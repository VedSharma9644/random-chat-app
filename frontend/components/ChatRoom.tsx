'use client'

import { useEffect, useState, useRef } from 'react'
import { getSocket, initializeSocket } from '@/utils/socket'
import { auth } from '@/utils/auth'
import VoiceChat from './VoiceChat'

interface Message {
  id: string
  text: string
  sender: string
  timestamp: Date
}

export default function ChatRoom() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const socket = initializeSocket()

    auth.currentUser?.getIdToken().then(token => {
      socket.emit('authenticate', token)
    })

    socket.on('match_found', () => {
      setIsConnected(true)
      setIsSearching(false)
      setMessages([{
        id: 'system',
        text: '🎉 Connected with a chat partner! Say hello!',
        sender: 'system',
        timestamp: new Date()
      }])
    })

    socket.on('message', (message: Message) => {
      setMessages(prev => [...prev, {
        ...message,
        sender: message.sender === socket.id ? 'me' : 'partner'
      }])
    })

    socket.on('partner_disconnected', () => {
      setIsConnected(false)
      setIsSearching(false)
      setMessages(prev => [...prev, {
        id: 'system',
        text: '👋 Your chat partner has disconnected.',
        sender: 'system',
        timestamp: new Date()
      }])
    })

    return () => {
      socket.off('match_found')
      socket.off('message')
      socket.off('partner_disconnected')
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startSearching = () => {
    const socket = getSocket()
    setIsSearching(true)
    setMessages([{
      id: 'system',
      text: '🔍 Looking for someone to chat with...',
      sender: 'system',
      timestamp: new Date()
    }])
    socket.emit('find_match')
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value)

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {}, 1000)
  }

  const sendMessage = () => {
    if (!inputMessage.trim() || !isConnected) return

    const socket = getSocket()
    socket.emit('message', inputMessage)
    setInputMessage('')
  }

  return (
    <div className="h-screen flex flex-col bg-[#efeae2] overflow-hidden">
      <div className="bg-[#075e54] px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
            } border-2 border-white`}></span>
          </div>
          <div>
            <h1 className="text-white font-semibold">Random Chat</h1>
            <span className="text-xs text-[#8eb2ae]">
              {isConnected ? 'Online' : isSearching ? 'Searching...' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {isConnected && <VoiceChat roomId={getSocket()?.id || ''} isConnected={isConnected} />}
          {isConnected && (
            <button
              onClick={() => window.location.reload()}
              className="text-white hover:bg-[#0c766b] p-2 rounded-full transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5z' fill='%23c3d7d2'/%3E%3C/svg%3E")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        ></div>
        <div className="overflow-y-scroll max-h-full p-4 pt-12">
          <div className="space-y-4">
            {messages.map(message => (
              <div key={message.id} className={`message ${message.sender === 'me' ? 'text-right' : ''}`}>
                <div className="font-semibold text-sm">{message.sender}</div>
                <div>{message.text}</div>
                <div className="text-xs text-gray-500">{formatTime(message.timestamp)}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {!isConnected && !isSearching && (
        <div className="bg-[#075e54] p-4">
          <button
            onClick={startSearching}
            className="text-white w-full py-2 bg-[#0a7441] rounded-full"
          >
            Start Chat
          </button>
        </div>
      )}
      
      {isConnected && (
        <div className="bg-[#075e54] p-4">
          <input
            type="text"
            value={inputMessage}
            onChange={handleInputChange}
            placeholder="Type a message"
            className="w-full p-2 rounded-full text-black"
          />
          <button onClick={sendMessage} className="text-white px-4 py-2 rounded-full mt-2 bg-[#128c7e]">
            Send
          </button>
        </div>
      )}
    </div>
  )
}
