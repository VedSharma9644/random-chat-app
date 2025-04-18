'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, initializeSocket } from '@/utils/socket'
import { auth } from '@/utils/auth'
import { useRouter } from 'next/navigation'

// interface Message {
//   id: string
//   text: string
//   sender: string
//   timestamp: Date
// }

export default function VideoChatPage() {
  const router = useRouter()
  const [isConnected, setIsConnected] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  // Remove or use the messages state
  const [isMuted, setIsMuted] = useState(true)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const socket = useRef<Socket | null>(null)

  const getMediaStream = useCallback(async (isTestMode = false) => {
    try {
      if (isTestMode) {
        // Create a test video stream with a static image
        const canvas = document.createElement('canvas')
        canvas.width = 1280
        canvas.height = 720
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#075e54'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = 'white'
          ctx.font = '48px Arial'
          ctx.textAlign = 'center'
          ctx.fillText('Test Video', canvas.width/2, canvas.height/2)
        }
        const stream = canvas.captureStream(30)
        return stream
      }

      return await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      })
    } catch (error) {
      console.error('Error accessing media devices:', error)
      if (error instanceof DOMException && error.name === 'NotReadableError') {
        console.log('Device in use, switching to test mode')
        return getMediaStream(true)
      }
      throw error
    }
  }, [])

  const startVideoChat = useCallback(async () => {
    try {
      const stream = await getMediaStream()
      localStreamRef.current = stream

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

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
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket.current) {
          socket.current.emit('ice_candidate', event.candidate)
        }
      }

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      if (socket.current) {
        socket.current.emit('offer', offer)
      }
    } catch (error) {
      console.error('Error starting video chat:', error)
    }
  }, [getMediaStream])

  useEffect(() => {
    const socket = initializeSocket()
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
        // Start video chat when connected
        startVideoChat()
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        setIsConnected(false)
        stopVideoChat()
        
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
        stopVideoChat()
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
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        })
        await peerConnection.setLocalDescription(offer)
        socket.emit('offer', offer)
      } catch (error) {
        console.error('Error during negotiation:', error)
        isNegotiating = false
      }
    }

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind)
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0]
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
          // Ensure video is playing
          remoteVideoRef.current.play().catch(error => {
            console.error('Error playing remote video:', error)
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
    })

    socket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      try {
        if (isNegotiating) {
          console.log('Already negotiating, ignoring offer')
          return
        }
        isNegotiating = true

        // Get local media stream
        const stream = await getMediaStream()
        localStreamRef.current = stream
        
        // Add tracks to peer connection
        stream.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream)
        })

        // Display local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

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
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
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
      stopVideoChat()
    })

    return () => {
      socket.off('match_found')
      socket.off('offer')
      socket.off('answer')
      socket.off('ice_candidate')
      socket.off('partner_disconnected')
      stopVideoChat()
    }
  }, [getMediaStream, startVideoChat])

  useEffect(() => {
    if (isConnected) {
      getMediaStream()
      startVideoChat()
    }
  }, [isConnected, getMediaStream, startVideoChat])

  const stopVideoChat = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    setIsMuted(true)
    setIsVideoOff(true)
    setIsSpeaking(false)
  }

  // Either remove this function or use it somewhere
  // Since it's not used, we can comment it out for now
  /*
  const checkVoiceActivity = () => {
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
  }
  */

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks()
      audioTracks.forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks()
      videoTracks.forEach(track => {
        track.enabled = !track.enabled
      })
      setIsVideoOff(!isVideoOff)
    }
  }

  const startSearching = () => {
    const socket = getSocket()
    setIsSearching(true)
    socket.emit('find_match')
  }

  return (
    <div className="h-screen flex flex-col bg-[#efeae2] overflow-hidden">
      {/* Header */}
      <div className="bg-[#075e54] px-4 py-3 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gray-300 rounded-full overflow-hidden flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
            } border-2 border-white`}></span>
          </div>
          <div>
            <h1 className="text-white font-semibold">Video Chat</h1>
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
      <div className="flex-1 relative">
        {!isConnected && !isSearching && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold text-gray-800">Start Video Chat</h2>
              <p className="text-gray-600">Click the button below to find a random partner for video chat</p>
              <button
                onClick={startSearching}
                className="bg-[#075e54] text-white px-6 py-3 rounded-full hover:bg-[#0c766b] transition-colors shadow-lg"
              >
                Find Partner
              </button>
            </div>
          </div>
        )}

        {isSearching && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#075e54] border-t-transparent mx-auto"></div>
              <p className="text-gray-600">Finding your chat partner...</p>
            </div>
          </div>
        )}

        {isConnected && (
          <div className="absolute inset-0 flex">
            {/* Remote Video */}
            <div className="flex-1 relative bg-black">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              {isSpeaking && (
                <div className="absolute bottom-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm">
                  Speaking
                </div>
              )}
            </div>

            {/* Local Video */}
            <div className="absolute bottom-4 right-4 w-48 h-36 bg-black rounded-lg overflow-hidden shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>

            {/* Controls */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4">
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full transition-colors ${
                  isMuted ? 'bg-gray-200 hover:bg-gray-300' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                <svg
                  className="w-6 h-6 text-white"
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

              <button
                onClick={toggleVideo}
                className={`p-3 rounded-full transition-colors ${
                  isVideoOff ? 'bg-gray-200 hover:bg-gray-300' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isVideoOff ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  )}
                </svg>
              </button>

              <button
                onClick={stopVideoChat}
                className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
              >
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 8v8M8 8v8M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}