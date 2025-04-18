'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, initializeSocket } from '@/utils/socket'
import { auth } from '@/utils/auth'
import { useRouter } from 'next/navigation'

interface Message {
  id: string
  text: string
  sender: string
  timestamp: Date
}

export default function VoiceChatPage() {
  const router = useRouter()
  const [isConnected, setIsConnected] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isMuted, setIsMuted] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const socketRef = useRef<Socket | null>(null)

  // Use useCallback to prevent re-creation of the function on each render
  const startVoiceChat = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      })

      peerConnectionRef.current = peerConnection

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream)
      })

      peerConnection.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0]
        }
      }

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice_candidate', event.candidate)
        }
      }

      // Create and setup audio analyzer for voice activity detection
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      
      const analyser = audioContext.createAnalyser()
      analyserRef.current = analyser
      analyser.fftSize = 256
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      
      // Start checking voice activity
      checkVoiceActivity()

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      if (socketRef.current) {
        socketRef.current.emit('offer', offer)
      }
      
      setIsMuted(false)
    } catch (error) {
      console.error('Error starting voice chat:', error)
    }
  }, []);

  // Use useCallback for checkVoiceActivity as well
  const checkVoiceActivity = useCallback(() => {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    
    const check = () => {
      analyser.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length
      setIsSpeaking(average > 20)
      requestAnimationFrame(check)
    }
    
    check()
  }, []);

  // Use useCallback for stopVoiceChat as well
  const stopVoiceChat = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(err => console.error("Error closing audio context:", err))
      audioContextRef.current = null
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    setIsMuted(true)
    setIsSpeaking(false)
  }, []);

  useEffect(() => {
    const socket = initializeSocket()
    socketRef.current = socket
    
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 3
    let isNegotiating = false

    auth.currentUser?.getIdToken().then(token => {
      socket.emit('authenticate', token)
    })

    // Initialize WebRTC peer connection
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    })

    peerConnectionRef.current = peerConnection

    // Store pending ICE candidates
    const pendingCandidates: RTCIceCandidateInit[] = []

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState)
      if (peerConnection.connectionState === 'connected') {
        setIsConnected(true)
        reconnectAttempts = 0
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        setIsConnected(false)
        stopVoiceChat()
        
        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++
          console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`)
          setTimeout(() => {
            if (peerConnection.signalingState === 'stable') {
              peerConnection.restartIce()
            }
          }, 1000 * reconnectAttempts)
        }
      } else if (peerConnection.connectionState === 'closed') {
        setIsConnected(false)
        stopVoiceChat()
      }
    }

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState)
      if (peerConnection.iceConnectionState === 'failed') {
        console.log('ICE connection failed, restarting ICE...')
        peerConnection.restartIce()
      }
    }

    // Handle signaling state changes
    peerConnection.onsignalingstatechange = () => {
      console.log('Signaling state:', peerConnection.signalingState)
      if (peerConnection.signalingState === 'stable') {
        isNegotiating = false
      }
    }

    // Handle negotiation needed
    peerConnection.onnegotiationneeded = async () => {
      try {
        if (isNegotiating) return
        isNegotiating = true

        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true
        })
        await peerConnection.setLocalDescription(offer)
        socket.emit('offer', offer)
      } catch (error) {
        console.error('Error during negotiation:', error)
        isNegotiating = false
      }
    }

    // Handle incoming audio tracks
    peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind)
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0]
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0]
          // Ensure audio is playing
          remoteAudioRef.current.play().catch(error => {
            console.error('Error playing remote audio:', error)
          })
        }
      }
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate:', event.candidate)
        socket.emit('ice_candidate', event.candidate)
      } else {
        console.log('ICE gathering completed')
      }
    }

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

    socket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      try {
        if (isNegotiating) {
          console.log('Already negotiating, ignoring offer')
          return
        }
        isNegotiating = true

        // Get local audio stream first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        localStreamRef.current = stream
        
        // Add audio tracks to peer connection
        stream.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream)
        })

        await peerConnection.setRemoteDescription(offer)
        
        // Process any pending ICE candidates
        while (pendingCandidates.length > 0) {
          const candidate = pendingCandidates.shift()
          if (candidate) {
            try {
              await peerConnection.addIceCandidate(candidate)
            } catch (error) {
              console.error('Error adding pending ICE candidate:', error)
            }
          }
        }

        const answer = await peerConnection.createAnswer({
          offerToReceiveAudio: true
        })
        await peerConnection.setLocalDescription(answer)
        socket.emit('answer', answer)
      } catch (error) {
        console.error('Error handling offer:', error)
        isNegotiating = false
      }
    })

    socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      try {
        if (peerConnection.signalingState !== 'have-local-offer') {
          console.log('Not in have-local-offer state, ignoring answer')
          return
        }
        await peerConnection.setRemoteDescription(answer)
        
        // Process any pending ICE candidates
        while (pendingCandidates.length > 0) {
          const candidate = pendingCandidates.shift()
          if (candidate) {
            try {
              await peerConnection.addIceCandidate(candidate)
            } catch (error) {
              console.error('Error adding pending ICE candidate:', error)
            }
          }
        }
      } catch (error) {
        console.error('Error handling answer:', error)
      }
    })

    socket.on('ice_candidate', async (candidate: RTCIceCandidateInit) => {
      try {
        // If remote description is not set, store the candidate
        if (!peerConnection.remoteDescription) {
          console.log('Storing ICE candidate until remote description is set')
          pendingCandidates.push(candidate)
          return
        }
        
        await peerConnection.addIceCandidate(candidate)
      } catch (error) {
        console.error('Error adding ICE candidate:', error)
      }
    })

    socket.on('partner_disconnected', () => {
      setIsConnected(false)
      setIsSearching(false)
      stopVoiceChat()
    })

    return () => {
      socket.off('match_found')
      socket.off('offer')
      socket.off('answer')
      socket.off('ice_candidate')
      socket.off('partner_disconnected')
      stopVoiceChat()
    }
  }, [stopVoiceChat]);

  useEffect(() => {
    if (isConnected) {
      startVoiceChat()
    }
  }, [isConnected, startVoiceChat]);

  const toggleMute = () => {
    if (isMuted) {
      startVoiceChat()
    } else {
      stopVoiceChat()
    }
  }

  const startSearching = () => {
    const socket = getSocket()
    setIsSearching(true)
    socket.emit('find_match')
  }

  // Chat UI rendering - only include messages if they're used in the UI
  const renderMessages = () => {
    if (messages.length === 0) return null;
    
    return (
      <div className="p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`mb-2 ${msg.sender === 'system' ? 'text-center text-gray-500' : ''}`}>
            {msg.text}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#efeae2] overflow-hidden">
      {/* Header */}
      <div className="bg-[#075e54] px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
            } border-2 border-white`}></span>
          </div>
          <div>
            <h1 className="text-white font-semibold">Voice Chat</h1>
            <span className="text-xs text-[#8eb2ae]">
              {isConnected ? 'Connected' : isSearching ? 'Searching...' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/chat')}
            className="text-white hover:bg-[#0c766b] p-2 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {!isConnected && !isSearching && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">Start Voice Chat</h2>
            <p className="text-gray-600">Click the button below to find a random partner for voice chat</p>
            <button
              onClick={startSearching}
              className="bg-[#075e54] text-white px-6 py-3 rounded-full hover:bg-[#0c766b] transition-colors shadow-lg"
            >
              Find Partner
            </button>
          </div>
        )}

        {isSearching && (
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#075e54] border-t-transparent mx-auto"></div>
            <p className="text-gray-600">Finding your chat partner...</p>
          </div>
        )}

        {isConnected && (
          <div className="text-center space-y-8">
            <div className="relative">
              <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-16 h-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              {isSpeaking && (
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-3 py-1 rounded-full text-sm">
                  Speaking
                </div>
              )}
            </div>
            
            <button
              onClick={toggleMute}
              className={`p-4 rounded-full transition-colors ${
                isMuted
                  ? 'bg-gray-200 hover:bg-gray-300'
                  : isSpeaking
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMuted ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                )}
              </svg>
            </button>
          </div>
        )}
        
        {/* Display messages if any */}
        {renderMessages()}
      </div>

      {/* Hidden audio element for remote stream (only need one) */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </div>
  )
}