'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { io, Socket } from 'socket.io-client'

const Page = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isMatched, setIsMatched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isInitiator, setIsInitiator] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const reconnectAttempts = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_DELAY = 5000 // 5 seconds

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const localStream = useRef<MediaStream | null>(null)

  const servers = useMemo(() => ({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  }), [])

  const createPeerConnection = useCallback(() => {
    peerConnection.current = new RTCPeerConnection(servers)

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice_candidate', event.candidate)
      }
    }

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
    }

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current?.addTrack(track, localStream.current!)
      })
    }
  }, [socket, servers])

  const startCall = useCallback(async () => {
    if (!peerConnection.current) return
    const offer = await peerConnection.current.createOffer()
    await peerConnection.current.setLocalDescription(offer)
    socket?.emit('offer', offer)
  }, [socket])

  const checkServerStatus = useCallback(async () => {
    try {
      const response = await fetch('https://random-chat-app-idz3.onrender.com/health')
      if (response.ok) {
        setServerStatus('online')
        setConnectionError(null)
      } else {
        setServerStatus('offline')
        setConnectionError('Server is currently unavailable. Please try again later.')
      }
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setServerStatus('offline')
      setConnectionError('Server is currently unavailable. Please try again later.')
    }
  }, [])

  useEffect(() => {
    checkServerStatus()
    const interval = setInterval(checkServerStatus, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [checkServerStatus])

  const connectSocket = useCallback(() => {
    if (serverStatus !== 'online') {
      setConnectionError('Server is currently unavailable. Please try again later.')
      return null
    }

    const newSocket = io('https://random-chat-app-idz3.onrender.com', {
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    })

    if (!newSocket) {
      setConnectionError('Failed to create socket connection')
      return null
    }

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error)
      setConnectionError('Failed to connect to server. Retrying...')
      reconnectAttempts.current++
      
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionError('Failed to connect after multiple attempts. Please try again later.')
        newSocket.disconnect()
      }
    })

    newSocket.on('connect', () => {
      console.log('Connected to server')
      setConnectionError(null)
      reconnectAttempts.current = 0
    })

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason)
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        setTimeout(() => {
          newSocket.connect()
        }, RECONNECT_DELAY)
      }
    })

    setSocket(newSocket)
    return newSocket
  }, [serverStatus])

  useEffect(() => {
    const newSocket = connectSocket()
    if (!newSocket) return

    newSocket.on('match_found', async ({ roomId, initiator }) => {
      console.log('✅ Matched in room:', roomId, '| You are initiator:', initiator)
      setIsMatched(true)
      setIsSearching(false)
      setIsInitiator(initiator)

      await startLocalStream()
      createPeerConnection()

      if (initiator) {
        startCall()
      }
    })

    newSocket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      if (!peerConnection.current) createPeerConnection()
      const pc = peerConnection.current
      if (!pc) return console.error("Peer connection is still null after initialization.")
    
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
    
      newSocket.emit('answer', answer)
    })
    

    newSocket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      const pc = peerConnection.current
      if (!pc) return console.error("Peer connection is null while handling answer.")
      await pc.setRemoteDescription(new RTCSessionDescription(answer))
    })
    

    newSocket.on('ice_candidate', async (candidate: RTCIceCandidateInit) => {
      const pc = peerConnection.current
      if (!pc) return console.error("Peer connection is null while adding ICE candidate.")
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('Error adding ICE candidate', e)
      }
    })
    

    newSocket.on('partner_disconnected', () => {
      alert('Partner disconnected')
      resetCall()
    })

    return () => {
      newSocket.disconnect()
    }
  }, [connectSocket, createPeerConnection, startCall])

  const startLocalStream = async () => {
    localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream.current
    }
  }

  const startSearch = () => {
    if (socket) {
      resetCall()
      socket.emit('find_match')
      setIsSearching(true)
    }
  }

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  const resetCall = () => {
    peerConnection.current?.close()
    peerConnection.current = null
    setIsMatched(false)
    setIsSearching(false)

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop())
      localStream.current = null
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
  }

  return (
    <div className="p-4 space-y-4">
      {connectionError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{connectionError}</span>
          {serverStatus === 'offline' && (
            <button
              onClick={checkServerStatus}
              className="ml-4 px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Check Server Status
            </button>
          )}
        </div>
      )}
      <h1 className="text-xl font-bold">Random Video Chat</h1>

      <div className="flex flex-col md:flex-row gap-4">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full md:w-1/2 rounded border" />
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full md:w-1/2 rounded border" />
      </div>

      {!isMatched && !isSearching && (
        <button
          onClick={startSearch}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Start Search
        </button>
      )}

      {isSearching && <p className="text-gray-600">🔍 Searching for a partner...</p>}

      {isMatched && (
        <div className="space-x-4 mt-4">
          <button
            onClick={toggleMute}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>

          <button
            onClick={resetCall}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

export default Page
