'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { io, Socket } from 'socket.io-client'
import { useServerHealth } from '@/hooks/useServerHealth'

const Page = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isMatched, setIsMatched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isInitiator, setIsInitiator] = useState(false)
  const { status: serverStatus, error: connectionError } = useServerHealth()
  const reconnectAttempts = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_DELAY = 5000 // 5 seconds

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
      const remoteAudio = new Audio()
      remoteAudio.srcObject = event.streams[0]
      remoteAudio.play()
    }

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current?.addTrack(track, localStream.current!)
      })
    }
  }, [socket, servers])

  const startCall = useCallback(async () => {
    if (!peerConnection.current) {
      console.error('No peer connection available for voice call')
      return
    }

    try {
      if (!isInitiator) {
        console.log('Not the initiator, skipping offer creation')
        return
      }

      console.log('Creating and sending voice call offer as initiator')
      const offer = await peerConnection.current.createOffer()
      await peerConnection.current.setLocalDescription(offer)
      socket?.emit('offer', offer)
    } catch (error) {
      console.error('Error creating voice call offer:', error)
      // Reset connection state on error
      setIsMatched(false)
      setIsSearching(false)
    }
  }, [socket, isInitiator])

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

      newSocket.on('match_found', async ({ roomId, initiator }) => {
        console.log('✅ Voice chat matched in room:', roomId, '| You are initiator:', initiator)
        setIsMatched(true)
        setIsSearching(false)
        setIsInitiator(initiator)

        await startLocalStream()
        createPeerConnection()

        // Only create and send offer if we are the initiator
        if (isInitiator) {
          console.log('Starting voice call as initiator')
          await startCall()
        } else {
          console.log('Waiting for voice call offer as non-initiator')
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
        newSocket.disconnect();
      };
    }
  }, [connectSocket, createPeerConnection, startCall, serverStatus])

  const startLocalStream = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Unable to access microphone. Please check your permissions.')
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
  }

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
        <h1 className="text-xl font-bold">Random Voice Chat</h1>

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
            Start Voice Chat
          </button>
        )}

        {isSearching && (
          <div className="text-center p-4">
            <p className="text-gray-600">🔍 Searching for a voice chat partner...</p>
          </div>
        )}

        {isMatched && (
          <div className="space-y-4">
            <div className="flex justify-center space-x-4">
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
                End Call
              </button>
            </div>

            <div className="text-center text-green-600">
              Connected - Voice chat is active
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Page;