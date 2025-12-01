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
    try {
      const config = iceConfigRef.current || {
        iceServers: [
          { urls: ["stun:stun.l.google.com:19302"] },
          { urls: ["stun:stun1.l.google.com:19302"] },
          { urls: ["stun:stun2.l.google.com:19302"] }
        ]
      };

      console.log("Creating new peer connection with config:", config);
      const peerConnection = new RTCPeerConnection(config);

      // Add local tracks if they exist
      if (localStreamRef.current) {
        console.log("Adding local tracks to peer connection");
        localStreamRef.current.getTracks().forEach((track) => {
          console.log(`Adding ${track.kind} track to peer connection`);
          peerConnection.addTrack(track, localStreamRef.current);
        });
      }

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        console.log("ICE candidate:", event.candidate);
        if (event.candidate && websocketRef.current?.readyState === WebSocket.OPEN) {
          console.log("Sending ICE candidate:", event.candidate);
          websocketRef.current.send(
            JSON.stringify({
              type: "ice_candidate",
              candidate: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
              }
            })
          );
        } else if (!event.candidate) {
          console.log("No more ICE candidates to gather");
        }
      };

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log("Received remote track:", event.track.kind, event.streams);
        if (event.streams && event.streams[0]) {
          console.log("Setting remote video source");
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setIsConnected(true);
            toast.success("Connected to stranger!");
          }
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log("Connection state changed to:", peerConnection.connectionState);
        setConnectionState(peerConnection.connectionState);

        switch (peerConnection.connectionState) {
          case "connected":
            setIsConnected(true);
            toast.success("Connected to stranger!");
            break;
          case "disconnected":
          case "failed":
            console.error("Connection failed or disconnected");
            setIsConnected(false);
            closePeerConnection();
            // Try to reconnect if WebSocket is still open
            if (websocketRef.current?.readyState === WebSocket.OPEN) {
              websocketRef.current.send(JSON.stringify({ type: "ready", interests: [] }));
            }
            break;
          case "closed":
            setIsConnected(false);
            break;
          default:
            console.log("Connection state:", peerConnection.connectionState);
        }
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === "failed") {
          console.error("ICE connection failed");
          // Try to recover or restart ICE
          peerConnection.restartIce();
        }
      };

      peerConnectionRef.current = peerConnection;
      return peerConnection;
    } catch (error) {
      console.error("Error creating peer connection:", error);
      toast.error("Failed to create connection");
      throw error;
    }
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
          console.log(
            "Paired with peer:",
            message.peer_id,
            "self:",
            clientIdRef.current
          );
          setConnectionState("connecting");
          setPeerId(message.peer_id);
          roomIdRef.current = message.room_id;

          // Decide which side should create the offer to avoid glare
          const isInitiator = clientIdRef.current < message.peer_id;

          if (isInitiator) {
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
          }

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
          console.log("Received ICE candidate:", message.candidate);
          if (peerConnectionRef.current && message.candidate) {
            try {
              const candidate = new RTCIceCandidate({
                candidate: message.candidate.candidate,
                sdpMid: message.candidate.sdpMid,
                sdpMLineIndex: message.candidate.sdpMLineIndex
              });
              await peerConnectionRef.current.addIceCandidate(candidate);
              console.log("Successfully added ICE candidate");
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
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
    let isMounted = true;
    
    const initialize = async () => {
      try {
        console.log("Initializing WebRTC...");
        await fetchICEConfig();
        console.log("ICE config fetched");
        await initializeMedia();
        console.log("Media initialized");
        connectWebSocket();
        console.log("WebSocket connected");
      } catch (error) {
        console.error("Initialization error:", error);
        if (isMounted) {
          toast.error("Failed to initialize: " + error.message);
        }
      }
    };

    // Add a small delay to ensure DOM is ready
    const timer = setTimeout(initialize, 1000);

    // Cleanup
    return () => {
      isMounted = false;
      clearTimeout(timer);
      
      console.log("Cleaning up WebRTC...");
      
      // Stop all media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
      
      // Close peer connection
      if (peerConnectionRef.current) {
        console.log("Closing peer connection");
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Close WebSocket
      if (websocketRef.current) {
        console.log("Closing WebSocket");
        if (websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.close();
        }
        websocketRef.current = null;
      }
      
      // Clear video elements
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
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