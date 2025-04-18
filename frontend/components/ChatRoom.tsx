'use client'

import { useEffect, useState, useRef } from 'react'
import { getSocket, initializeSocket } from '@/utils/socket'
import { auth } from '@/utils/auth'
import Image from 'next/image'
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
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const socket = initializeSocket()

    auth.currentUser?.getIdToken().then(token => {
      socket.emit('authenticate', token)
    })

    socket.on('match_found', (roomId: string) => {
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
    
    setIsTyping(true)
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false)
    }, 1000)
  }

  const sendMessage = () => {
    if (!inputMessage.trim() || !isConnected) return

    const socket = getSocket()
    socket.emit('message', inputMessage)
    setInputMessage('')
  }

  return (
    <div className="h-screen flex flex-col bg-[#efeae2] overflow-hidden">
      {/* Header */}
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

      {/* Chat Area with Background */}
      <div className="flex-1 overflow-y-auto relative">
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23000000' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
            backgroundSize: '300px 300px',
            opacity: 0.1
          }}
        />
        
        {/* Messages */}
        <div className="relative z-10 min-h-full p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex ${
                  message.sender === 'me' 
                    ? 'justify-end' 
                    : message.sender === 'system' 
                      ? 'justify-center' 
                      : 'justify-start'
                } ${index === 0 ? 'mt-4' : ''}`}
              >
                {message.sender === 'system' ? (
                  <div className="bg-[#fff] text-gray-600 text-sm py-2 px-4 rounded-lg shadow-sm max-w-[90%] text-center">
                    {message.text}
                  </div>
                ) : (
                  <div className={`max-w-[75%] ${message.sender === 'me' ? 'ml-12' : 'mr-12'}`}>
                    <div
                      className={`relative px-3 py-2 shadow-sm ${
                        message.sender === 'me'
                          ? 'bg-[#dcf8c6] message-right'
                          : 'bg-white message-left'
                      }`}
                    >
                      <p className="text-gray-800 break-words">{message.text}</p>
                      <span className="text-[11px] text-gray-500 ml-2 float-right mt-1">
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Bottom Action Area */}
      <div className="bg-[#f0f0f0] border-t border-gray-200">
        {!isConnected && !isSearching && (
          <div className="p-4 flex justify-center">
            <button
              onClick={startSearching}
              className="bg-[#075e54] text-white px-6 py-3 rounded-full hover:bg-[#0c766b] transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0 flex items-center space-x-2"
            >
              <span>Start Random Chat</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        )}

        {isSearching && (
          <div className="p-4 flex justify-center items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#075e54] border-t-transparent"></div>
            <span className="text-[#075e54] font-medium">Finding your chat partner...</span>
          </div>
        )}

        {/* Message Input */}
        {isConnected && (
          <div className="p-3">
            <div className="max-w-3xl mx-auto flex items-center space-x-2">
              <div className="flex-1 bg-white rounded-full shadow-sm flex items-center">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-transparent focus:outline-none min-w-0 rounded-full"
                />
                <button className="p-2 hover:bg-gray-100 rounded-full mx-1">
                  <svg className="w-6 h-6 text-[#075e54]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim()}
                className="bg-[#075e54] text-white p-3 rounded-full hover:bg-[#0c766b] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .message-right {
          border-radius: 15px 15px 3px 15px;
        }
        .message-left {
          border-radius: 15px 15px 15px 3px;
        }
        
        /* Hide scrollbar for Chrome, Safari and Opera */
        .overflow-y-auto::-webkit-scrollbar {
          display: none;
        }
        
        /* Hide scrollbar for IE, Edge and Firefox */
        .overflow-y-auto {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}</style>
    </div>
  )
} 