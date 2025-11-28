import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const WS_URL = BACKEND_URL.replace(/^http/, "ws");
const API = `${BACKEND_URL}/api`;

const useWebRTC = () => {
  const [connectionState, setConnectionState] = useState("disconnected");
  const [chatMessages, setChatMessages] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const websocketRef = useRef(null);
  const localStreamRef = useRef(null);
  const clientIdRef = useRef(null);
  const iceConfigRef = useRef(null);
  const roomIdRef = useRef(null);

  // Fetch ICE configuration
  const fetchICEConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API}/config`);
      const config = await response.json();
      iceConfigRef.current = config;
      return config;
    } catch (error) {
      console.error("Error fetching ICE config:", error);
      iceConfigRef.current = {
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
      };
      return iceConfigRef.current;
    }
  }, []);

  // Initialize media devices
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (error) {
      console.error("Media access error:", error);
      toast.error("Could not access camera/microphone");
      throw error;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(async () => {
    const config = iceConfigRef.current || {
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
    };

    const peerConnection = new RTCPeerConnection(config);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && websocketRef.current) {
        websocketRef.current.send(
          JSON.stringify({
            type: "ice_candidate",
            candidate: event.candidate
          })
        );
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      if (event.streams && event.streams[0]) {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        setIsConnected(true);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", peerConnection.connectionState);
      setConnectionState(peerConnection.connectionState);

      if (peerConnection.connectionState === "connected") {
        setIsConnected(true);
        toast.success("Connected to stranger!");
      } else if (peerConnection.connectionState === "failed") {
        toast.error("Connection failed");
        closePeerConnection();
      } else if (peerConnection.connectionState === "disconnected") {
        setIsConnected(false);
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, []);

  // Close peer connection
  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setIsConnected(false);
    setChatMessages([]);
    setPeerId(null);
    roomIdRef.current = null;
  }, []);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    clientIdRef.current = `client_${Date.now()}`;
    const ws = new WebSocket(`${WS_URL}/ws/${clientIdRef.current}`);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnectionState("waiting");
      // Request matching
      ws.send(JSON.stringify({ type: "ready", interests: [] }));
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message:", message.type);

      switch (message.type) {
        case "waiting":
          setConnectionState("waiting");
          toast.info("Searching for a stranger...");
          break;

        case "paired":
          console.log("Paired with peer:", message.peer_id);
          setConnectionState("connecting");
          setPeerId(message.peer_id);
          roomIdRef.current = message.room_id;

          // Create offer
          const peerConnection = await createPeerConnection();
          const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await peerConnection.setLocalDescription(offer);
          ws.send(
            JSON.stringify({
              type: "offer",
              sdp: peerConnection.localDescription.toJSON()
            })
          );
          break;

        case "offer":
          console.log("Received offer");
          let pc = peerConnectionRef.current;
          if (!pc) {
            pc = await createPeerConnection();
          }

          const offer_sdp = new RTCSessionDescription(message.sdp);
          await pc.setRemoteDescription(offer_sdp);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(
            JSON.stringify({
              type: "answer",
              sdp: pc.localDescription.toJSON()
            })
          );
          break;

        case "answer":
          console.log("Received answer");
          const answer_sdp = new RTCSessionDescription(message.sdp);
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(answer_sdp);
          }
          break;

        case "ice_candidate":
          console.log("Received ICE candidate");
          if (peerConnectionRef.current && message.candidate) {
            const candidate = new RTCIceCandidate(message.candidate);
            await peerConnectionRef.current.addIceCandidate(candidate);
          }
          break;

        case "chat_message":
          setChatMessages((prev) => [
            ...prev,
            { text: message.message, isOwn: false }
          ]);
          break;

        case "peer_disconnected":
          toast.info("Stranger disconnected");
          closePeerConnection();
          setConnectionState("waiting");
          // Auto-reconnect
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ready", interests: [] }));
            }
          }, 1000);
          break;

        default:
          break;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast.error("Connection error");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      setConnectionState("disconnected");
    };

    websocketRef.current = ws;
  }, [createPeerConnection, closePeerConnection]);

  // Initialize everything
  useEffect(() => {
    const initialize = async () => {
      try {
        await fetchICEConfig();
        await initializeMedia();
        connectWebSocket();
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    // Cleanup
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, [fetchICEConfig, initializeMedia, connectWebSocket]);

  // Send chat message
  const sendChatMessage = useCallback((text) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(
        JSON.stringify({
          type: "chat_message",
          message: text
        })
      );
      setChatMessages((prev) => [...prev, { text, isOwn: true }]);
    }
  }, []);

  // Skip to next stranger
  const skipToNext = useCallback(async () => {
    closePeerConnection();
    setChatMessages([]);
    setConnectionState("waiting");

    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      // Disconnect from current peer
      websocketRef.current.send(JSON.stringify({ type: "disconnect" }));
      // Request new match
      setTimeout(() => {
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.send(JSON.stringify({ type: "ready", interests: [] }));
        }
      }, 500);
    }
  }, [closePeerConnection]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (websocketRef.current) {
      websocketRef.current.send(JSON.stringify({ type: "disconnect" }));
      websocketRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    closePeerConnection();
  }, [closePeerConnection]);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, []);

  return {
    localVideoRef,
    remoteVideoRef,
    connectionState,
    chatMessages,
    sendChatMessage,
    skipToNext,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    isConnected,
    peerId
  };
};

export default useWebRTC;