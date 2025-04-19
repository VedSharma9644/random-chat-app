'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const Page = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isMatched, setIsMatched] = useState(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)

  const servers = {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302',
      },
    ],
  }

  useEffect(() => {
    const newSocket = io('https://random-chat-app-idz3.onrender.com', {
      transports: ['websocket'],
      withCredentials: true,
    })
    setSocket(newSocket)

    // Request a random match
    newSocket.emit('find_match')

    // On successful match
    newSocket.on('match_found', () => {
      console.log('✅ Matched with a peer!')
      setIsMatched(true)
    })

    newSocket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      console.log('📩 Received offer')
      if (!peerConnection.current) createPeerConnection()

      await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peerConnection.current?.createAnswer()
      await peerConnection.current?.setLocalDescription(answer)

      newSocket.emit('answer', answer)
    })

    newSocket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      console.log('📩 Received answer')
      await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(answer))
    })

    newSocket.on('ice_candidate', async (candidate: RTCIceCandidateInit) => {
      console.log('📩 Received ICE candidate')
      try {
        await peerConnection.current?.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('Error adding received ICE candidate', e)
      }
    })

    newSocket.on('partner_disconnected', () => {
      alert('🚫 Your partner disconnected.')
      setIsMatched(false)
      peerConnection.current?.close()
      peerConnection.current = null
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null
      }
    })

    return () => {
      newSocket.disconnect()
    }
  }, [])

  const createPeerConnection = () => {
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
  }

  const startCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }

    createPeerConnection()

    stream.getTracks().forEach((track) => {
      peerConnection.current?.addTrack(track, stream)
    })

    const offer = await peerConnection.current?.createOffer()
    await peerConnection.current?.setLocalDescription(offer)

    socket?.emit('offer', offer)
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Random Video Chat</h1>

      <div className="flex flex-col md:flex-row gap-4">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full md:w-1/2 rounded border" />
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full md:w-1/2 rounded border" />
      </div>

      {isMatched ? (
        <button
          onClick={startCall}
          className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Start Call
        </button>
      ) : (
        <p className="text-gray-600">Waiting for another user to join...</p>
      )}
    </div>
  )
}

export default Page
