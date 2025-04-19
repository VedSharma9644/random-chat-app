'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const Page = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isMatched, setIsMatched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

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
    const newSocket = io('https://random-chat-app-idz3.onrender.com/')
    setSocket(newSocket)

    newSocket.on('matched', () => {
      console.log('✅ Matched with a peer!')
      setIsMatched(true)
    })

    newSocket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      if (!peerConnection.current) createPeerConnection()

      await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peerConnection.current?.createAnswer()
      await peerConnection.current?.setLocalDescription(answer)

      newSocket.emit('answer', answer)
    })

    newSocket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(answer))
    })

    newSocket.on('candidate', async (candidate: RTCIceCandidateInit) => {
      try {
        await peerConnection.current?.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('Error adding received ice candidate', e)
      }
    })

    newSocket.on('partner_disconnected', () => {
      alert('The other user disconnected.')
      endCall()
    })

    return () => {
      newSocket.disconnect()
    }
  }, [])

  const createPeerConnection = () => {
    peerConnection.current = new RTCPeerConnection(servers)

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('candidate', event.candidate)
      }
    }

    peerConnection.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
    }
  }

  const startSearch = () => {
    if (socket) {
      setIsSearching(true)
      socket.emit('find_match')
    }
  }

  const startCall = async () => {
    const userStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    setStream(userStream)

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = userStream
    }

    createPeerConnection()

    userStream.getTracks().forEach((track) => {
      peerConnection.current?.addTrack(track, userStream)
    })

    const offer = await peerConnection.current?.createOffer()
    await peerConnection.current?.setLocalDescription(offer)

    socket?.emit('offer', offer)
  }

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsMuted((prev) => !prev)
    }
  }

  const endCall = () => {
    peerConnection.current?.close()
    peerConnection.current = null
    setIsMatched(false)
    setIsSearching(false)
    setIsMuted(false)

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    stream?.getTracks().forEach((track) => track.stop())
    setStream(null)
  }

  return (
    <div className="p-4 space-y-4">
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

      {isSearching && !isMatched && (
        <p className="text-gray-600">Searching for a partner...</p>
      )}

      {isMatched && (
        <div className="space-x-2 mt-4">
          <button
            onClick={startCall}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Start Call
          </button>
          <button
            onClick={toggleMute}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            onClick={endCall}
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
