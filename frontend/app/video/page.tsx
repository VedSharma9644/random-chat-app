'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { getSocket, initializeSocket } from '@/utils/socket'
import { auth } from '@/utils/auth'
import { useRouter } from 'next/navigation'

export default function VideoChatPage() {
  const router = useRouter()
  const [isConnected, setIsConnected] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const socket = useRef<Socket | null>(null)

  const getMediaStream = useCallback(async (isTestMode = false) => {
    try {
      if (isTestMode) {
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
        return canvas.captureStream(30)
      }
      return await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
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
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      iceCandidatePoolSize: 10
    })
    
    peerConnectionRef.current = peerConnection

    const pendingCandidates: RTCIceCandidateInit[] = []

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        setIsConnected(true)
        reconnectAttempts = 0
        startVideoChat()
      } else if (['disconnected', 'failed'].includes(peerConnection.connectionState)) {
        setIsConnected(false)
        stopVideoChat()
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++
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

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'failed') {
        peerConnection.restartIce()
      }
    }

    peerConnection.onsignalingstatechange = () => {
      if (peerConnection.signalingState === 'stable') {
        isNegotiating = false
      }
    }

    peerConnection.onnegotiationneeded = async () => {
      try {
        if (isNegotiating) return
        isNegotiating = true
        const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await peerConnection.setLocalDescription(offer)
        socket.emit('offer', offer)
      } catch (error) {
        isNegotiating = false
        console.error('Error during negotiation:', error)
      }
    }

    peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0]
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', event.candidate)
      }
    }

    socket.on('match_found', () => {
      setIsConnected(true)
      setIsSearching(false)
    })

    socket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      try {
        if (isNegotiating) return
        isNegotiating = true
        const stream = await getMediaStream()
        localStreamRef.current = stream
        stream.getTracks().forEach(track => peerConnection.addTrack(track, stream))

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        await peerConnection.setRemoteDescription(offer)

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

        const answer = await peerConnection.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await peerConnection.setLocalDescription(answer)
        socket.emit('answer', answer)
      } catch (error) {
        isNegotiating = false
        console.error('Error handling offer:', error)
      }
    })

    socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      try {
        if (peerConnection.signalingState !== 'have-local-offer') {
          return
        }
        await peerConnection.setRemoteDescription(answer)

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
      if (!peerConnection.remoteDescription) {
        pendingCandidates.push(candidate)
      } else {
        try {
          await peerConnection.addIceCandidate(candidate)
        } catch (error) {
          console.error('Error adding ICE candidate:', error)
        }
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
    }
  }, [getMediaStream, startVideoChat])

  const stopVideoChat = () => {
    setIsConnected(false)
    setIsSearching(false)

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => track.stop())
    }

    localStreamRef.current = null
    remoteStreamRef.current = null
    peerConnectionRef.current = null
  }

  // Mute toggle
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(prev => !prev)
    }
  }

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsVideoOff(prev => !prev)
    }
  }

  return (
    <div className="video-chat-container">
      <div className="video-container">
        <video ref={localVideoRef} autoPlay muted />
        <video ref={remoteVideoRef} autoPlay />
      </div>
      <div className="controls">
        <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
        <button onClick={toggleVideo}>{isVideoOff ? 'Turn Video On' : 'Turn Video Off'}</button>
        <button onClick={startVideoChat}>Start Video Chat</button>
      </div>
    </div>
  )
}
