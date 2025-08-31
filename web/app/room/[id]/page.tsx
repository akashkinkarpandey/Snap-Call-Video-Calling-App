'use client';

import { FC, useEffect, useRef, useCallback, useState, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { Socket, io } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Camera, CameraOff, ScreenShare, Copy, Users, Wifi } from 'lucide-react';
import { toast } from 'sonner';

type Message = {
  description: RTCSessionDescription;
  candidate: RTCIceCandidate;
};

function handleGetUserMediaError(error: Error) {
  switch (error.name) {
    case 'NotAllowedError':
      toast.error('Permission denied: Please allow access to camera/microphone.');
      break;
    case 'NotFoundError':
      toast.error('No camera/microphone found on this device.');
      break;
    case 'NotReadableError':
      toast.error(
        'Could not access your media devices. They may be in use by another application.'
      );
      break;
    case 'OverconstrainedError':
      toast.error(`Constraints cannot be satisfied by available devices.`);
      break;
    case 'AbortError':
      toast.error('Media capture was aborted.');
      break;
    default:
      toast.error('An unknown error occurred while trying to access media devices.');
  }
}

const Page: FC<{ params: Promise<{ id: string }> }> = ({ params }) => {
  const { id } = use(params);
  const router = useRouter();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const id2ContentRef = useRef(new Map<string, string>());

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const makingOfferRef = useRef<boolean>(false);
  const ignoreOfferRef = useRef<boolean>(false);
  const politeRef = useRef<boolean>(false);

  const [mic, setMic] = useState<boolean>(true);
  const [camera, setCamera] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  const config: RTCConfiguration = useMemo(() => {
    return {
      iceServers: [
        {
          urls: [
            'stun:fr-turn3.xirsys.com',
            'stun:stun1.l.google.com:19302',
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun3.l.google.com:19302',
            'stun:stun4.l.google.com:19302'
          ]
        },
        {
          urls: 'stun:global.stun.twilio.com:3478'
        },
        {
          username: 'dc2d2894d5a9023620c467b0e71cfa6a35457e6679785ed6ae9856fe5bdfa269',
          credential: 'tE2DajzSJwnsSbc123',
          urls: 'turn:global.turn.twilio.com:3478?transport=udp'
        },
        {
          username: 'dc2d2894d5a9023620c467b0e71cfa6a35457e6679785ed6ae9856fe5bdfa269',
          credential: 'tE2DajzSJwnsSbc123',
          urls: 'turn:global.turn.twilio.com:3478?transport=tcp'
        },
        {
          username: 'dc2d2894d5a9023620c467b0e71cfa6a35457e6679785ed6ae9856fe5bdfa269',
          credential: 'tE2DajzSJwnsSbc123',
          urls: 'turn:global.turn.twilio.com:443?transport=tcp'
        }
      ]
    };
  }, []);

  const handleNegotiationNeeded = useCallback(async () => {
    try {
      makingOfferRef.current = true;
      await pcRef.current?.setLocalDescription();

      socketRef.current?.emit('message', { description: pcRef.current?.localDescription }, id);
    } catch (e) {
      console.log(e);
    } finally {
      makingOfferRef.current = false;
    }
  }, [id]);

  const handleTrack = useCallback(({ track, streams: [stream] }: RTCTrackEvent) => {
    const content = id2ContentRef.current.get(stream.id);

    if (content === 'screen') {
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
      setIsScreenSharing(true);
    } else if (content === 'webcam') {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setIsConnected(true);
    }
  }, []);

  const handleICECandidate = useCallback(
    (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate) {
        socketRef.current?.emit('message', { candidate: e.candidate }, id);
      }
    },
    [id]
  );

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection(config);

    pc.onnegotiationneeded = handleNegotiationNeeded;
    pc.ontrack = handleTrack;
    pc.onicecandidate = handleICECandidate;

    return pc;
  }, [config, handleNegotiationNeeded, handleTrack, handleICECandidate]);

  const getUserMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      id2ContentRef.current.set(stream.id, 'webcam');

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;
    } catch (error) {
      handleGetUserMediaError(error as Error);
    }
  }, []);

  const handlePeerMessage = useCallback(
    async ({ description, candidate }: Message) => {
      try {
        if (description) {
          const offerCollision =
            description.type == 'offer' &&
            (makingOfferRef.current || pcRef.current?.signalingState !== 'stable');

          ignoreOfferRef.current = !politeRef.current && offerCollision;
          if (ignoreOfferRef.current) {
            return;
          }

          await pcRef.current?.setRemoteDescription(description);

          if (description.type === 'offer') {
            await pcRef.current?.setLocalDescription();
            socketRef.current?.emit(
              'message',
              { description: pcRef.current?.localDescription },
              id
            );
          }
        } else if (candidate) {
          try {
            await pcRef.current?.addIceCandidate(candidate);
          } catch (err) {
            if (!ignoreOfferRef) {
              throw err;
            }
          }
        }
      } catch (err) {
        console.log(err);
      }
    },
    [id]
  );

  const addTracksToPC = useCallback((pc: RTCPeerConnection) => {
    localStreamRef.current
      ?.getTracks()
      .forEach((track) => pc.addTrack(track, localStreamRef.current!));
  }, []);

  useEffect(() => {
    const socket = io('https://streammate-signalling-server.onrender.com');
    console.log('socket', socket);
    socket.emit('room-join', id);

    socket.on('room-created', async () => {
      await getUserMedia();
    });

    socket.on('room-joined', async () => {
      politeRef.current = true;

      const pc = createPeer();
      await getUserMedia();
      addTracksToPC(pc);

      socket.emit('ready', id);
      socket.emit('id2Content', Array.from(id2ContentRef.current), id);
      pcRef.current = pc;
    });

    socket.on('room-full', () => {
      router.push('/');
    });

    socket.on('ready', () => {
      const pc = createPeer();
      addTracksToPC(pc);

      socket.emit('id2Content', Array.from(id2ContentRef.current), id);
      pcRef.current = pc;
    });

    socket.on('id2Content', (data: Array<[string, string]>) => {
      const map = new Map(data);
      map.forEach((value, key) => {
        id2ContentRef.current.set(key, value);
      });
    });

    socket.on('message', handlePeerMessage);

    socket.on('user-disconnected', () => {
      politeRef.current = false;
      setIsConnected(false);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      pcRef.current?.close();
      socketRef.current = null;
      pcRef.current = null;
    };
  }, [id, router, createPeer, getUserMedia, handlePeerMessage, addTracksToPC]);

  const toggleMediaStream = useCallback((type: string, state: boolean) => {
    localStreamRef.current?.getTracks().forEach((track) => {
      if (track.kind === type) {
        track.enabled = !state;
      }
    });
  }, []);

  const toggleMic = useCallback(() => {
    toggleMediaStream('audio', mic);
    setMic((mic) => !mic);
  }, [toggleMediaStream, mic]);

  const toggleCam = useCallback(() => {
    toggleMediaStream('video', camera);
    setCamera((camera) => !camera);
  }, [toggleMediaStream, camera]);

  const handleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (error) {
      toast.error('Screen share cancelled or not allowed.');
      return;
    }

    id2ContentRef.current.set(stream.id, 'screen');
    socketRef.current?.emit('id2Content', Array.from(id2ContentRef.current), id);

    // Replace video track if already sending webcam
    const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
    if (videoSender) {
      videoSender.replaceTrack(stream.getVideoTracks()[0]);
    } else {
      stream.getTracks().forEach((track) => pcRef.current?.addTrack(track, stream));
    }

    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = stream;
      screenVideoRef.current.muted = true;
    }

    setIsScreenSharing(true);

    // Handle user clicking "Stop sharing" in browser UI
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreenShare();
    });
  }, [id, isScreenSharing]);


  const stopScreenShare = useCallback(() => {
    const screenStream = screenVideoRef.current?.srcObject as MediaStream;
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }

    // Restore webcam track
    const webcamTrack = localStreamRef.current?.getVideoTracks()[0];
    if (webcamTrack) {
      const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        videoSender.replaceTrack(webcamTrack);
      }
    }

    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }

    setIsScreenSharing(false);

    // Clean up id2Content mapping
    const streamId = Array.from(id2ContentRef.current.entries()).find(
      ([_, content]) => content === 'screen'
    )?.[0];
    if (streamId) {
      id2ContentRef.current.delete(streamId);
      socketRef.current?.emit('id2Content', Array.from(id2ContentRef.current), id);
    }

    toast.success('Screen sharing stopped');
  }, [id]);


  const copyRoomLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Room link copied to clipboard!');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Header Section */}
      <div className="relative z-10 p-6 border-b border-white/10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Logo and Title */}
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                <Camera className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                  StreamMate Conference
                </h1>
                <p className="text-gray-300 text-sm">
                  Share the <span className="text-red-400 font-semibold">room link</span> with your
                  friend to start the call
                </p>
              </div>
            </div>

            {/* Status and Actions */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20">
                <Users className="w-4 h-4 text-emerald-400" />
                <span className="text-white text-sm font-medium">{isConnected ? '2' : '1'}</span>
              </div>

              <div
                className={`flex items-center space-x-2 backdrop-blur-sm rounded-full px-4 py-2 border ${
                  isConnected
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                }`}>
                <Wifi className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {isConnected ? 'Connected' : 'Waiting...'}
                </span>
              </div>

              <button
                onClick={copyRoomLink}
                className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105 shadow-lg">
                <Copy className="w-4 h-4" />
                <span>Copy Link</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 p-6">
        <div className="max-w-7xl mx-auto h-full">
          {/* Video Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-240px)]">
            {/* Side Panel - Local & Remote Videos */}
            <div className="lg:col-span-3 space-y-4 h-full">
              {/* Local Video */}
              <div className="relative group h-1/2">
                <div className="absolute top-3 left-3 z-10 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg">
                  You
                </div>

                {/* Status Indicators */}
                <div className="absolute top-3 right-3 z-10 flex space-x-1">
                  {!mic && (
                    <div className="bg-red-500 p-1.5 rounded-full shadow-lg">
                      <MicOff className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {!camera && (
                    <div className="bg-red-500 p-1.5 rounded-full shadow-lg">
                      <CameraOff className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                <video
                  autoPlay
                  ref={localVideoRef}
                  muted
                  className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/20 object-cover shadow-2xl"
                />

                {!camera && (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center border border-white/20">
                    <div className="text-center text-gray-400">
                      <CameraOff className="w-10 h-10 mx-auto mb-2" />
                      <p className="text-sm font-medium">Camera Off</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Remote Video */}
              <div className="relative h-1/2">
                <div className="absolute top-3 left-3 z-10 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg">
                  {isConnected ? 'Friend' : 'Waiting...'}
                </div>

                <video
                  autoPlay
                  ref={remoteVideoRef}
                  className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/20 object-cover shadow-2xl"
                />

                {!isConnected && (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center border border-white/20">
                    <div className="text-center text-gray-400">
                      <Users className="w-10 h-10 mx-auto mb-2 animate-pulse" />
                      <p className="text-sm font-medium">Waiting for friend...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Screen Share Area */}
            <div className="lg:col-span-9 h-full">
              <div className="relative bg-black/20 backdrop-blur-sm rounded-2xl border border-white/20 shadow-2xl overflow-hidden h-full">
                <video
                  ref={screenVideoRef}
                  autoPlay
                  className="w-full h-full object-contain bg-gradient-to-br from-gray-900 to-black"
                />

                {/* Screen Share Placeholder */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-gray-500">
                    <ScreenShare className="w-20 h-20 mx-auto mb-4 opacity-30" />
                    <p className="text-xl font-medium mb-2">Screen Share Area</p>
                    <p className="text-sm opacity-70">
                      Start screen sharing to display content here
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Control Panel */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-30">
        <div className="bg-black/40 backdrop-blur-xl rounded-3xl border border-white/20 p-5 shadow-2xl">
          <div className="flex items-center space-x-4">
            {/* Microphone Toggle */}
            <Button
              variant={mic ? 'default' : 'destructive'}
              size="lg"
              onClick={toggleMic}
              className={`rounded-2xl h-16 w-16 p-0 transition-all duration-300 hover:scale-110 shadow-xl ${
                mic
                  ? 'bg-white/20 hover:bg-white/30 text-white border-2 border-white/30'
                  : 'bg-red-500 hover:bg-red-600 text-white border-2 border-red-400'
              }`}>
              {mic ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </Button>

            {/* Camera Toggle */}
            <Button
              variant={camera ? 'default' : 'destructive'}
              size="lg"
              onClick={toggleCam}
              className={`rounded-2xl h-16 w-16 p-0 transition-all duration-300 hover:scale-110 shadow-xl ${
                camera
                  ? 'bg-white/20 hover:bg-white/30 text-white border-2 border-white/30'
                  : 'bg-red-500 hover:bg-red-600 text-white border-2 border-red-400'
              }`}>
              {camera ? <Camera className="w-6 h-6" /> : <CameraOff className="w-6 h-6" />}
            </Button>

            {/* Screen Share Toggle */}
            <Button
              variant="outline"
              size="lg"
              onClick={isScreenSharing ? stopScreenShare : handleScreenShare}
              className="rounded-2xl h-16 w-16 p-0 transition-all duration-300 hover:scale-110 shadow-xl bg-white/20 hover:bg-white/30 text-white border-2 border-white/30">
              {isScreenSharing ? (
                <ScreenShare className="w-6 h-6 text-red-400" /> // red when active
              ) : (
                <ScreenShare className="w-6 h-6" />
              )}
            </Button>

            {/* Separator */}
            <div className="w-px h-10 bg-white/30"></div>

            {/* Additional Controls */}
            <div className="flex items-center space-x-2">
              <div className="text-white text-sm font-medium bg-white/10 px-3 py-2 rounded-full border border-white/20">
                Room: {id.slice(0, 8)}...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;
